#!/usr/bin/env python3
"""Make the break-it test copy of the book.

Same page, published WITHOUT the db capability, so claude.use('db') hands
back nothing and the book falls into local mode: every tester keeps their
own data on their own device and the masthead tells them so. Nobody can
reach the real tournament through it. Run after tools/build.py.
"""
import pathlib

dist = pathlib.Path(__file__).resolve().parent.parent / 'dist'
src = dist / 'union-invitational.html'
out = dist / 'union-invitational-sandbox.html'

html = src.read_text(encoding='utf-8')
old = '<title>Union Invitational Yardage Book</title>'
new = '<title>Union Invitational Test Copy</title>'
if old not in html:
    raise SystemExit('the title has moved — update tools/sandbox.py')
out.write_text(html.replace(old, new, 1), encoding='utf-8')
print(f'{out}  {out.stat().st_size / 1e6:.2f} MB')
