import asyncio, glob, os
from playwright.async_api import async_playwright
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); URL = 'file://' + BASE + '/dist/SIYADA.html'; SH = BASE + '/tests/e2e/shots'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG'); page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('#suCo'); await page.fill('#suCo', 'شركة النور للتجارة'); await page.fill('#suTax', '123-456-789')
        await page.set_input_files('#suFiles', sorted(glob.glob(BASE + '/tests/fixtures/manual/*.csv'))); await page.click('text=استيراد وابدأ'); await page.wait_for_selector('#app'); await page.wait_for_timeout(400)
        for r in ['doc/FB-3', 'is', 'statement/MR102', 'tb', 'journal']:
            await page.evaluate("h => { location.hash = h }", '#/' + r); await page.wait_for_timeout(300)
            await page.pdf(path=SH + '/p_' + r.replace('/', '_') + '.pdf', format='A4', print_background=True, margin={'top': '12mm', 'bottom': '12mm', 'left': '12mm', 'right': '12mm'})
        # mobile
        await page.set_viewport_size({'width': 390, 'height': 800})
        for r in ['dashboard', 'sale', 'customers']:
            await page.evaluate("h => { location.hash = h }", '#/' + r); await page.wait_for_timeout(300); await page.screenshot(path=SH + '/m_' + r + '.png')
        await page.click('#burger'); await page.wait_for_timeout(300); await page.screenshot(path=SH + '/m_nav.png')
        # manual entries in journal (from import)
        await page.set_viewport_size({'width': 1366, 'height': 850})
        await page.evaluate("h => { location.hash = h }", '#/journal'); await page.wait_for_timeout(300)
        await page.fill('[data-f="ty"]', '') if False else None
        await page.select_option('[data-f="ty"]', 'تحويل'); await page.wait_for_timeout(400)
        print('journal transfer rows:', (await page.inner_text('#results'))[:300].replace('\n', ' '))
        await page.screenshot(path=SH + '/j_transfer.png')
        print(errs or 'no errors')
        await b.close()
asyncio.run(main())
