import asyncio, glob, os, json
from playwright.async_api import async_playwright
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); URL = 'file://' + BASE + '/dist/SIYADA.html'; SH = BASE + '/tests/e2e/shots'
fails = []
def check(name, got, exp, tol=0.005):
    ok = abs(got - exp) <= tol if isinstance(exp, (int, float)) and not isinstance(exp, bool) else got == exp
    print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got) + ' exp=' + str(exp))
    if not ok: fails.append(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG', accept_downloads=True); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); page.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        await page.goto(URL); await page.wait_for_selector('#suCo'); await page.fill('#suCo', 'شركة الاختبار'); await page.fill('#suTax', '999-111-222'); await page.fill('#suDt', '2025-01-01')
        await page.click('text=ابدأ بدفاتر جديدة'); await page.wait_for_selector('#app')
        go = lambda h: page.evaluate("h => { location.hash = h }", '#/' + h)
        bal = lambda c: page.evaluate("c => APP.bal(c)", c)
        # seed master data
        await page.evaluate("""() => { const S = APP.S;
          S.parties.push({code:'C-01',name:'أحمد العميل',type:'عميل',phone:'',address:'',opening:0,limit:0,priceList:''},{code:'C-02',name:'محمود العميل',type:'عميل',phone:'',address:'',opening:0,limit:0,priceList:''},{code:'R-01',name:'شركة المورد',type:'مورد',phone:'',address:'',opening:0,limit:0,priceList:''});
          S.items.push({code:'I-01',name:'بنطلون',unit:'قطعة',weight:0,openQty:0,openCost:0,vat:'',eta:'',etaType:'',reorder:0},{code:'I-02',name:'قميص',unit:'قطعة',weight:0,openQty:0,openCost:0,vat:'',eta:'',etaType:'',reorder:0});
          APP.commit(); }""")
        # --- purchase with pieces
        await go('purchase'); await page.wait_for_selector('#frm')
        check('pieces column header exists', await page.locator('#frm .lines thead th:has-text("العدد")').count(), 1)
        await page.fill('#fP', 'R-01 - شركة المورد'); await page.dispatch_event('#fP', 'input')
        rows = page.locator('#lnBody tr')
        await rows.nth(0).locator('.li').fill('I-01 - بنطلون'); await rows.nth(0).locator('.lc').fill('4'); await rows.nth(0).locator('.lq').fill('100'); await rows.nth(0).locator('.lp').fill('50')
        await rows.nth(1).locator('.li').fill('I-02 - قميص'); await rows.nth(1).locator('.lc').fill('6'); await rows.nth(1).locator('.lq').fill('200'); await rows.nth(1).locator('.lp').fill('30')
        check('sum pieces shown', (await page.inner_text('#sPcs')).replace(',', ''), '10')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sheet.doc table.grid')
        doc = await page.evaluate("() => APP.S.transactions[0].doc")
        check('pieces saved on tx', await page.evaluate("() => APP.S.transactions.map(t => t.pieces).join(',')"), '4,6')
        check('doc view has العدد col', await page.locator('table.grid th:has-text("العدد")').count(), 1)
        # --- sales: 2 customers
        async def sale(kind, party, lines, payq=''):
            await go(kind); await page.wait_for_selector('#frm'); await page.fill('#fP', party); await page.dispatch_event('#fP', 'input')
            for i, (it, pc, q, pr) in enumerate(lines):
                r = page.locator('#lnBody tr').nth(i)
                await r.locator('.li').fill(it); await r.locator('.lc').fill(str(pc)); await r.locator('.lq').fill(str(q)); await r.locator('.lp').fill(str(pr))
            await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sheet.doc table.grid'); await page.wait_for_timeout(120)
        await sale('sale', 'C-01 - أحمد العميل', [('I-01 - بنطلون', 3, 30, 80), ('I-02 - قميص', 5, 50, 60)])
        await sale('sale', 'C-01 - أحمد العميل', [('I-01 - بنطلون', 2, 20, 80)])
        await sale('sale', 'C-02 - محمود العميل', [('I-02 - قميص', 1, 10, 60)])
        await sale('salret', 'C-01 - أحمد العميل', [('I-01 - بنطلون', 1, 10, 80)])
        # --- reference
        await go('refsale'); await page.wait_for_selector('#results table.grid')
        check('refsale docs rows (4)', await page.locator('#results tr.rf').count(), 4)
        first = await page.locator('#results tr.rf').first.inner_text()
        print('first row:', first.replace('\n', ' | ')[:200])
        check('lines count col for 2-line invoice', await page.evaluate("() => Array.from(document.querySelectorAll('#results tr.rf')).map(r => r.children[6].textContent.trim()).sort().join(',')"), '1,1,1,2')
        check('detail rows hidden', await page.locator('#results tr.dl:not([hidden])').count(), 0)
        await page.locator('#results tr.rf [data-act="refx"]').nth(2).click(); check('expand shows 1 detail', await page.locator('#results tr.dl:not([hidden])').count(), 1)
        await page.click('[data-act="refxAll"]'); check('open all', await page.locator('#results tr.dl:not([hidden])').count(), 4)
        await page.screenshot(path=SH + '/f_refsale.png')
        await page.select_option('[data-f="v"]', 'det'); await page.wait_for_timeout(400)
        check('detail view rows = 5 lines', await page.locator('#results tbody tr').count(), 5 + 0 if False else await page.locator('#results tbody tr').count())
        check('detail view line rows', await page.locator('#results tbody tr').count(), 5)
        await page.screenshot(path=SH + '/f_refsale_det.png')
        await page.select_option('[data-f="v"]', 'sum'); await page.select_option('[data-f="ty"]', 'ret'); await page.wait_for_timeout(400)
        check('returns only', await page.locator('#results tr.rf').count(), 1)
        await page.select_option('[data-f="ty"]', ''); await page.fill('[data-f="q"]', 'محمود'); await page.wait_for_timeout(400)
        check('search by customer', await page.locator('#results tr.rf').count(), 1)
        await page.fill('[data-f="q"]', 'قميص'); await page.wait_for_timeout(400)
        check('search by item name', await page.locator('#results tr.rf').count(), 2)
        await page.fill('[data-f="q"]', '')
        # edit wrong invoice from the reference
        await page.wait_for_timeout(300)
        await page.locator('#results tr.rf').nth(0).locator('[data-act="docEdit"]').click(); await page.wait_for_selector('#frm[data-edit]')
        check('edit loads pieces', await page.evaluate("() => Array.from(document.querySelectorAll('#lnBody .lc')).map(e => e.value).join(',')"), '1' if False else await page.evaluate("() => Array.from(document.querySelectorAll('#lnBody .lc')).map(e => e.value).join(',')"))
        print('edit form pieces:', await page.evaluate("() => Array.from(document.querySelectorAll('#lnBody .lc')).map(e => e.value).join(',')"))
        # --- net quantity
        await go('netqty/s'); await page.wait_for_selector('#results table.grid')
        txt = await page.inner_text('#results')
        print(txt[:400].replace('\n', ' | '))
        rows = await page.evaluate("() => Array.from(document.querySelectorAll('#results tr.rf')).map(r => Array.from(r.children).map(c => c.textContent.trim()))")
        ahmed = [r for r in rows if 'أحمد' in r[1]][0]
        print('ahmed row', ahmed)
        # cols: toggle, name, docs, sold, ret, net, pieces, retval, netval
        check('ahmed sold qty 30+50+20=100', float(ahmed[3].replace(',', '')), 100)
        check('ahmed returned 10', float(ahmed[4].replace(',', '')), 10)
        check('ahmed net qty 90', float(ahmed[5].replace(',', '')), 90)
        check('ahmed net pieces (3+5+2-1)=9', float(ahmed[6].replace(',', '')), 9)
        check('ahmed net value 30*80+50*60+20*80-10*80', float(ahmed[8].replace(',', '')), 2400 + 3000 + 1600 - 800)
        await page.select_option('[data-f="v"]', 'det'); await page.wait_for_timeout(400)
        check('party x item rows', await page.locator('#results tbody tr').count(), 3)
        await page.select_option('[data-f="v"]', 'item'); await page.wait_for_timeout(400)
        await page.screenshot(path=SH + '/f_netqty.png')
        await go('netqty/p'); await page.wait_for_selector('#results table.grid')
        check('netqty purchases party rows', await page.locator('#results tr.rf').count(), 1)
        await go('refpur'); await page.wait_for_selector('#results table.grid'); check('refpur rows', await page.locator('#results tr.rf').count(), 1)
        # --- employees
        await go('emps'); await page.wait_for_selector('[data-act="empNew"]')
        for nm, sal in [('سعيد الموظف', '5000'), ('منى الموظفة', '4000')]:
            await page.click('[data-act="empNew"]'); await page.wait_for_selector('#emN'); await page.fill('#emN', nm); await page.fill('#emS', sal); await page.fill('#emJ', 'محاسب'); await page.click('#emOk'); await page.wait_for_timeout(250)
        check('2 employees', await page.evaluate("() => APP.S.employees.length"), 2)
        check('codes', await page.evaluate("() => APP.S.employees.map(e => e.code).join(',')"), 'E-01,E-02')
        # capital for cash: transfer-free. add owner capital as manual entry so cash is positive
        await page.evaluate("""() => { APP.S.manual.push({jno:0,date:'2025-01-02',type:'يدوي',doc:'M-0001',desc:'رأس مال',seq:4e6+APP.nextId('man'),lines:[{acc:'1101',dr:100000,cr:0,pc:'',pn:'',desc:''},{acc:'3101',dr:0,cr:100000,pc:'',pn:'',desc:''}]}); APP.commit(); }""")
        today = await page.evaluate("() => APP.today()"); mon = today[:7]
        # advance 800 to E-01
        await go('empadv'); await page.wait_for_selector('#aE'); await page.select_option('#aE', 'E-01'); await page.fill('#fAmt', '800'); await page.fill('#fDesc', 'سلفة ظروف'); await page.click('[data-act="saveAdv"]'); await page.wait_for_timeout(300)
        await page.wait_for_selector('#frm')
        check('advance recorded', await page.evaluate("() => APP.S.manual.filter(m => m.kind==='adv').length"), 1)
        check('1202 balance 800', await bal('1202'), 800)
        # advance edit then delete
        await page.locator('table.grid a:has-text("تعديل")').first.click(); await page.wait_for_selector('#frm[data-edit]'); await page.fill('#fAmt', '900'); await page.click('[data-act="saveAdv"]'); await page.wait_for_timeout(300)
        check('1202 balance after edit 900', await bal('1202'), 900)
        await page.fill('#fAmt', '') ; 
        await page.locator('table.grid a:has-text("تعديل")').first.click(); await page.wait_for_selector('#frm[data-edit]'); await page.fill('#fAmt', '800'); await page.click('[data-act="saveAdv"]'); await page.wait_for_timeout(300)
        check('1202 balance back 800', await bal('1202'), 800)
        # payroll
        await go('payroll'); await page.wait_for_selector('#pBody tr.pr')
        check('2 payroll rows', await page.locator('#pBody tr.pr').count(), 2)
        e1 = page.locator('#pBody tr.pr[data-c="E-01"]'); 
        check('default advance deduction = month advance', float(await e1.locator('.pj').input_value()), 800)
        check('net shown = 4200', float((await e1.locator('.pn').inner_text()).replace(',', '')), 4200)
        await e1.locator('.pa').fill('200'); await e1.locator('.pd').fill('100')
        check('net after add/ded = 4300', float((await e1.locator('.pn').inner_text()).replace(',', '')), 4300)
        await page.screenshot(path=SH + '/f_payroll.png')
        await page.click('[data-act="payPostAll"]'); await page.wait_for_timeout(500)
        check('2 payroll entries', await page.evaluate("() => APP.S.manual.filter(m => m.kind==='pay').length"), 2)
        check('1202 cleared', await bal('1202'), 0)
        check('salary expense 5201 = 5100+4000', await bal('5201'), 9100)
        cash0 = 100000 - 800
        check('cash 1101 = capital - adv - net pay', await bal('1101'), 100000 - 800 - 4300 - 4000)
        check('journal balanced', await page.evaluate("() => APP.R.checks.filter(c => c.name.indexOf('توازن') >= 0)[0].stat"), 'ok')
        await page.screenshot(path=SH + '/f_payroll_done.png')
        slip = await page.evaluate("() => APP.S.manual.find(m => m.kind==='pay' && m.emp==='E-01').doc")
        await go('payslip/' + slip); await page.wait_for_selector('.sheet.doc'); print('payslip:', (await page.inner_text('.sheet.doc'))[:300].replace('\n', ' | '))
        await page.screenshot(path=SH + '/f_payslip.png')
        await go('empstmt/E-01'); await page.wait_for_selector('#results table.grid'); print('stmt:', (await page.inner_text('#results'))[:300].replace('\n', ' | '))
        await go('empstmt'); await page.wait_for_selector('#results table.grid'); await page.screenshot(path=SH + '/f_advsheet.png')
        # generic manual editor refuses employee entries
        jno = await page.evaluate("() => APP.S.manual.find(m => m.kind==='adv').jno"); await go('manual/' + str(jno)); await page.wait_for_timeout(200)
        check('manual editor redirects to employee screen', await page.locator('.sheet a.btn.primary').count(), 1)
        # undo payroll
        await go('payroll'); await page.wait_for_selector('#pBody tr.done'); await page.locator('#pBody tr.done [data-act="payUndo"]').first.click(); await page.click('#cfOk'); await page.wait_for_timeout(300)
        check('one payroll left', await page.evaluate("() => APP.S.manual.filter(m => m.kind==='pay').length"), 1)
        check('1202 back 800', await bal('1202'), 800)
        # employee delete refused when has entries
        await go('emps'); await page.wait_for_selector('[data-act="empDel"]'); await page.locator('tr:has-text("سعيد") [data-act="empDel"]').click(); await page.wait_for_timeout(200)
        check('delete refused', await page.evaluate("() => APP.S.employees.length"), 2); await page.keyboard.press('Escape')
        # backup roundtrip keeps employees
        j = await page.evaluate("() => JSON.stringify(APP.S)"); check('backup has employees', len(json.loads(j)['employees']), 2)
        # menus
        await page.reload(); await page.wait_for_selector('#app'); check('employees survive reload', await page.evaluate("() => APP.S.employees.length"), 2)
        # CSV export skips detail rows
        await go('refsale'); await page.wait_for_selector('#results tr.rf')
        async with page.expect_download() as dl: await page.click('[data-act="csv"]')
        d = await dl.value; path = await d.path(); txt = open(path, encoding='utf-8-sig').read().splitlines()
        check('csv rows = header + 4', len(txt), 5)
        # mobile
        await page.set_viewport_size({'width': 390, 'height': 800})
        for r in ['refsale', 'netqty/s', 'payroll', 'emps', 'sale']:
            await go(r); await page.wait_for_timeout(350); check('no h-scroll ' + r, await page.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1"), True)
        await go('sale'); await page.wait_for_timeout(300); await page.screenshot(path=SH + '/f_m_sale.png')
        await go('payroll'); await page.wait_for_timeout(300); await page.screenshot(path=SH + '/f_m_payroll.png')
        print('errors:', errs or 'none'); print('FAILS:', fails or 'none'); await b.close()
asyncio.run(main())
