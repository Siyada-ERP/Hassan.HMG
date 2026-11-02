import asyncio, os, json, subprocess, tempfile, time, re, sys, shutil
from playwright.async_api import async_playwright

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3911
URL = 'http://127.0.0.1:%d/' % PORT
SHOTS = BASE + '/tests/e2e/shots'
fails = []
def check(name, got, exp, tol=0.005):
    ok = abs(got - exp) <= tol if isinstance(exp, (int, float)) and not isinstance(exp, bool) and isinstance(got, (int, float)) else got == exp
    print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got) + ' exp=' + str(exp))
    if not ok: fails.append(name)

async def wait_for(page, expr, timeout=8000, step=150):
    t = 0
    while t < timeout:
        try:
            if await page.evaluate(expr): return True
        except Exception: pass
        await page.wait_for_timeout(step); t += step
    return False

async def new_user(browser, name):
    ctx = await browser.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG')
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.errs = errs; page.nm = name
    return ctx, page

async def dismiss(page):
    if await page.locator('#alOk').count():
        print('  [alert on', page.nm + ']', (await page.inner_text('#modal'))[:90].replace('\n', ' ')); await page.click('#alOk'); await page.wait_for_timeout(200)

async def go(page, h): await page.evaluate("h => { location.hash = h }", '#/' + h)

async def add_customer(page, name):
    await go(page, 'customers'); await page.click('text=+ عميل جديد'); await page.fill('#pfName', name); await page.click('#pfOk'); await page.wait_for_timeout(300)

async def sale(page, party, qty, date='2025-06-10'):
    await go(page, 'sale'); await page.wait_for_selector('#frm'); await page.fill('#fD', date); await page.fill('#fP', party)
    r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-001 - سكر'); await r.locator('.lq').fill(str(qty)); await r.locator('.lp').fill('20')
    await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(200)

async def main():
    tmp = tempfile.mkdtemp(prefix='sy5-')
    env = dict(os.environ, DATA_DIR=tmp, PORT=str(PORT), HOST='127.0.0.1', ADMIN_EMAIL='owner@t.com', LONGPOLL_MS='8000')
    srv = subprocess.Popen(['node', BASE + '/server/server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        for _ in range(50):
            try:
                import urllib.request; urllib.request.urlopen(URL + 'healthz', timeout=1); break
            except Exception: time.sleep(0.2)
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctxA, A = await new_user(b, 'A')
            # ---------- 1) register owner
            await A.goto(URL); await A.wait_for_selector('#auEmail')
            await A.screenshot(path=SHOTS + '/s1_login.png')
            await A.click('text=إنشاء حساب وشركة جديدة'); await A.wait_for_selector('#auCo')
            await A.fill('#auCo', 'شركة النور للتجارة'); await A.fill('#auEmail', 'owner@t.com'); await A.fill('#auPw', 'Secret#1234'); await A.fill('#auPw2', 'Secret#1234')
            await A.screenshot(path=SHOTS + '/s2_register.png')
            await A.click('#auMain'); await A.wait_for_selector('#suCo')
            check('company prefilled in wizard', await A.input_value('#suCo'), 'شركة النور للتجارة')
            await A.click('text=ابدأ بدفاتر جديدة'); await A.wait_for_selector('#app'); await A.wait_for_timeout(600)
            check('role owner', await A.evaluate('APP.net.role'), 'owner')
            check('brand shows company', (await A.inner_text('#brand')).split('\n')[0], 'شركة النور للتجارة')
            check('settings synced', await A.evaluate("APP.net.api('GET','/api/c/'+APP.net.cid+'/snapshot').then(s => s.records.settings[0].data.company)"), 'شركة النور للتجارة')
            check('coa synced', await A.evaluate("APP.net.api('GET','/api/c/'+APP.net.cid+'/snapshot').then(s => s.records.coa.length)"), 32)
            await A.screenshot(path=SHOTS + '/s3_dash.png')
            # ---------- 2) data by owner
            await add_customer(A, 'عميل أ')
            await go(A, 'items'); await A.click('text=+ صنف جديد'); await A.fill('#ifName', 'سكر'); await A.fill('#ifUnit', 'كجم'); await A.click('#ifOk'); await A.wait_for_timeout(300)
            await go(A, 'purchase'); await A.wait_for_selector('#frm')
            await go(A, 'suppliers'); await A.click('text=+ مورد جديد'); await A.fill('#pfName', 'مورد'); await A.click('#pfOk'); await A.wait_for_timeout(300)
            await go(A, 'purchase'); await A.wait_for_selector('#frm'); await A.fill('#fD', '2025-03-01'); await A.fill('#fP', 'R-001 - مورد')
            r = A.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-001 - سكر'); await r.locator('.lq').fill('500'); await r.locator('.lp').fill('10')
            await A.click('[data-act="saveDoc"]'); await A.wait_for_selector('.sig'); await A.wait_for_timeout(300)
            await sale(A, 'C-001 - عميل أ', 10)
            first_doc = await A.evaluate("APP.S.transactions.filter(t => t.type === 'بيع')[0].doc")
            print('first sale doc', first_doc)
            check('A receivable', await A.evaluate("APP.bal('1201')"), 200)
            check('A saved state', await wait_for(A, "APP.net.stateKey === 'ok' && !APP.net.dirty"), True)
            # ---------- 3) team invite (accountant)
            await go(A, 'team'); await A.wait_for_selector('#tmEmail')
            await A.fill('#tmEmail', 'acc@t.com'); await A.select_option('#tmRoleNew', 'accountant'); await A.click('[data-act="tmInvite"]'); await A.wait_for_selector('#tmLink')
            link_acc = await A.input_value('#tmLink'); print('invite link', link_acc[:60])
            await A.screenshot(path=SHOTS + '/s4_team.png')
            await A.fill('#tmEmail', 'view@t.com'); await A.select_option('#tmRoleNew', 'viewer'); await A.click('[data-act="tmInvite"]'); await A.wait_for_timeout(500)
            link_view = await A.input_value('#tmLink')
            # ---------- 4) accountant joins via invite
            ctxB, B = await new_user(b, 'B')
            await B.goto(link_acc); await B.wait_for_selector('#auPw'); check('invite email locked', await B.input_value('#auEmail'), 'acc@t.com')
            await B.screenshot(path=SHOTS + '/s5_invite.png')
            await B.fill('#auPw', 'Acc#12345'); await B.fill('#auPw2', 'Acc#12345'); await B.click('#auMain'); await B.wait_for_selector('#app'); await B.wait_for_timeout(500)
            check('B role', await B.evaluate('APP.net.role'), 'accountant')
            check('B sees A data', await B.evaluate("APP.bal('1201')"), 200)
            check('B customers', await B.evaluate("APP.S.parties.length"), 2)
            check('B sees company name', await B.evaluate("APP.S.settings.company"), 'شركة النور للتجارة')
            # ---------- 5) live sync B -> A
            await go(B, 'receipt'); await B.wait_for_selector('#frm'); await B.fill('#fD', '2025-06-12'); await B.fill('#fP', 'C-001 - عميل أ'); await B.fill('#fAmt', '50'); await B.click('[data-act="saveDoc"]'); await B.wait_for_selector('.sig')
            check('A receives B receipt live', await wait_for(A, "APP.bal('1201') === 150", 6000), True)
            check('A tx count == B tx count', await A.evaluate("APP.S.transactions.length"), await B.evaluate("APP.S.transactions.length"))
            # ---------- 5b) employee sheets sync (new collection) + pieces column
            await go(A, 'emps'); await A.wait_for_selector('[data-act="empNew"]'); await A.click('[data-act="empNew"]'); await A.fill('#emN', 'موظف متزامن'); await A.fill('#emS', '3000'); await A.click('#emOk')
            check('B receives employee live', await wait_for(B, "APP.S.employees && APP.S.employees.length === 1 && APP.S.employees[0].salary === 3000", 6000), True)
            await go(B, 'empadv'); await B.wait_for_selector('#aE'); await B.select_option('#aE', 'E-01'); await B.fill('#fAmt', '250'); await B.click('[data-act="saveAdv"]')
            check('A receives advance live (1202 = 250)', await wait_for(A, "APP.bal('1202') === 250", 6000), True)
            check('A sees employee balance', await A.evaluate("APP.R.journal.filter(l => l.acc === '1202' && l.pc === 'E-01').length"), 1)
            await go(A, 'sale'); await A.wait_for_selector('#frm'); await A.fill('#fP', 'C-001 - عميل أ')
            r = A.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-001 - سكر'); await r.locator('.lc').fill('7'); await r.locator('.lq').fill('2'); await r.locator('.lp').fill('20'); await A.click('[data-act="saveDoc"]'); await A.wait_for_selector('.sig')
            check('B receives tx with pieces', await wait_for(B, "APP.S.transactions.some(t => t.pieces === 7)", 6000), True)
            await go(A, 'emps'); await A.wait_for_selector('[data-act="empEdit"]'); await A.locator('[data-act="empEdit"]').first.click(); await A.fill('#emS', '3500'); await A.click('#emOk')
            check('B receives employee edit', await wait_for(B, "APP.S.employees[0].salary === 3500", 6000), True)
            # ---------- 6) concurrent creation: same doc number + same new customer code
            await go(A, 'customers'); await go(B, 'customers'); await A.wait_for_timeout(300)
            await A.click('text=+ عميل جديد'); await B.click('text=+ عميل جديد'); await A.fill('#pfName', 'عميل متزامن ١'); await B.fill('#pfName', 'عميل متزامن ٢')
            await asyncio.gather(A.click('#pfOk'), B.click('#pfOk'))
            await A.wait_for_timeout(1500)
            check('both customers exist on A', await wait_for(A, "APP.S.parties.filter(p => p.name.startsWith('عميل متزامن')).length === 2", 6000), True)
            check('both customers exist on B', await wait_for(B, "APP.S.parties.filter(p => p.name.startsWith('عميل متزامن')).length === 2", 6000), True)
            codesA = await A.evaluate("APP.S.parties.map(p => p.code).sort().join(',')"); codesB = await B.evaluate("APP.S.parties.map(p => p.code).sort().join(',')")
            check('same codes on both', codesA, codesB); print('codes', codesA)
            check('codes unique', len(set(codesA.split(','))), len(codesA.split(',')))
            # simultaneous invoices with same auto number
            async def mk(page, who, q):
                await go(page, 'sale'); await page.wait_for_selector('#frm'); await page.fill('#fD', '2025-06-15'); await page.fill('#fP', 'C-001 - عميل أ')
                r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-001 - سكر'); await r.locator('.lq').fill(str(q)); await r.locator('.lp').fill('20')
            await mk(A, 'A', 1); await mk(B, 'B', 2)
            docA = await A.input_value('#fDoc') if await A.locator('#fDoc').count() else ''
            print('doc fields', docA)
            await asyncio.gather(A.click('[data-act="saveDoc"]'), B.click('[data-act="saveDoc"]'))
            await A.wait_for_selector('.sig'); await B.wait_for_selector('.sig'); await A.wait_for_timeout(2500)
            check('A settled', await wait_for(A, "!APP.net.dirty && !APP.net.pushing", 8000), True); check('B settled', await wait_for(B, "!APP.net.dirty && !APP.net.pushing", 8000), True)
            await A.wait_for_timeout(1500); await dismiss(A); await dismiss(B)
            docsA = await A.evaluate("JSON.stringify(APP.S.transactions.filter(t => t.type === 'بيع').map(t => [t.doc, t.qty]).sort())"); docsB = await B.evaluate("JSON.stringify(APP.S.transactions.filter(t => t.type === 'بيع').map(t => [t.doc, t.qty]).sort())")
            print('sale docs A', docsA); print('sale docs B', docsB)
            check('sale docs identical', docsA, docsB)
            check('4 sale docs distinct (3 + the pieces test sale)', len(set(d[0] for d in json.loads(docsA))), 4)
            jA = await A.evaluate("JSON.stringify(APP.R.journal.map(l => l.en).filter((v, i, a) => a.indexOf(v) === i).length)"); 
            check('journal entries equal', jA, await B.evaluate("JSON.stringify(APP.R.journal.map(l => l.en).filter((v, i, a) => a.indexOf(v) === i).length)"))
            jnoA = await A.evaluate("APP.S.transactions.map(t => t.id + ':' + t.jno).sort().join(',')"); jnoB = await B.evaluate("APP.S.transactions.map(t => t.id + ':' + t.jno).sort().join(',')")
            check('jno identical across users', jnoA, jnoB)
            jn = [x.split(':')[1] for x in jnoA.split(',')]; check('jno unique', len(set(jn)), len(jn))
            check('totals equal', await A.evaluate("JSON.stringify(APP.totals())"), await B.evaluate("JSON.stringify(APP.totals())"))
            check('A checks ok', await A.evaluate("APP.R.checks.every(c => c.ok !== false)"), True)
            # ---------- 7) viewer
            ctxC, C = await new_user(b, 'C')
            await C.goto(link_view); await C.wait_for_selector('#auPw'); await C.fill('#auPw', 'View#12345'); await C.fill('#auPw2', 'View#12345'); await C.click('#auMain'); await C.wait_for_selector('#app'); await C.wait_for_timeout(500)
            check('C role viewer', await C.evaluate('APP.net.role'), 'viewer'); check('C body.ro', await C.evaluate("document.body.classList.contains('ro')"), True)
            check('C hides quick buttons', await C.locator('.qa').is_visible(), False)
            await go(C, 'sale'); await C.wait_for_timeout(400); check('C redirected from sale', await C.evaluate("location.hash"), '#/dashboard')
            check('C nav hides sale', await C.locator('a.ni[data-r="sale"]').count(), 0)
            await go(C, 'customers'); await C.wait_for_timeout(300); check('C hides new-customer', await C.locator('text=+ عميل جديد').is_visible(), False)
            # viewer forced commit does nothing on server
            before = await A.evaluate("APP.S.parties.length")
            await C.evaluate("APP.S.parties.push({type:'عميل',code:'C-999',name:'hack'}); APP.commit('x')"); await C.wait_for_timeout(1200)
            check('viewer hack not on server', await A.evaluate("APP.S.parties.length"), before)
            check('viewer state reverted', await C.evaluate("APP.S.parties.some(p => p.code === 'C-999')"), False)
            await go(C, 'dashboard'); await C.wait_for_timeout(300); await C.screenshot(path=SHOTS + '/s6_viewer.png')
            # ---------- 8) offline edit then reconnect
            await ctxB.set_offline(True); await go(B, 'expense'); await B.wait_for_selector('#frm'); await B.fill('#fD', '2025-07-01'); await B.select_option('#fCat', 'إيجارات'); await B.fill('#fAmt', '70'); await B.click('[data-act="saveDoc"]'); await B.wait_for_selector('.sig')
            check('B offline flag', await wait_for(B, "APP.net.online === false", 8000), True)
            check('offline indicator', 'مفيش اتصال' in await B.inner_text('#savest'), True)
            await ctxB.set_offline(False)
            check('B resynced', await wait_for(B, "APP.net.online === true && !APP.net.dirty && !APP.net.pushing", 15000), True)
            check('A gets offline expense', await wait_for(A, "APP.bal('5205') === 70", 8000), True)
            # ---------- 9) edit conflict: B offline edits customer, A edits same customer first
            await ctxB.set_offline(True)
            await B.evaluate("APP.S.parties[0].name = 'اسم من B'; APP.commit('تعديل B')"); await B.wait_for_timeout(500)
            await A.evaluate("APP.S.parties[0].name = 'اسم من A'; APP.commit('تعديل A')"); await A.wait_for_timeout(800)
            await ctxB.set_offline(False)
            check('B conflict dialog', await wait_for(B, "!!document.querySelector('#alOk')", 15000), True)
            await B.screenshot(path=SHOTS + '/s7_conflict.png')
            await B.click('#alOk'); await B.wait_for_timeout(400)
            check('B reloaded to A value', await B.evaluate("APP.S.parties[0].name"), 'اسم من A')
            # ---------- 9b) offline doc-number collision -> server renames, client follows
            await ctxB.set_offline(True)
            await sale(B, 'C-001 - عميل أ', 3, '2025-06-20')
            localDoc = await B.evaluate("APP.S.transactions.filter(t => t.qty === 3 && t.type === 'بيع')[0].doc"); print('B local doc', localDoc)
            await sale(A, 'C-001 - عميل أ', 4, '2025-06-20')
            docA4 = await A.evaluate("APP.S.transactions.filter(t => t.qty === 4 && t.type === 'بيع')[0].doc")
            check('same number chosen offline', localDoc, docA4)
            await A.wait_for_timeout(600)
            await ctxB.set_offline(False)
            check('B told about rename', await wait_for(B, "!!document.querySelector('#alOk')", 15000), True)
            await B.screenshot(path=SHOTS + '/s7b_rename.png'); await B.click('#alOk'); await B.wait_for_timeout(300)
            newDoc = await B.evaluate("APP.S.transactions.filter(t => t.qty === 3 && t.type === 'بيع')[0].doc"); print('B new doc', newDoc)
            check('B doc renamed', newDoc != localDoc, True)
            check('B hash follows doc', await B.evaluate("decodeURIComponent(location.hash)"), '#/doc/' + newDoc)
            check('B page shows new doc', newDoc in await B.inner_text('#main'), True)
            check('A keeps its doc', await A.evaluate("APP.S.transactions.filter(t => t.qty === 4 && t.type === 'بيع')[0].doc"), docA4)
            check('A receives renamed doc', await wait_for(A, "APP.S.transactions.some(t => t.qty === 3 && t.doc === %s)" % json.dumps(newDoc), 8000), True)
            check('sale docs unique A', await A.evaluate("(() => { const d = APP.S.transactions.filter(t => t.type === 'بيع').map(t => t.doc); return new Set(d).size === d.length; })()"), True)
            check('totals equal after rename', await A.evaluate("JSON.stringify(APP.totals())"), await B.evaluate("JSON.stringify(APP.totals())"))
            # ---------- 10) restore by owner pushes to others; accountant blocked
            backup = await A.evaluate("JSON.stringify({app:'SIYADA',format:1,state:APP.S})")
            open(tmp + '/bk.json', 'w', encoding='utf8').write(backup)
            ev = await B.evaluate("APP.net.api('POST','/api/c/'+APP.net.cid+'/restore',{records:[]}).then(() => 'ok', e => e.status)"); check('accountant restore blocked', ev, 403)
            await go(A, 'backup'); await A.wait_for_selector('#rsF'); await A.set_input_files('#rsF', tmp + '/bk.json'); await A.click('[data-act="doRestore"]'); await A.click('#cfOk'); await A.wait_for_timeout(1800)
            check('A after restore ok', await A.evaluate("APP.S.parties.length"), before)
            check('B follows restore', await wait_for(B, "APP.S.parties.length === %d && !APP.net.dirty" % before, 10000), True)
            check('totals equal after restore', await A.evaluate("JSON.stringify(APP.totals())"), await B.evaluate("JSON.stringify(APP.totals())"))
            # ---------- 11) activity + account + logout/login
            await go(A, 'activity'); await A.wait_for_timeout(700); t = await A.inner_text('#acBody'); check('activity lists B', 'acc@t.com' in t, True); await A.screenshot(path=SHOTS + '/s8_activity.png')
            await go(A, 'admin'); await A.wait_for_timeout(700); check('admin shows companies', 'شركة النور للتجارة' in await A.inner_text('#adBody'), True); await A.screenshot(path=SHOTS + '/s9_admin.png')
            await go(B, 'admin'); await B.wait_for_timeout(300); check('B no admin', await B.evaluate("location.hash"), '#/dashboard')
            await A.click('.nvh.end > .nvt'); await A.click('[data-act="logout"]'); await A.wait_for_selector('#auEmail')
            await A.fill('#auEmail', 'owner@t.com'); await A.fill('#auPw', 'wrong'); await A.click('#auMain'); await A.wait_for_timeout(500); check('wrong pw message', 'غلط' in await A.inner_text('#auErr'), True)
            await A.fill('#auPw', 'Secret#1234'); await A.click('#auMain'); await A.wait_for_selector('#app'); await A.wait_for_timeout(500)
            check('A back with data', await A.evaluate("APP.S.parties.length"), before)
            # two companies: owner creates second one -> picker
            await A.click('.nvh.end > .nvt'); await A.click('[data-act="switchCo"]'); await A.wait_for_selector('.cocard'); await A.fill('#auCo', 'شركة ثانية'); await A.click('#auMain'); await A.wait_for_selector('#suCo'); await A.screenshot(path=SHOTS + '/s10_second.png')
            check('2nd company empty (isolated)', await A.evaluate("APP.S === null"), True)
            await A.click('text=ابدأ بدفاتر جديدة'); await A.wait_for_selector('#app'); await A.wait_for_timeout(500)
            check('2nd company no parties', await A.evaluate("APP.S.parties.length"), 0)
            check('2nd company name', await A.evaluate("APP.S.settings.company"), 'شركة ثانية')
            for pg in (A, B, C):
                if pg.errs: print(pg.nm, 'ERRORS:', pg.errs[:5])
            print('page errors total:', sum(len(x.errs) for x in (A, B, C)))
            await b.close()
        print('FAILS:', fails)
    finally:
        srv.terminate()
        try: print(srv.communicate(timeout=5)[0][-1500:])
        except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True)
asyncio.run(main())
