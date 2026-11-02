#!/usr/bin/env python3
"""Anonymise a SIYADA CSV export so it can be committed as a test fixture.

Real exports contain customer / supplier names, phone numbers, addresses, the
company name and free-text notes. NEVER commit those. Run this script on the
export and commit only its output:

    python3 scripts/anonymize_fixtures.py  <input-dir>  <output-dir>

What changes:
  * party names        -> "عميل <code>" / "مورد <code>" (everywhere they appear)
  * phone numbers      -> "غير موجود"
  * addresses          -> "منطقة N" (one label per distinct address)
  * company name       -> "شركة تجريبية" (+ any tax / registry / phone / address setting is blanked)
  * free-text notes    -> text fragments seen fewer than 5 times become "ملاحظة"
                          ("... مدفوع مع فاتورة ... رقم X" fragments are kept)
What does NOT change: every amount, quantity, date, code and account, so the
engine tie-out tests (tests/engine/engine.test.js) still prove the same numbers.
"""
import csv
import os
import re
import sys
from collections import Counter

BOM = '﻿'
KEEP_MIN_FREQ = 5
SEP = ' - '


def read(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rdr = csv.reader(f)
        head = next(rdr)
        return head, [dict(zip(head, r)) for r in rdr]


def write(path, head, rows):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(BOM)
        w = csv.writer(f, lineterminator='\n')
        w.writerow(head)
        for r in rows:
            w.writerow([r.get(h, '') for h in head])


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    files = {f: read(os.path.join(src, f)) for f in sorted(os.listdir(src)) if f.endswith('.csv')}

    # --- parties: stable synthetic names + addresses
    name_of = {}
    addr_of = {}
    real_names = set()
    if 'parties.csv' in files:
        head, rows = files['parties.csv']
        for r in rows:
            code = r['party_code']
            if len(r['party_name'].strip()) > 3:
                real_names.add(r['party_name'].strip())
            is_supplier = r.get('party_type') == 'مورد' or code.upper().startswith('R-')
            name_of[code] = ('مورد ' if is_supplier else 'عميل ') + code
            a = (r.get('address') or '').strip()
            if a and a not in addr_of:
                addr_of[a] = 'منطقة %d' % (len(addr_of) + 1)
            r['party_name'] = name_of[code]
            r['address'] = addr_of.get(a, '')
            if (r.get('phone') or '').strip() not in ('', 'غير موجود'):
                r['phone'] = 'غير موجود'

    # --- free-text fragments: keep only frequent / structural ones
    freq = Counter()
    for fn in ('journal_lines.csv', 'transactions.csv'):
        if fn in files:
            for r in files[fn][1]:
                for t in (r.get('description') or '').split(SEP):
                    freq[t] += 1
    structural = re.compile(r'^مدفوع مع فاتورة')

    def clean_note(text):
        if not text:
            return text
        out = []
        for t in text.split(SEP):
            out.append(t if (structural.match(t) or freq[t] >= KEEP_MIN_FREQ) else 'ملاحظة')
        return SEP.join(out)

    # --- apply to every file that carries those columns
    for fn, (head, rows) in files.items():
        for r in rows:
            if 'party_code' in r and 'party_name' in r and fn != 'parties.csv':
                if r['party_code'] in name_of:
                    r['party_name'] = name_of[r['party_code']]
            if 'description' in r:
                r['description'] = clean_note(r['description'])

    # --- mapping rules: a category that is really a party / business name
    if 'mapping_rules.csv' in files:
        n = 0
        for r in files['mapping_rules.csv'][1]:
            if r.get('key', '').strip() in real_names:
                n += 1
                r['key'] = 'تصنيف %d' % n

    # --- settings: company identity
    if 'settings.csv' in files:
        head, rows = files['settings.csv']
        for r in rows:
            label = r.get('label', '')
            if label == 'اسم الشركة':
                r['value'] = 'شركة تجريبية'
            elif any(w in label for w in ('هاتف', 'عنوان', 'سجل تجاري', 'بطاقة ضريبية', 'رقم ضريبي', 'الرقم الضريبي')):
                r['value'] = ''

    for fn, (head, rows) in files.items():
        write(os.path.join(dst, fn), head, rows)

    # --- self-check: no original party name may survive in any output file
    leaks = []
    for fn in files:
        with open(os.path.join(dst, fn), encoding='utf-8-sig') as f:
            text = f.read()
        leaks += [(fn, n) for n in real_names if n in text]
    if leaks:
        sys.exit('anonymisation FAILED, original names still present: %r' % leaks[:5])
    print('anonymised %d files (%d parties) -> %s' % (len(files), len(name_of), dst))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
