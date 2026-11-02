import asyncio, glob, os, json
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
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        await page.goto(URL); await page.wait_for_selector('#suCo')
        await page.fill('#suCo', 'شركة الاختبار الضريبي'); await page.fill('#suTax', '999-111-222'); await page.fill('#suDt', '2025-01-01')
        await page.click('text=ابدأ بدفاتر جديدة'); await page.wait_for_selector('#app')
        bal = lambda c: page.evaluate("c => APP.bal(c)", c)
        go = lambda h: page.evaluate("h => { location.hash = h }", '#/' + h)
        # settings: VAT on 14%, ETA activity
        await go('settings'); await page.wait_for_selector('#sCo')
        await page.select_option('#sVat', '1'); await page.fill('#sVr', '14'); await page.fill('#sEtaAct', '4690'); await page.fill('#sGov', 'القاهرة'); await page.fill('#sCity', 'مدينة نصر')
        await page.click('[data-act="saveSettings"]'); await page.wait_for_timeout(250)
        # data: customer (tax id, company), supplier, item with ETA code
        await go('customers'); await page.click('text=+ عميل جديد'); await page.fill('#pfName', 'شركة العميل'); await page.fill('#pfTax', '555666777'); await page.select_option('#pfRt', 'B'); await page.click('#pfOk'); await page.wait_for_timeout(200)
        await go('suppliers'); await page.click('text=+ مورد جديد'); await page.fill('#pfName', 'المورد'); await page.click('#pfOk'); await page.wait_for_timeout(200)
        await go('items'); await page.click('text=+ صنف جديد'); await page.fill('#ifName', 'سكر'); await page.fill('#ifUnit', 'كجم'); await page.fill('#ifEta', 'EG-123456-9001'); await page.click('#ifOk'); await page.wait_for_timeout(200)
        # price list
        await go('prices'); await page.click('[data-act="plNew"]'); await page.fill('#nmIn', 'جملة'); await page.click('#nmOk'); await page.wait_for_timeout(250)
        await page.locator('.plp').first.fill('20'); await page.click('[data-act="plSave"]'); await page.wait_for_timeout(250)
        check('price list saved', await page.evaluate("APP.S.priceLists[0].prices['I-001']"), 20)
        await go('customers'); await page.click('[data-act="partyEdit"]'); await page.select_option('#pfPl', 'جملة'); await page.click('#pfOk'); await page.wait_for_timeout(200)
        check('party price list', await page.evaluate("APP.S.parties[0].priceList"), 'جملة')
        # purchase 2025-03-01: 100 x 11.4 incl VAT -> 1140 (net 1000, vat 140), no payment
        await go('purchase'); await page.wait_for_selector('#frm'); await page.fill('#fD', '2025-03-01'); await page.fill('#fP', 'R-001 - المورد')
        r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-001 - سكر'); await r.locator('.lq').fill('100'); await r.locator('.lp').fill('11.4')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(200)
        check('VAT in', await bal('1203'), 140); check('inventory (net)', await bal('1301'), 1000); check('AP', -await bal('2101'), 1140)
        # sale 2025-06-10: price should auto-fill 20 from list; 50 x 20 = 1000 incl VAT
        await go('sale'); await page.wait_for_selector('#frm'); await page.fill('#fD', '2025-06-10'); await page.fill('#fP', 'C-001 - شركة العميل')
        r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-001 - سكر'); await r.locator('.lq').fill('50')
        check('price from list', float(await r.locator('.lp').input_value()), 20)
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(200)
        out_vat = round(1000 - 1000 / 1.14, 2)
        check('VAT out', -await bal('2102'), out_vat); check('COGS (avg cost 10)', await bal('5101'), 500)
        # expense 2025-07-01 100
        await go('expense'); await page.wait_for_selector('#frm'); await page.fill('#fD', '2025-07-01'); await page.select_option('#fCat', 'إيجارات'); await page.fill('#fAmt', '100'); await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sig'); await page.wait_for_timeout(150)
        # VAT report
        await go('vat'); await page.wait_for_timeout(250); await page.screenshot(path=SHOTS + '/n1_vat.png')
        k = await page.inner_text('.kpis'); print('VAT kpis:', k.replace('\n', ' | '))
        # ETA
        await go('eta'); await page.wait_for_timeout(250); await page.screenshot(path=SHOTS + '/n2_eta.png')
        print('ETA kpis:', (await page.inner_text('.kpis')).replace('\n', ' | '))
        async with page.expect_download() as dl:
            await page.click('[data-act="etaJson"]')
        d = await dl.value; path = SHOTS + '/eta_test.json'; await d.save_as(path); j = json.load(open(path, encoding='utf-8'))
        doc = j['documents'][0]; ln = doc['invoiceLines'][0]
        check('ETA docs', len(j['documents']), 1); check('ETA receiver id', doc['receiver']['id'], '555666777'); check('ETA receiver type', doc['receiver']['type'], 'B')
        check('ETA issuer id', doc['issuer']['id'], '999-111-222'); check('ETA code', ln['itemCode'], 'EG-123456-9001'); check('ETA unit', ln['unitType'], 'KGM')
        check('ETA net', doc['netAmount'], round(1000 / 1.14, 2)); check('ETA tax', doc['taxTotals'][0]['amount'], out_vat); check('ETA total', doc['totalAmount'], 1000)
        check('ETA activity', doc['taxpayerActivityCode'], '4690')
        # closing 2025
        t0 = await page.evaluate("APP.totals()"); print('before closing profit', t0['profit'])
        await go('closing'); await page.wait_for_timeout(250)
        await page.fill('[data-f="yr"]', '2025'); await page.dispatch_event('[data-f="yr"]', 'change'); await page.wait_for_timeout(250)
        await page.screenshot(path=SHOTS + '/n3_closing.png')
        await page.click('[data-act="clRun"]'); await page.click('#cfOk'); await page.wait_for_timeout(300)
        check('rev closed 4101', await bal('4101'), 0); check('cogs closed', await bal('5101'), 0); check('rent closed', await bal('5205'), 0)
        net = round(1000 / 1.14 - 500 - 100, 2)
        check('RE = net', -await bal('3201'), net)
        t1 = await page.evaluate("APP.totals()"); check('unclosed profit 0', t1['profit'], 0); check('BS eq', t1['assets'] - t1['liab'] - t1['eq'] - t1['profit'], 0)
        check('closedUntil', await page.evaluate("APP.S.settings.closedUntil"), '2025-12-31')
        await go('is'); await page.wait_for_timeout(200); await page.fill('[data-f="from"]', '2025-01-01'); await page.fill('[data-f="to"]', '2025-12-31'); await page.click('[data-act="full"]'); await page.wait_for_timeout(200)
        print('IS after closing:', (await page.inner_text('#rpt tr.dbl')).replace('\n', ' '))
        # guard
        await go('receipt'); await page.wait_for_selector('#frm'); await page.fill('#fD', '2025-12-01'); await page.fill('#fP', 'C-001 - شركة العميل'); await page.fill('#fAmt', '10'); await page.click('[data-act="saveDoc"]'); await page.wait_for_timeout(250)
        print('guard:', (await page.inner_text('#modal'))[:60]); await page.click('#alOk')
        # undo closing
        await go('closing'); await page.wait_for_timeout(250); await page.click('[data-act="clUndo"]'); await page.click('#cfOk'); await page.wait_for_timeout(300)
        check('rev reopened', -await bal('4101'), round(1000 / 1.14, 2)); check('lock cleared', await page.evaluate("APP.S.settings.closedUntil"), '')
        check('RE zero', await bal('3201'), 0)
        print('\n'.join(errs) or 'no console errors')
        await b.close()

    # alerts + all new routes on imported data
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG'); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await page.goto(URL); await page.wait_for_selector('#suCo'); await page.fill('#suCo', 'شركة النور'); await page.set_input_files('#suFiles', sorted(glob.glob(BASE + '/tests/fixtures/clean/*.csv'))); await page.click('text=استيراد وابدأ'); await page.wait_for_selector('#app'); await page.wait_for_timeout(500)
        a = await page.evaluate("(() => { const a = APP.alerts(); return {over: a.over.length, stale: a.stale.length, low: a.low.length, neg: a.neg.length, days: a.days}; })()"); print('alerts:', a)
        await page.screenshot(path=SHOTS + '/n4_dash.png', full_page=True)
        for r in ['closing', 'vat', 'eta', 'prices', 'dashboard']:
            await page.evaluate("h => { location.hash = h }", '#/' + r); await page.wait_for_timeout(300)
            t = await page.inner_text('#main'); print(r, 'ERR' if 'حصل خطأ' in t else 'ok', len(t))
        print('\n'.join(errs) or 'no errors (imported)')
        await b.close()
    print('FAILS:', fails)
asyncio.run(main())
