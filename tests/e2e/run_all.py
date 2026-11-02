#!/usr/bin/env python3
"""Run the browser (Playwright) test suites one after the other and report.

The individual suites print PASS / FAIL lines instead of using exit codes, so
this runner reads their output and decides pass/fail itself:

  a suite FAILS when
    * its exit code is not 0, or
    * it prints a line starting with "FAIL " or "ERR ", or
    * it prints "FAILS:" followed by anything other than 0 / [] / none, or
    * it prints a Python traceback, a page error or a browser console error.

Usage (from the repository root, after `npm run build`):

    python3 tests/e2e/run_all.py              # all suites
    python3 tests/e2e/run_all.py t7 t9        # only suites whose file name starts with these
    python3 tests/e2e/run_all.py -v           # also print every suite's full output

Screenshots and PDFs land in tests/e2e/shots/ (git-ignored).
"""
import glob
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TIMEOUT = 420  # seconds per suite

OK_FAILS = {'0', '[]', 'none', 'None', ''}


def verdict(code, out):
    problems = []
    if code != 0:
        problems.append('exit code %d' % code)
    for ln in out.splitlines():
        s = ln.strip()
        if s.startswith('FAIL ') or s.startswith('ERR '):
            problems.append(s[:160])
        elif s.startswith('FAILS:') and s[len('FAILS:'):].strip() not in OK_FAILS:
            problems.append(s[:160])
        elif 'Traceback (most recent call last)' in s or 'PAGEERROR' in s or s.startswith('CONSOLE error'):
            problems.append(s[:160])
        elif re.match(r'^\[.+\]$', s) and 'Error' in s:  # t3 prints the list of page errors
            problems.append(s[:160])
        elif s.startswith('ERRORS:') or (s.startswith('errors:') and s[len('errors:'):].strip() not in OK_FAILS):
            problems.append(s[:160])
    return problems


def main(argv):
    verbose = '-v' in argv
    names = [a for a in argv if not a.startswith('-')]
    dist = os.path.join(ROOT, 'dist', 'SIYADA.html')
    if not os.path.exists(dist) or not os.path.exists(os.path.join(ROOT, 'server', 'public', 'index.html')):
        sys.exit('dist/SIYADA.html or server/public/index.html is missing - run `npm run build` first')
    os.makedirs(os.path.join(HERE, 'shots'), exist_ok=True)

    suites = sorted(glob.glob(os.path.join(HERE, 't[0-9]*.py')))
    if names:
        suites = [s for s in suites if any(os.path.basename(s).startswith(n) for n in names)]
    if not suites:
        sys.exit('no suites matched')

    results = []
    for path in suites:
        name = os.path.basename(path)
        t0 = time.time()
        try:
            p = subprocess.run([sys.executable, path], cwd=ROOT, capture_output=True, text=True, timeout=TIMEOUT)
            code, out = p.returncode, p.stdout + p.stderr
        except subprocess.TimeoutExpired as e:
            code, out = 124, (e.stdout or '') if isinstance(e.stdout, str) else ''
            out += '\nTIMEOUT after %ds' % TIMEOUT
        problems = verdict(code, out)
        results.append((name, problems, time.time() - t0))
        print('%-5s %-16s %5.1fs' % ('PASS' if not problems else 'FAIL', name, time.time() - t0), flush=True)
        for pr in problems[:8]:
            print('        - ' + pr)
        if verbose or problems:
            print('\n'.join('        | ' + l for l in out.splitlines()[-25:]) if problems else out)

    bad = [r for r in results if r[1]]
    print('\n%d/%d suites passed' % (len(results) - len(bad), len(results)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
