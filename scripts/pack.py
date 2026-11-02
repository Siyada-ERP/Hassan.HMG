#!/usr/bin/env python3
"""Build the delivery bundle  dist/SIYADA_Server.zip  (run `npm run build` first, or `npm run pack`).

Layout inside the zip (this is what end users unzip and what docs/DEPLOYMENT.ar.md describes):

    SIYADA/
      README-AR.md                 deployment guide
      offline/SIYADA.html          the single-file app
      server/...                   ready-to-run server (+ public/index.html)
      source/                      app source: client/src + scripts/build.js (+ package.json)

Only tracked-looking files are packed: no node_modules, no data/, no databases, no .env.
"""
import os
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIST = os.path.join(ROOT, 'dist')
HTML = os.path.join(DIST, 'SIYADA.html')
OUT = os.path.join(DIST, 'SIYADA_Server.zip')
TOP = 'SIYADA/'
SKIP_DIRS = {'node_modules', 'data', '.git', 'public', '__pycache__'}
SKIP_EXT = ('.db', '.db-wal', '.db-shm', '.log')
SKIP_NAMES = {'.env'}
EXEC = {'start.sh'}  # keep the executable bit for the shell launcher


def main():
    if not os.path.exists(HTML):
        sys.exit('dist/SIYADA.html not found - run `npm run build` first')
    html = open(HTML, 'rb').read()
    if os.path.exists(OUT):
        os.remove(OUT)

    z = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED)

    def add(path, arc):
        info = zipfile.ZipInfo.from_file(path, TOP + arc)
        info.compress_type = zipfile.ZIP_DEFLATED
        mode = 0o755 if os.path.basename(path) in EXEC else 0o644
        info.external_attr = (0o100000 | mode) << 16
        with open(path, 'rb') as f:
            z.writestr(info, f.read())

    add(os.path.join(ROOT, 'docs', 'DEPLOYMENT.ar.md'), 'README-AR.md')
    add(os.path.join(ROOT, 'docs', 'DEPLOYMENT.ar.md'), 'server/README-AR.md')

    server = os.path.join(ROOT, 'server')
    for base, dirs, files in os.walk(server):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for f in sorted(files):
            if f.endswith(SKIP_EXT) or f in SKIP_NAMES or f == 'README.md':
                continue
            p = os.path.join(base, f)
            add(p, 'server/' + os.path.relpath(p, server).replace(os.sep, '/'))

    z.writestr(TOP + 'server/public/index.html', html)
    z.writestr(TOP + 'offline/SIYADA.html', html)

    add(os.path.join(ROOT, 'scripts', 'build.js'), 'source/scripts/build.js')
    add(os.path.join(ROOT, 'package.json'), 'source/package.json')
    src = os.path.join(ROOT, 'client', 'src')
    for f in sorted(os.listdir(src)):
        add(os.path.join(src, f), 'source/client/src/' + f)

    z.close()
    names = zipfile.ZipFile(OUT).namelist()
    print('%s  %d KB  %d files' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024, len(names)))


if __name__ == '__main__':
    main()
