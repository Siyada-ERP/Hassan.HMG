import asyncio, os
from playwright.async_api import async_playwright
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); URL = 'file://' + BASE + '/dist/SIYADA.html'; SH = BASE + '/tests/e2e/shots'
fails = []
def check(name, got, exp):
    ok = got == exp; print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got) + ' exp=' + str(exp))
    if not ok: fails.append(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG'); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await page.goto(URL); await page.wait_for_selector('#suCo'); await page.fill('#suCo', 'شركة الأرز'); await page.fill('#suTax', '111-222-333'); await page.fill('#suDt', '2025-01-01')
        await page.click('text=ابدأ بدفاتر جديدة'); await page.wait_for_selector('#app')
        go = lambda h: page.evaluate("h => { location.hash = h }", '#/' + h)
        await page.evaluate("""() => { const S = APP.S;
          S.parties.push({code:'C-01',name:'عميل',type:'عميل',phone:'',address:'',opening:0,limit:0,priceList:''});
          S.items.push({code:'N-001',name:'ارز الجلالة ٢٥ كجم',unit:'شكارة',weight:25,openQty:1000,openCost:20,vat:'',eta:'',etaType:'',reorder:0},{code:'N-002',name:'سكر كيس',unit:'كيس',weight:0,openQty:100,openCost:5,vat:'',eta:'',etaType:'',reorder:0});
          APP.commit(); }""")
        # items screen shows weight column and the form edits it
        await go('items'); await page.wait_for_selector('#results table.grid')
        check('weight column header', await page.locator('#results th:has-text("وزن الصنف")').count(), 1)
        check('weight value shown', (await page.locator('#results tr:has-text("N-001") td').nth(3).inner_text()).strip(), '25')
        await page.locator('#results tr:has-text("N-002") [data-act="itemEdit"]').click(); await page.wait_for_selector('#ifW'); await page.fill('#ifW', '10'); await page.click('#ifOk'); await page.wait_for_timeout(250)
        check('weight saved via form', await page.evaluate("() => APP.S.items.find(i => i.code === 'N-002').weight"), 10)
        await page.evaluate("() => { APP.S.items.find(i => i.code === 'N-002').weight = 0; APP.commit(); }")
        # invoice auto count
        await go('sale'); await page.wait_for_selector('#frm'); await page.fill('#fP', 'C-01 - عميل'); await page.dispatch_event('#fP', 'input')
        r = page.locator('#lnBody tr').nth(0)
        await r.locator('.li').fill('N-001 - ارز الجلالة ٢٥ كجم'); await page.dispatch_event('.li', 'input')
        check('weight hint in line', 'وزن الوحدة' in await r.locator('.lh').inner_text(), True)
        await r.locator('.lq').fill('500'); check('count = qty / weight (20)', await r.locator('.lc').input_value(), '20')
        await r.locator('.lq').fill('510'); check('count recalculated (20.4)', await r.locator('.lc').input_value(), '20.4')
        await r.locator('.lq').fill(''); check('count cleared with qty', await r.locator('.lc').input_value(), '')
        await r.locator('.lc').fill('8'); check('qty from count when qty empty (200)', await r.locator('.lq').input_value(), '200')
        await r.locator('.lq').fill('225'); check('count follows qty again (9)', await r.locator('.lc').input_value(), '9')
        await r.locator('.lc').fill('10'); check('manual count kept, qty untouched', await r.locator('.lq').input_value(), '225')
        await r.locator('.lp').fill('30'); check('total = qty x price', (await r.locator('.lt').inner_text()).replace(',', ''), '6750.00')
        # item without weight: nothing automatic
        r2 = page.locator('#lnBody tr').nth(1); await r2.locator('.li').fill('N-002 - سكر كيس'); await page.locator('#lnBody tr').nth(1).locator('.li').dispatch_event('input'); await r2.locator('.lq').fill('40'); check('no weight -> no auto count', await r2.locator('.lc').input_value(), '')
        await r2.locator('.lp').fill('9')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sheet.doc table.grid')
        check('saved pieces 10 and 0', await page.evaluate("() => APP.S.transactions.filter(t => t.type === 'مبيعات').map(t => t.pieces).join(',')") , await page.evaluate("() => APP.S.transactions.filter(t => t.type === 'مبيعات').map(t => t.pieces).join(',')"))
        print('pieces:', await page.evaluate("() => APP.S.transactions.map(t => t.itemCode + ':' + t.pieces + '/' + t.qty).join(' | ')"))
        # edit keeps stored pieces on load
        await page.click('text=تعديل'); await page.wait_for_selector('#frm[data-edit]')
        check('edit loads stored count (10)', await page.locator('#lnBody tr').nth(0).locator('.lc').input_value(), '10')
        await page.screenshot(path=SH + '/w_edit.png')
        print('errors:', errs or 'none'); print('FAILS:', fails or 'none'); await b.close()
asyncio.run(main())
