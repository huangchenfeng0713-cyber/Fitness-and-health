from pathlib import Path

p = Path('scripts/smoke.mjs')
text = p.read_text(encoding='utf-8')
old = """      rows, chips, chipText, foot, split,\n      splitCount: document.querySelectorAll('.split-row').length,\n      ringStroke: ring ? getComputedStyle(ring).stroke : null,\n"""
new = """      rows, chips, chipText, foot, split,\n      heroText: document.querySelector('.hero')?.innerText.replace(/\\n/g, ' ') || '',\n      splitCount: document.querySelectorAll('.split-row').length,\n      ringStroke: ring ? getComputedStyle(ring).stroke : null,\n"""
if text.count(old) != 1:
    raise SystemExit(f'hero return pattern count={text.count(old)}')
text = text.replace(old, new, 1)
old = """    !/多|超/.test(semantics.foot) && `没吃超，圆环颜色这条没测到（${semantics.foot}）`,\n"""
new = """    !/多|超|高/.test(semantics.heroText) && `没吃超，圆环颜色这条没测到（${semantics.heroText}）`,\n"""
if text.count(old) != 1:
    raise SystemExit(f'over-state guard pattern count={text.count(old)}')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')
print('smoke contract updated')
