import asyncio, glob, os, sys, json
from playwright.async_api import async_playwright

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'file://' + BASE + '/dist/SIYADA.html'
FIX = sys.argv[1] if len(sys.argv) > 1 else 'tests/fixtures/clean'
SHOTS = BASE + '/tests/e2e/shots'
os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG')
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        page.on('console', lambda m: errs.append('CONSOLE ' + m.type + ' ' + m.text) if m.type in ('error', 'warning') else None)
        await page.goto(URL)
        await page.wait_for_selector('#suCo')
        await page.screenshot(path=SHOTS + '/01_setup_empty.png')
        await page.fill('#suCo', 'شركة النور للتجارة')
        await page.fill('#suAct', 'توزيع مواد غذائية')
        await page.fill('#suTax', '123-456-789')
        pv = await page.inner_text('#pvCo')
        print('preview text:', pv)
        files = sorted(glob.glob(BASE + '/' + FIX + '/*.csv'))
        await page.set_input_files('#suFiles', files)
        await page.screenshot(path=SHOTS + '/02_setup_filled.png')
        await page.click('text=استيراد وابدأ')
        await page.wait_for_selector('#app', timeout=20000)
        await page.wait_for_timeout(500)
        print('title:', await page.title())
        print('brand:', (await page.inner_text('#brand')).replace('\n', ' | '))
        await page.screenshot(path=SHOTS + '/03_dashboard.png', full_page=True)
        routes = ['dashboard', 'sale', 'salret', 'receipt', 'customers', 'purchase', 'purret', 'payment', 'suppliers', 'expense', 'income', 'transfer', 'treasury', 'items', 'coa', 'manual', 'journal', 'ledger/1101', 'docs', 'txs', 'tb', 'is', 'bs', 'statement/MR102', 'salesrep', 'checks', 'mapping', 'import', 'backup', 'settings', 'itemcard/N-017', 'doc/FB-3', 'manual/2543', 'doc/T-0001']
        for r in routes:
            await page.evaluate("h => { location.hash = h }", '#/' + r)
            await page.wait_for_timeout(250)
            txt = await page.inner_text('#main')
            ttl = await page.inner_text('#ptitle')
            has_err = 'حصل خطأ في عرض الشاشة' in txt
            print(('ERR ' if has_err else 'ok  ') + r.ljust(18) + ttl.ljust(28) + str(len(txt)))
            if has_err: print(txt[:300])
            if r in ('customers', 'items', 'coa', 'journal', 'ledger/1101', 'tb', 'is', 'bs', 'statement/MR102', 'sale', 'receipt', 'expense', 'settings', 'doc/FB-3', 'checks', 'mapping', 'backup', 'salesrep', 'manual'):
                await page.screenshot(path=SHOTS + '/r_' + r.replace('/', '_') + '.png', full_page=False)
        print('\n'.join(errs[:30]) or 'no console errors')
        await b.close()
asyncio.run(main())
