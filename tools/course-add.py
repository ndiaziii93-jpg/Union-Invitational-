#!/usr/bin/env python3
"""Read a published scorecard and put it in the book, checked.

WHY THIS EXISTS. A member should not copy fifty-four numbers off a scorecard,
and nobody should pay a subscription so that twenty-three people can enter
their home clubs once. Almost every club publishes its own card on its own
website, which is the most authoritative copy there is. This reads one of
those, works out every tee set on it, checks the card is a real card, shows it
for a human to compare against the club's own page, and writes it into
COURSE_LIB in src/club.js.

SOURCE-AGNOSTIC ON PURPOSE. Fetching is not the hard part and it is different
every time: a club page, a PDF, a scorecard photo, a database that grants
access later. So this takes a FILE that already holds the card — HTML saved
from the club's page, or Markdown from a scraper — and the fetching is done
outside it, by whatever means suits. What is inside is the part that must be
right every time: reading the numbers, and refusing a card that is wrong.

WHAT IT REFUSES. The stroke index is the one number the book cannot do
without: it decides which holes a member gets a shot on, so a wrong one
quietly spoils every net score all season. A tee set is written only if it is
eighteen holes, every par between 3 and 6, and every index 1 to 18 exactly
once. Anything else is reported and left out. Nothing is guessed, ever: a
missing number stays missing.

  Read a card and show it:
    python3 tools/course-add.py --from card.html \\
        --name "Leatherhead Golf Club" --place "Leatherhead, Surrey, England" \\
        --source https://www.theleatherheadclub.com/the_course

  Add it to the book once the numbers have been checked by eye:
    ... --write

  Check what is written still matches the source:
    ... --verify
"""
import argparse, html, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLUB_JS = os.path.join(ROOT, 'src', 'club.js')

# A column heading that names a tee rather than a measurement.
NOT_A_TEE = re.compile(r'^(hole|par|si|s\.?i\.?|index|idx|stroke|handicap|hcp|h/?cap|'
                       r'out|in|total|tot|yards?|yds?|metres?|meters?|m|#|no\.?)$', re.I)
# Words that mean "the stroke index", whatever a club calls it.
IS_SI = re.compile(r'^(si|s\.?i\.?|index|idx|stroke\s*index|handicap|hcp|h/?cap)$', re.I)
IS_PAR = re.compile(r'^par$', re.I)
IS_HOLE = re.compile(r'^(hole|#|no\.?)$', re.I)


def cells(row_html):
    out = []
    for m in re.finditer(r'<t[dh][^>]*>(.*?)</t[dh]>', row_html, re.S | re.I):
        txt = re.sub(r'<[^>]+>', ' ', m.group(1))
        out.append(re.sub(r'\s+', ' ', html.unescape(txt)).strip())
    return out


def tables_from_html(doc):
    """Every table in the page, as lists of cells.

    Real club sites are not tidy: a <thead> whose <th> cells sit loose with no
    <tr> round them is common and perfectly legal, because a browser inserts
    the row itself. A reader that insists on <tr> silently loses the heading,
    and the heading is what names the tees — so the loose case is picked up too.
    """
    for t in re.findall(r'<table.*?</table>', doc, re.S | re.I):
        rows = [cells(r) for r in re.findall(r'<tr.*?</tr>', t, re.S | re.I)]
        rows = [r for r in rows if r]
        head = re.search(r'<thead[^>]*>(.*?)</thead>', t, re.S | re.I)
        if head and not re.search(r'<tr', head.group(1), re.I):
            loose = cells(head.group(1))
            if loose:
                rows.insert(0, loose)
        if rows:
            yield rows


def tables_from_markdown(doc):
    """Markdown pipe tables, as a scraper hands them over."""
    block, out = [], []
    for line in doc.split('\n'):
        if line.strip().startswith('|'):
            block.append([c.strip() for c in line.strip().strip('|').split('|')])
        else:
            if len(block) >= 3:
                out.append([r for r in block if not all(set(c) <= set('-: ') for c in r)])
            block = []
    if len(block) >= 3:
        out.append([r for r in block if not all(set(c) <= set('-: ') for c in r)])
    return out


def num(s):
    """The number in a cell, as a card means it.

    One wrinkle is worth the special case. Sites that offer a yards/metres
    switch often ship BOTH in the same cell and hide one with styling, so the
    text comes out as '505462' — 505 yards and 462 metres run together. Read
    naively that is a 5,054-yard hole. Six digits that split into two sensible
    hole lengths, the first longer than the second, are that, and the yardage
    is the front half.
    """
    t = re.sub(r'[,\s]', '', str(s or ''))
    m = re.match(r'^(\d+)', t)
    if not m:
        return None
    d = m.group(1)
    if len(d) == 6:
        a, b = int(d[:3]), int(d[3:])
        if 100 <= b < a <= 999:
            return a
    return int(d[:4]) if len(d) > 4 else int(d)


def read_rows_are_holes(rows):
    """A card printed with one row per hole: Hole | White | Par | SI | Yellow | ...

    The heading names the tees, and each tee is followed by the columns that
    belong to it, so Par and SI are read as the tee they sit under.
    """
    head = rows[0]
    if not head or not IS_HOLE.match(head[0] or ''):
        return []
    tees, cur = [], None
    for i, h in enumerate(head[1:], start=1):
        h = (h or '').strip()
        if not h:
            continue
        if IS_PAR.match(h):
            if cur: cur['par'] = i
        elif IS_SI.match(h):
            if cur: cur['si'] = i
        elif not NOT_A_TEE.match(h):
            cur = {'name': h, 'len': i, 'par': None, 'si': None}
            tees.append(cur)
    tees = [t for t in tees if t['par'] is not None and t['si'] is not None]
    if not tees:
        return []
    holes = {}
    for r in rows[1:]:
        n = num(r[0]) if r else None
        if n is None or not 1 <= n <= 18:
            continue                              # Out / In / Total lines
        holes[n] = r
    out = []
    for t in tees:
        card = []
        for n in range(1, 19):
            r = holes.get(n, [])
            g = lambda i: num(r[i]) if i is not None and i < len(r) else None
            card.append({'par': g(t['par']), 'si': g(t['si']), 'y': g(t['len'])})
        out.append({'tee': t['name'], 'holes': card})
    return out


def read_rows_are_measures(rows):
    """A card printed with one COLUMN per hole: a Par row, a Handicap row, and
    a row per tee. The first cell of each row says which it is."""
    head = rows[0]
    cols = []                                     # index of each hole column, 1..18
    for i, h in enumerate(head):
        if num(h) is not None and 1 <= num(h) <= 18:
            cols.append((num(h), i))
    if len(cols) < 18:
        return []
    cols = cols[:18]
    par_row = si_row = alt_par = None
    tee_rows = []
    for r in rows[1:]:
        lab = (r[0] if r else '').strip()
        if IS_PAR.match(lab) and par_row is None:
            par_row = r
        elif re.match(r'^par\b', lab, re.I) and re.search(r'ladies|women', lab, re.I) and alt_par is None:
            alt_par = r
        elif IS_SI.match(lab) and si_row is None:
            si_row = r
        elif lab and not NOT_A_TEE.match(lab) and not re.search(r'ladies|women', lab, re.I):
            vals = [num(r[i]) for _, i in cols if i < len(r)]
            if sum(1 for v in vals if v and v > 60) >= 14:   # a row of yardages
                tee_rows.append(r)
    if par_row is None or not tee_rows:
        return []
    # A card that prints two pars — one for men, one for ladies — gets the
    # men's, because that is what the group plays off. It is said out loud
    # rather than silently chosen, since on some holes they differ.
    note = ''
    if alt_par:
        a = [num(alt_par[i]) if i < len(alt_par) else None for _, i in cols]
        b = [num(par_row[i]) if i < len(par_row) else None for _, i in cols]
        if a != b:
            note = ('this card also prints a ladies\u2019 par (%s against %s); the men\u2019s is used'
                    % (sum(x or 0 for x in a), sum(x or 0 for x in b)))
    out = []
    for tr in tee_rows:
        card = []
        for n, i in cols:
            g = lambda row: (num(row[i]) if row and i < len(row) else None)
            card.append({'par': g(par_row), 'si': g(si_row), 'y': g(tr)})
        out.append({'tee': tr[0].strip(), 'holes': card, 'note': note})
    return out


def verdict(card):
    """Why this tee set cannot be used, or '' if it can."""
    h = card['holes']
    if len(h) != 18:
        return 'not eighteen holes'
    if any(x['par'] is None for x in h):
        return 'a par is missing'
    if not all(3 <= x['par'] <= 6 for x in h):
        return 'a par is outside 3 to 6'
    sis = [x['si'] for x in h]
    if any(s is None for s in sis):
        return 'no stroke index on this card'
    if sorted(sis) != list(range(1, 19)):
        return 'the stroke index is not 1 to 18 once each'
    return ''


def read(path):
    doc = io.open(path, encoding='utf-8', errors='replace').read()
    tabs = list(tables_from_html(doc)) + tables_from_markdown(doc)
    found = []
    for rows in tabs:
        for reader in (read_rows_are_holes, read_rows_are_measures):
            got = reader(rows)
            if got:
                found.extend(got)
                break
    # one card per tee name, the first wins
    seen, out = set(), []
    for c in found:
        k = c['tee'].strip().lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(c)
    return out


def show(cards, name, place):
    print('%s%s' % (name, ('  —  ' + place) if place else ''))
    print('-' * 72)
    for c in cards:
        why = verdict(c)
        par = sum(x['par'] or 0 for x in c['holes'])
        yds = sum(x['y'] or 0 for x in c['holes'])
        print('%-12s par %-4s %-6s %s' % (c['tee'], par or '?', (str(yds) + 'y') if yds else '',
                                          'OK' if not why else 'NOT USABLE — ' + why))
        print('   hole ' + ' '.join('%4d' % (i + 1) for i in range(18)))
        for k, lab in (('par', 'par '), ('si', 'idx '), ('y', 'yds ')):
            print('   ' + lab + ' ' + ' '.join('%4s' % ('·' if x[k] is None else x[k]) for x in c['holes']))
        print()


def js_entry(cid, name, place, source, card):
    pars = ', '.join(str(x['par']) for x in card['holes'])
    sis = ', '.join(str(x['si']) for x in card['holes'])
    yds = ', '.join('null' if x['y'] is None else str(x['y']) for x in card['holes'])
    par = sum(x['par'] for x in card['holes'])
    note = 'Par %d off the %s. Card as the club publishes it; check it against your own.' % (par, card['tee'].lower())
    esc = lambda s: str(s).replace('\\', '\\\\').replace("'", "\\'")
    return ("  { id: '%s', name: '%s', place: '%s',\n"
            "    note: '%s',\n"
            "    src: '%s',\n"
            "    ...card('%s',\n"
            "      [%s],\n"
            "      [%s],\n"
            "      [%s]) },\n") % (cid, esc(name), esc(place), esc(note), esc(source),
                                   esc(card['tee']), pars, sis, yds)


def slug(s):
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', str(s).lower()))


def write(cards, name, place, source):
    s = io.open(CLUB_JS, encoding='utf-8').read()
    anchor = '\nexport const COURSE_LIB = ['
    if anchor not in s:
        sys.exit('COURSE_LIB not found in src/club.js')
    base = slug(name)
    block = ''
    added = []
    for c in cards:
        if verdict(c):
            continue
        cid = base + '-' + slug(c['tee'])
        if ("id: '%s'" % cid) in s:
            print('already in the book:', cid)
            continue
        block += js_entry(cid, name, place, source, c)
        added.append(cid)
    if not block:
        print('nothing to add')
        return
    i = s.index(anchor) + len(anchor)
    s = s[:i] + '\n' + block.rstrip('\n') + s[i:]
    io.open(CLUB_JS, 'w', encoding='utf-8').write(s)
    print('added to src/club.js:', ', '.join(added))
    print('now run:  python3 tools/build.py && python3 tools/sandbox.py')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src', required=True, help='an HTML or Markdown file holding the card')
    ap.add_argument('--name', required=True, help='the club as a member would type it')
    ap.add_argument('--place', default='', help='town, county, country')
    ap.add_argument('--source', default='', help='the page the card came from, recorded with it')
    ap.add_argument('--write', action='store_true', help='write the usable tee sets into src/club.js')
    ap.add_argument('--json', help='also dump what was read, for a test to check')
    args = ap.parse_args()

    cards = read(args.src)
    if not cards:
        sys.exit('no scorecard table found in ' + args.src)
    show(cards, args.name, args.place)
    ok = [c for c in cards if not verdict(c)]
    print('%d tee set%s read, %d usable.' % (len(cards), '' if len(cards) == 1 else 's', len(ok)))
    for n in sorted({c.get('note') for c in cards if c.get('note')}):
        print('NOTE: ' + n + '.')
    if args.json:
        json.dump({'name': args.name, 'place': args.place, 'source': args.source,
                   'cards': [{'tee': c['tee'], 'ok': not verdict(c), 'why': verdict(c), 'holes': c['holes']}
                             for c in cards]}, io.open(args.json, 'w'), indent=1)
    if args.write:
        if not ok:
            sys.exit('nothing usable to write')
        write(cards, args.name, args.place, args.source)
    else:
        print('\nCheck these against the club’s own card, then run again with --write.')


if __name__ == '__main__':
    main()
