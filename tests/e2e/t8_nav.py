import asyncio, glob, os
from playwright.async_api import async_playwright
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); URL = 'file://' + BASE + '/dist/SIYADA.html'; SH = BASE + '/tests/e2e/shots'
fails = []
def check(name, got, exp):
    ok = got == exp; print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got) + ' exp=' + str(exp))
    if not ok: fails.append(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1366, 'height': 800}, locale='ar-EG'); page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await page.goto(URL); await page.wait_for_selector('#suCo'); await page.fill('#suCo', 'شركة النور للتجارة'); await page.fill('#suTax', '123-456-789')
        await page.set_input_files('#suFiles', sorted(glob.glob(BASE + '/tests/fixtures/manual/*.csv'))); await page.click('text=استيراد وابدأ'); await page.wait_for_selector('#app'); await page.wait_for_timeout(400)
        heads = await page.locator('#mnav .nvh > .nvt').all_inner_texts(); print('headings:', heads)
        check('8 headings + home', len(heads), 9)
        check('no sidebar', await page.locator('#side').count(), 0)
        check('no buttons in bar except headings/burger', await page.locator('#menubar .btn').count(), 0)
        check('dropdowns closed at start', await page.locator('.nvh.open').count(), 0)
        await page.click('.nvt:has-text("المبيعات")'); check('click opens dropdown', await page.locator('.nvh.open .nvd').is_visible(), True)
        check('sales menu has sale link visible', await page.locator('.nvh.open a[data-r="sale"]').is_visible(), True)
        await page.screenshot(path=SH + '/n_sales.png')
        await page.hover('.nvt:has-text("الحسابات")'); check('hover switches menu', await page.locator('.nvh.open > .nvt').inner_text(), 'الحسابات')
        check('flyout hidden until hover', await page.locator('.nvh.open .nvd2').first.is_visible(), False)
        await page.hover('.nvfa:has-text("الخزينة والبنوك")'); await page.wait_for_timeout(100); check('flyout visible on hover', await page.locator('.nvd2 a[data-r="expense"]').is_visible(), True)
        box = await page.locator('.nvd2 a[data-r="expense"]').bounding_box(); check('flyout inside viewport', box['x'] >= 0 and box['x'] + box['width'] <= 1366, True)
        await page.screenshot(path=SH + '/n_acc.png')
        await page.click('.nvd2 a[data-r="expense"]'); await page.wait_for_timeout(250)
        check('navigated', await page.evaluate('location.hash'), '#/expense'); check('menu closed after pick', await page.locator('.nvh.open').count(), 0)
        check('active heading marked', await page.locator('.nvh.on > .nvt').all_inner_texts(), ['الحسابات'])
        await page.click('.nvt:has-text("المبيعات")'); await page.click('a[data-r="netqty"][data-a="s"]'); await page.wait_for_timeout(250)
        check('netqty sales active only under sales', await page.locator('.nvh.on > .nvt').all_inner_texts(), ['المبيعات', 'التقارير'])
        await page.click('.nvt:has-text("المشتريات")'); await page.click('a[data-r="netqty"][data-a="p"]'); await page.wait_for_timeout(250)
        check('netqty purchases active under purchases', await page.locator('.nvh.on > .nvt').all_inner_texts(), ['المشتريات', 'التقارير'])
        await page.click('.nvt:has-text("المبيعات")'); await page.keyboard.press('Escape'); check('escape closes', await page.locator('.nvh.open').count(), 0)
        await page.click('.nvt:has-text("المبيعات")'); await page.click('#ptitle'); check('outside click closes', await page.locator('.nvh.open').count(), 0)
        # every menu link goes to a registered route
        routes = await page.evaluate("() => Array.from(document.querySelectorAll('#mnav a[data-r]')).map(a => a.dataset.r).filter((v, i, a) => a.indexOf(v) === i)")
        missing = await page.evaluate("r => r.filter(x => !APP.routes[x])", routes); check('all menu routes exist', missing, [])
        # open every link and verify no console error
        for r in routes:
            await page.evaluate("h => { location.hash = h }", '#/' + r); await page.wait_for_timeout(120)
        check('no errors after visiting all routes', errs, [])
        # narrow desktop: dropdowns flip to stay inside viewport
        await page.set_viewport_size({'width': 1024, 'height': 700}); await page.wait_for_timeout(200)
        await page.click('.nvt:has-text("التقارير")'); await page.hover('.nvfa:has-text("المبيعات والمشتريات")'); await page.wait_for_timeout(150)
        for sel in ['.nvh.open > .nvd', '.nvh.open .nvd2:visible']:
            bb = await page.locator(sel).first.bounding_box(); check('inside 1024 ' + sel, bb['x'] >= -1 and bb['x'] + bb['width'] <= 1025, True)
        await page.screenshot(path=SH + '/n_1024.png')
        # mobile drawer
        await page.set_viewport_size({'width': 390, 'height': 800}); await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
        check('mobile: nav hidden', await page.locator('#mnav').is_visible(), False)
        await page.click('#burger'); await page.wait_for_timeout(350); check('mobile: drawer opens', await page.locator('#mnav').is_visible(), True)
        await page.click('#mnav .nvt:has-text("الحسابات")'); await page.click('.nvfa:has-text("الخزينة")'); await page.wait_for_timeout(150)
        check('mobile: submenu link visible', await page.locator('.nvd2 a[data-r="treasury"]').is_visible(), True)
        await page.screenshot(path=SH + '/n_mob.png')
        await page.click('.nvd2 a[data-r="treasury"]'); await page.wait_for_timeout(300); check('mobile: drawer closes after pick', await page.locator('#mnav').is_visible(), False)
        check('mobile: no h-scroll', await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), True)
        print('errors:', errs or 'none'); print('FAILS:', fails or 'none'); await b.close()
asyncio.run(main())
