#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js غير مثبت. نزّل النسخة 22 أو أحدث من https://nodejs.org"; exit 1; }
# أول مرة من مستودع الكود: ابني صفحة التطبيق تلقائيًا
[ -f public/index.html ] || { [ -f ../scripts/build.js ] && node ../scripts/build.js; }
exec node server.js
