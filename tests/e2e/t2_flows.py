import asyncio, os, sys, json
from playwright.async_api import async_playwright

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'file://' + BASE + '/dist/SIYADA.html'
SHOTS = BASE + '/tests/e2e/shots'
fails = []

def check(name, got, exp, tol=0.005):
    ok = abs(got - exp) <= tol if isinstance(exp, (int, float)) else got == exp
    print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got) + ' exp=' + str(exp))
    if not ok: fails.append(name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG', accept_downloads=True)
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE ' + m.type + ' ' + m.text) if m.type == 'error' else None)
        page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await page.goto(URL)
        await page.wait_for_selector('#suCo')
        await page.fill('#suCo', 'شركة اختبار')
        await page.fill('#suDt', '2026-01-01')
        await page.click('text=ابدأ بدفاتر جديدة')
        await page.wait_for_selector('#app')
        bal = lambda c: page.evaluate("c => APP.bal(c)", c)
        go = lambda h: page.evaluate("h => { location.hash = h }", '#/' + h)

        # customer
        await go('customers'); await page.wait_for_timeout(150)
        await page.click('text=+ عميل جديد'); await page.fill('#pfName', 'عميل 1'); await page.fill('#pfOp', '1000'); await page.click('#pfOk')
        await page.wait_for_timeout(200)
        await go('suppliers'); await page.click('text=+ مورد جديد'); await page.fill('#pfName', 'مورد 1'); await page.click('#pfOk'); await page.wait_for_timeout(200)
        await go('items'); await page.click('text=+ صنف جديد'); await page.fill('#ifName', 'صنف 1'); await page.click('#ifOk'); await page.wait_for_timeout(200)
        print(await page.evaluate("[APP.S.parties.map(p=>p.code), APP.S.items.map(x=>x.code)]"))
        check('AR opening', await bal('1201'), 1000)

        # purchase invoice: 100 x 10 = 1000, paid 400 cash
        await go('purchase'); await page.wait_for_selector('#frm')
        await page.fill('#fP', 'R-001 - مورد 1')
        r = page.locator('#lnBody tr').nth(0)
        await r.locator('.li').fill('I-001 - صنف 1'); await r.locator('.lq').fill('100'); await r.locator('.lp').fill('10')
        await page.fill('#fPaid', '400')
        print('gross/net/rest:', await page.inner_text('#sGross'), await page.inner_text('#sNet'), await page.inner_text('#sRest'))
        await page.screenshot(path=SHOTS + '/f1_purchase.png')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(200)
        check('inventory after purchase', await bal('1301'), 1000); check('AP', -await bal('2101'), 600); check('cash', await bal('1101'), -400)
        print('doc view:', (await page.inner_text('.sh')).replace('\n', ' | ')[:120])

        # sale invoice: 30 x 15 = 450, discount 50, paid 200
        await go('sale'); await page.wait_for_selector('#frm')
        await page.fill('#fP', 'C-001 - عميل 1')
        r = page.locator('#lnBody tr').nth(0)
        await r.locator('.li').fill('I-001 - صنف 1'); await r.locator('.lq').fill('30'); await r.locator('.lp').fill('15')
        await page.fill('#fDisc', '50'); await page.fill('#fPaid', '200')
        print('sale hint:', await r.locator('.lh').inner_text(), '| price auto:', await r.locator('.lp').input_value())
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(200)
        check('AR after sale', await bal('1201'), 1000 + 450 - 50 - 200); check('COGS', await bal('5101'), 300); check('inventory', await bal('1301'), 700)
        check('sales rev', -await bal('4101'), 450); check('discount', await bal('4103'), 50); check('cash', await bal('1101'), -200)

        # receipt 300
        await go('receipt'); await page.wait_for_selector('#frm')
        await page.fill('#fP', 'C-001 - عميل 1'); await page.fill('#fAmt', '300'); await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(150)
        check('AR after receipt', await bal('1201'), 900); check('cash', await bal('1101'), 100)
        # expense 120
        await go('expense'); await page.wait_for_selector('#frm')
        await page.select_option('#fCat', 'وقود سيارات'); await page.fill('#fAmt', '120'); await page.fill('#fDesc', 'سولار'); await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(150)
        check('fuel exp', await bal('5206'), 120); check('cash', await bal('1101'), -20)
        # transfer 100 cash->bank
        await go('transfer'); await page.wait_for_selector('#frm')
        await page.select_option('#tFrom', '1101'); await page.select_option('#tTo', '1104'); await page.fill('#tAmt', '100'); await page.click('[data-act="saveTransfer"]'); await page.wait_for_timeout(250)
        check('bank', await bal('1104'), 100); check('cash', await bal('1101'), -120)
        # manual entry: Dr 5207 50 / Cr 1101 50
        await go('manual'); await page.wait_for_selector('#frm')
        await page.fill('#fDesc', 'مصروف نثريات')
        rows = page.locator('#mBody tr')
        await rows.nth(0).locator('.ma').fill('5207 - مصروفات أخرى'); await rows.nth(0).locator('.md').fill('50')
        await rows.nth(1).locator('.ma').fill('1101 - الخزينة النقدية'); await rows.nth(1).locator('.mc').fill('50')
        print('balance msg:', (await page.inner_text('#mBal')).replace('\n', ' '))
        await page.click('[data-act="saveManual"]'); await page.wait_for_timeout(250)
        check('other exp', await bal('5207'), 50); check('cash', await bal('1101'), -170)
        # reports
        t = await page.evaluate("APP.totals()")
        check('BS equation', t['assets'] - t['liab'] - t['eq'] - t['profit'], 0)
        check('profit', t['profit'], 400 - 300 - 120 - 50)
        await go('is'); await page.wait_for_timeout(200); print('IS net row:', (await page.inner_text('#rpt tr.dbl')).replace('\n', ' '))
        await page.screenshot(path=SHOTS + '/f2_is.png')
        await go('bs'); await page.wait_for_timeout(200); print('BS bal:', (await page.inner_text('.bal')))
        await go('tb'); await page.wait_for_timeout(200); print('TB bal:', (await page.inner_text('.bal')))
        await go('statement/C-001'); await page.wait_for_timeout(200); await page.screenshot(path=SHOTS + '/f3_statement.png')
        print('statement rows:', (await page.inner_text('#rpt')).replace('\n', ' ')[:400])
        checks = await page.evaluate("APP.R.checks.map(c=>c.stat+':'+c.name)")
        print('\n'.join(checks))

        # edit sale invoice qty 30 -> 40
        docs = await page.evaluate("APP.R.docs.map(d=>d.doc+' '+d.type)"); print(docs)
        await go('sale/FB-1'); await page.wait_for_selector('#frm')
        r = page.locator('#lnBody tr').nth(0); await r.locator('.lq').fill('40'); await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(200)
        check('COGS after edit', await bal('5101'), 400); check('inventory after edit', await bal('1301'), 600); check('sales after edit', -await bal('4101'), 600)
        # delete the expense doc
        await go('doc/EXP-1'); await page.click('text=حذف'); await page.click('#cfOk'); await page.wait_for_timeout(250)
        check('fuel exp after delete', await bal('5206'), 0)
        # period lock
        await page.evaluate("APP.S.settings.closedUntil = '2026-01-31'; APP.commit('x', {norender:true})")
        await go('receipt'); await page.wait_for_selector('#frm')
        await page.fill('#fD', '2026-01-15'); await page.fill('#fP', 'C-001 - عميل 1'); await page.fill('#fAmt', '10'); await page.click('[data-act="saveDoc"]'); await page.wait_for_timeout(250)
        print('lock modal:', (await page.inner_text('#modal'))[:80]); await page.click('#alOk')
        await page.evaluate("APP.S.settings.closedUntil = ''; APP.commit('x', {norender:true})")

        # persistence: reload
        await page.wait_for_timeout(600)
        await page.reload(); await page.wait_for_selector('#app', timeout=8000)
        print('after reload brand:', (await page.inner_text('#brand')).replace('\n', ' | '), '| tx:', await page.evaluate("APP.S.transactions.length"))
        check('persist AR', await page.evaluate("APP.bal('1201')"), 1000 + 600 - 50 - 200 - 300)

        # backup + restore round trip
        await go('backup')
        async with page.expect_download() as dl:
            await page.click('text=حفظ نسخة احتياطية (JSON)')
        d = await dl.value; path = BASE + '/tests/e2e/shots/backup_test.json'; await d.save_as(path)
        data = json.load(open(path, encoding='utf-8')); print('backup file:', d.suggested_filename, 'tx', len(data['state']['transactions']))
        await page.evaluate("APP.S.transactions = []; APP.commit('x', {norender:true})")
        check('AR cleared', await page.evaluate("APP.bal('1201')"), 1000)
        await go('backup'); await page.set_input_files('#rsF', path); await page.click('[data-act="doRestore"]'); await page.click('#cfOk'); await page.wait_for_timeout(500)
        check('AR restored', await page.evaluate("APP.bal('1201')"), 1000 + 600 - 50 - 200 - 300)

        # settings: change company name -> applies everywhere
        await go('settings'); await page.fill('#sCo', 'مؤسسة الأمل'); await page.click('[data-act="saveSettings"]'); await page.wait_for_timeout(300)
        await go('tb'); await page.wait_for_timeout(200)
        print('after rename: title=', await page.title(), '| brand=', (await page.inner_text('#brand')).split('\n')[0], '| sheet=', (await page.inner_text('.sh .co')))
        print('\n'.join(errs) or 'no console errors')
        await b.close()
    print('FAILS:', fails)
asyncio.run(main())
