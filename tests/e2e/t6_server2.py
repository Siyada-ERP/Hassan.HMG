import asyncio, os, json, subprocess, tempfile, time, re, glob, shutil, urllib.request
from playwright.async_api import async_playwright
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); PORT = 3912; URL = 'http://127.0.0.1:%d/' % PORT; SHOTS = BASE + '/tests/e2e/shots'
fails = []
def check(name, got, exp, tol=0.005):
    ok = abs(got - exp) <= tol if isinstance(exp, (int, float)) and not isinstance(exp, bool) and isinstance(got, (int, float)) else got == exp
    print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got)[:120] + ' exp=' + str(exp)[:120])
    if not ok: fails.append(name)
async def wait_for(page, expr, timeout=8000, step=150):
    t = 0
    while t < timeout:
        try:
            if await page.evaluate(expr): return True
        except Exception: pass
        await page.wait_for_timeout(step); t += step
    return False
async def go(page, h): await page.evaluate("h => { location.hash = h }", '#/' + h)
async def mk(browser, vp=None):
    ctx = await browser.new_context(viewport=vp or {'width': 1366, 'height': 850}, locale='ar-EG'); page = await ctx.new_page(); page.errs = []
    page.on('pageerror', lambda e: page.errs.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: page.errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    return ctx, page

async def main():
    tmp = tempfile.mkdtemp(prefix='sy6-')
    env = dict(os.environ, DATA_DIR=tmp, PORT=str(PORT), HOST='127.0.0.1', LONGPOLL_MS='6000')
    srv = subprocess.Popen(['node', BASE + '/server/server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(URL + 'healthz', timeout=1); break
            except Exception: time.sleep(0.2)
        async with async_playwright() as p:
            b = await p.chromium.launch()
            # reference totals from the offline file version
            ctx0, L = await mk(b); await L.goto('file://' + BASE + '/dist/SIYADA.html'); await L.wait_for_selector('#suCo'); await L.fill('#suCo', 'مرجع')
            await L.set_input_files('#suFiles', sorted(glob.glob(BASE + '/tests/fixtures/clean/*.csv'))); await L.click('text=استيراد وابدأ'); await L.wait_for_selector('#app'); await L.wait_for_timeout(500)
            ref = await L.evaluate("JSON.stringify(APP.totals())"); refN = await L.evaluate("APP.S.transactions.length"); refE = await L.evaluate("APP.R.counts.entries")
            check('offline mode untouched by net layer', await L.evaluate("APP.net.on"), False)
            print('reference', ref[:100], refN, refE)
            # ---- server: register + import big data
            ctxA, A = await mk(b)
            await A.goto(URL); await A.wait_for_selector('#auEmail'); await A.click('text=إنشاء حساب وشركة جديدة'); await A.fill('#auCo', 'شركة النور'); await A.fill('#auEmail', 'big@t.com'); await A.fill('#auPw', 'Big#123456'); await A.fill('#auPw2', 'Big#123456'); await A.click('#auMain'); await A.wait_for_selector('#suCo')
            await A.set_input_files('#suFiles', sorted(glob.glob(BASE + '/tests/fixtures/clean/*.csv')))
            t0 = time.time(); await A.click('text=استيراد وابدأ'); await A.wait_for_selector('#app', timeout=60000); await A.wait_for_timeout(800)
            print('import+restore secs: %.2f' % (time.time() - t0))
            check('server import tx count', await A.evaluate("APP.S.transactions.length"), refN)
            check('server import totals == offline', await A.evaluate("JSON.stringify(APP.totals())"), ref)
            check('server import entries', await A.evaluate("APP.R.counts.entries"), refE)
            check('A idle after import', await wait_for(A, "!APP.net.dirty && !APP.net.pushing", 10000), True)
            # second user in same company loads big snapshot
            res = await A.evaluate("APP.net.api('POST','/api/c/'+APP.net.cid+'/invite',{email:'two@t.com',role:'accountant'})"); link = res['link']
            ctxB, B = await mk(b); t0 = time.time(); await B.goto(link); await B.wait_for_selector('#auPw'); await B.fill('#auPw', 'Two#123456'); await B.fill('#auPw2', 'Two#123456'); await B.click('#auMain'); await B.wait_for_selector('#app', timeout=60000)
            print('B snapshot load secs: %.2f' % (time.time() - t0))
            check('B totals == offline', await B.evaluate("JSON.stringify(APP.totals())"), ref)
            check('B journal numbers == A', await B.evaluate("APP.S.transactions.map(t => t.id + ':' + t.jno).sort().join(',')") == await A.evaluate("APP.S.transactions.map(t => t.id + ':' + t.jno).sort().join(',')"), True)
            # latency of one invoice with 3000+ tx
            await go(A, 'customers'); await A.wait_for_timeout(300)
            code = await A.evaluate("APP.S.parties.find(p => p.type === 'عميل').code + ' - ' + APP.S.parties.find(p => p.type === 'عميل').name"); item = await A.evaluate("APP.S.items[0].code + ' - ' + APP.S.items[0].name")
            await go(A, 'sale'); await A.wait_for_selector('#frm'); await A.fill('#fD', '2026-10-20'); await A.fill('#fP', code)
            r = A.locator('#lnBody tr').nth(0); await r.locator('.li').fill(item); await r.locator('.lq').fill('1'); await r.locator('.lp').fill('10')
            t0 = time.time(); await A.click('[data-act="saveDoc"]'); await A.wait_for_timeout(600)
            if await A.locator('#cfOk').count(): await A.click('#cfOk')
            await A.wait_for_selector('.sig', timeout=8000); t_commit = time.time() - t0
            ok = await wait_for(A, "!APP.net.dirty && !APP.net.pushing && !APP.net.stale", 8000); t_sync = time.time() - t0
            print('save->screen %.2fs, save->synced %.2fs' % (t_commit, t_sync))
            check('B gets big-company invoice', await wait_for(B, "APP.S.transactions.length === %d" % (refN + 1), 8000), True)
            check('both totals equal', await A.evaluate("JSON.stringify(APP.totals())"), await B.evaluate("JSON.stringify(APP.totals())"))
            # ---- expired session handling
            ctxA2, A2 = await mk(b); await A2.goto(URL); await A2.wait_for_selector('#auEmail'); await A2.fill('#auEmail', 'big@t.com'); await A2.fill('#auPw', 'Big#123456'); await A2.click('#auMain'); await A2.wait_for_selector('#app', timeout=60000)
            await A2.evaluate("APP.net.api('POST','/api/logout-others',{})"); await A2.wait_for_timeout(300)
            await go(A, 'expense'); await A.wait_for_selector('#frm'); await A.fill('#fD', '2026-10-21'); await A.select_option('#fCat', index=1); await A.fill('#fAmt', '5'); await A.click('[data-act="saveDoc"]')
            check('A shows login after session killed', await wait_for(A, "!!document.querySelector('#auEmail')", 10000), True)
            check('login message', 'انتهت الجلسة' in await A.inner_text('#auErr'), True)
            await A.screenshot(path=SHOTS + '/s11_expired.png')
            # ---- forgot / reset through the UI
            await A.click('text=نسيت كلمة المرور؟'); await A.fill('#auEmail', 'big@t.com'); await A.click('#auMain'); await A.wait_for_timeout(900)
            check('forgot confirmation', 'هيوصله' in await A.inner_text('#auErr'), True)
            mails = glob.glob(tmp + '/outbox/*big@t.com*'); mails.sort(); txt = open(mails[-1], encoding='utf8').read(); rl = re.search(r'(http://\S+\?reset=\S+)', txt).group(1)
            await A.goto(rl); await A.wait_for_selector('#auPw'); await A.fill('#auPw', 'NewBig#98765'); await A.fill('#auPw2', 'NewBig#98765'); await A.click('#auMain'); await A.wait_for_timeout(700)
            check('reset done screen', 'اتغيرت كلمة المرور' in await A.inner_text('.sub'), True)
            await A.click('#auMain'); await A.fill('#auEmail', 'big@t.com'); await A.fill('#auPw', 'NewBig#98765'); await A.click('#auMain'); await A.wait_for_selector('#app', timeout=60000)
            check('login after reset: data intact', await A.evaluate("APP.S.transactions.length"), refN + 1)
            check('reset link not reusable', (await A.evaluate("fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'siyada'},body:JSON.stringify({token:'%s',password:'Another#12345'})}).then(r => r.status)" % rl.split('reset=')[1])), 400)
            # ---- mobile screenshots
            ctxM, M = await mk(b, {'width': 390, 'height': 800}); await M.goto(URL); await M.wait_for_selector('#auEmail'); await M.screenshot(path=SHOTS + '/s12_mobile_login.png')
            await M.fill('#auEmail', 'big@t.com'); await M.fill('#auPw', 'NewBig#98765'); await M.click('#auMain'); await M.wait_for_selector('#app', timeout=60000); await M.wait_for_timeout(600); await M.screenshot(path=SHOTS + '/s13_mobile_app.png')
            await go(M, 'team'); await M.wait_for_selector('#tmEmail'); await M.screenshot(path=SHOTS + '/s14_mobile_team.png', full_page=True)
            sw = await M.evaluate("document.documentElement.scrollWidth"); check('mobile team no horizontal scroll', sw <= 392, True)
            await A.screenshot(path=SHOTS + '/s15_big_dash.png')
            for pg, n in ((A, 'A'), (B, 'B'), (A2, 'A2'), (M, 'M')):
                if pg.errs: print(n, 'ERRORS', pg.errs[:4])
            await b.close()
        print('FAILS:', fails)
    finally:
        srv.terminate()
        try: print(srv.communicate(timeout=5)[0][-600:])
        except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True)
asyncio.run(main())
