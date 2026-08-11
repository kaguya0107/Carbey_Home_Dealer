#!/usr/bin/env bash
# 操作マニュアル（Markdown）を PDF に変換するスクリプト。
# 使い方:  cd docs/manual && ./build-pdf.sh [ファイル名.md]
#   引数を省略すると operations-manual.md を変換します。
# 出力: 同名の .html（中間）と .pdf を生成します。
set -euo pipefail
cd "$(dirname "$0")"

MD="${1:-operations-manual.md}"
BASE="${MD%.md}"
HTML="$BASE.html"
PDF="$BASE.pdf"
TITLE="$(head -1 "$MD" | sed 's/^#\+ *//')"

echo "→ Markdown を変換: $MD"
python3 - "$MD" "$HTML" "$TITLE" <<'PY'
import re, html, sys
md_path, html_path, title = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(md_path, encoding='utf-8').read().split('\n')

def inline(t):
    t = html.escape(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'`(.+?)`', r'<code>\1</code>', t)
    t = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<em>\1</em>', t)
    return t

out, i, n = [], 0, len(lines)
while i < n:
    s = lines[i].strip()
    if not s:
        i += 1; continue
    if s == '---':
        out.append('<hr>'); i += 1; continue
    m = re.match(r'^(#{1,6})\s+(.*)$', s)
    if m:
        lvl = len(m.group(1)); out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>'); i += 1; continue
    if s.startswith('|'):
        tbl = []
        while i < n and lines[i].strip().startswith('|'):
            tbl.append(lines[i].strip()); i += 1
        cells = lambda r: [c.strip() for c in r.strip('|').split('|')]
        header = cells(tbl[0]); body = tbl[2:] if len(tbl) > 1 else []
        h = '<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in header) + '</tr></thead><tbody>'
        for r in body:
            h += '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in cells(r)) + '</tr>'
        out.append(h + '</tbody></table>'); continue
    if s.startswith('>'):
        q = []
        while i < n and lines[i].strip().startswith('>'):
            q.append(lines[i].strip()[1:].strip()); i += 1
        out.append('<blockquote>' + inline(' '.join(q)) + '</blockquote>'); continue
    if re.match(r'^(-|\d+\.)\s+', s):
        ordered = bool(re.match(r'^\d+\.\s+', s)); items = []
        while i < n and re.match(r'^(-|\d+\.)\s+', lines[i].strip()):
            items.append(re.sub(r'^(-|\d+\.)\s+', '', lines[i].strip())); i += 1
        tag = 'ol' if ordered else 'ul'
        out.append(f'<{tag}>' + ''.join(f'<li>{inline(it)}</li>' for it in items) + f'</{tag}>'); continue
    para = []
    while i < n and lines[i].strip() and not re.match(r'^(#{1,6}\s|\||>|-\s|\d+\.\s|---$)', lines[i].strip()):
        para.append(lines[i].strip()); i += 1
    out.append('<p>' + inline(' '.join(para)) + '</p>')

css = '''
@page { size: A4; margin: 16mm 15mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif; color:#1f2937; font-size:10pt; line-height:1.65; margin:0; }
h1 { font-size:18pt; color:#b91c1c; border-bottom:3px solid #b91c1c; padding-bottom:6px; margin:0 0 6px; }
h2 { font-size:13pt; color:#111827; background:#f1f5f9; border-left:5px solid #b91c1c; padding:6px 10px; margin:20px 0 8px; break-after:avoid; }
h3 { font-size:11pt; color:#b91c1c; margin:14px 0 6px; break-after:avoid; }
p { margin:0 0 8px; } ul,ol { margin:4px 0 10px; padding-left:1.4em; } li { margin:3px 0; }
table { width:100%; border-collapse:collapse; margin:8px 0 12px; font-size:9pt; break-inside:avoid; }
th,td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; vertical-align:top; }
th { background:#1f2937; color:#fff; font-weight:600; } tr:nth-child(even) td { background:#f8fafc; }
blockquote { margin:8px 0; padding:8px 12px; background:#fff7ed; border-left:4px solid #f59e0b; color:#7c2d12; font-size:9.2pt; }
hr { border:0; border-top:1px solid #e5e7eb; margin:16px 0; } code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:9pt; }
strong { color:#111827; } h1+p { color:#6b7280; font-size:9pt; }
'''
doc = f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{css}</style></head><body>' + '\n'.join(out) + '</body></html>'
open(html_path, 'w', encoding='utf-8').write(doc)
PY

echo "→ PDF を生成: $PDF"
CHROME="$(command -v google-chrome || command -v google-chrome-stable || echo /usr/bin/google-chrome)"
"$CHROME" --headless=new --disable-gpu --no-sandbox --no-pdf-header-footer \
  --print-to-pdf="$PDF" "file://$PWD/$HTML" >/dev/null 2>&1

echo "✓ 完了: $PWD/$PDF"
