import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, relPath, pct } from './util.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABEL = {
  pass: 'unchanged',
  fail: 'changed',
  new: 'new',
  error: 'error',
};

function badge(result) {
  const text =
    result.status === 'new'
      ? 'no baseline yet'
      : result.status === 'error'
        ? 'capture failed'
        : result.status === 'pass'
          ? 'unchanged'
          : `${pct(result.ratio)} changed`;
  return `<span class="badge ${result.status}" title="${esc(LABEL[result.status] || '')}">${esc(text)}</span>`;
}

function sizeNote(result) {
  if (!result.sizeChanged) return '';
  const b = result.baseline;
  const c = result.current;
  return `<span class="note">size ${b.width}×${b.height} → ${c.width}×${c.height}</span>`;
}

function card(result, runDir) {
  const baselineSrc = result.baseline
    ? relPath(path.join(runDir, 'report.html'), path.join(runDir, '..', '..', 'baselines', result.file))
    : null;
  const currentSrc = relPath(path.join(runDir, 'report.html'), path.join(runDir, result.file));
  const diffSrc = result.diffFile
    ? relPath(path.join(runDir, 'report.html'), path.join(runDir, result.diffFile))
    : null;

  const canCompare = Boolean(baselineSrc);
  const modes = canCompare ? ['side', 'overlay', 'diff'] : ['side'];
  const tabs = canCompare
    ? `<div class="tabs" role="tablist">
        <button role="tab" class="active" data-mode="side">Side by side</button>
        <button role="tab" data-mode="overlay">Onion skin</button>
        <button role="tab" data-mode="diff">Diff</button>
      </div>`
    : '';

  const side = canCompare
    ? `<figure><figcaption>baseline</figcaption><a href="${esc(baselineSrc)}"><img src="${esc(baselineSrc)}" alt="baseline"></a></figure>
       <figure><figcaption>current</figcaption><a href="${esc(currentSrc)}"><img src="${esc(currentSrc)}" alt="current"></a></figure>`
    : `<figure><figcaption>current</figcaption><a href="${esc(currentSrc)}"><img src="${esc(currentSrc)}" alt="current"></a></figure>`;

  const overlay = canCompare
    ? `<div class="onion">
         <img class="under" src="${esc(baselineSrc)}" alt="baseline">
         <img class="over" src="${esc(currentSrc)}" alt="current">
       </div>
       <input type="range" min="0" max="100" value="50" class="slider" aria-label="Reveal current over baseline">`
    : '';

  const diff = diffSrc
    ? `<figure class="single"><figcaption>changed pixels</figcaption><img src="${esc(diffSrc)}" alt="diff"></figure>`
    : '';

  return `<article class="card ${result.status}" data-status="${result.status}">
    <header class="card-head">
      <div class="ident">
        <h2>${esc(result.name)}</h2>
        <span class="meta">${esc(result.viewport)} · <a href="${esc(result.url)}" target="_blank" rel="noreferrer">${esc(result.url)}</a></span>
      </div>
      <div class="verdict">${badge(result)}${sizeNote(result)}</div>
    </header>
    ${tabs}
    <div class="stage mode-${modes[0]}">
      <div class="pane pane-side">${side}</div>
      <div class="pane pane-overlay">${overlay}</div>
      <div class="pane pane-diff">${diff}</div>
    </div>
  </article>`;
}

const STYLE = `
:root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--text:#e6edf3;--dim:#8b949e;
--pass:#3fb950;--fail:#f85149;--new:#d29922;--error:#a371f7;--accent:#58a6ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
header.top{display:flex;flex-wrap:wrap;gap:16px;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:28px}
header.top h1{font-size:22px;margin:0;letter-spacing:-.02em}
header.top h1 span{color:var(--dim);font-weight:400}
.tally{display:flex;gap:10px;flex-wrap:wrap}
.tally div{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-variant-numeric:tabular-nums}
.tally b{font-size:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin:0 0 20px;overflow:hidden}
.card.fail{border-color:#5a1e1e}
.card-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}
.card-head h2{font-size:15px;margin:0;font-weight:600}
.meta{color:var(--dim);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.verdict{display:flex;align-items:center;gap:10px}
.badge{font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;border:1px solid currentColor}
.badge.pass{color:var(--pass)}.badge.fail{color:var(--fail)}.badge.new{color:var(--new)}.badge.error{color:var(--error)}
.note{color:var(--dim);font-size:12px;font-family:ui-monospace,monospace}
.tabs{display:flex;gap:4px;padding:10px 16px 0}
.tabs button{background:transparent;border:1px solid transparent;color:var(--dim);font:inherit;font-size:12px;padding:5px 10px;border-radius:6px;cursor:pointer}
.tabs button:hover{color:var(--text);background:#21262d}
.tabs button.active{color:var(--text);background:#21262d;border-color:var(--line)}
.stage{padding:16px}
.pane{display:none}
.stage.mode-side .pane-side,.stage.mode-overlay .pane-overlay,.stage.mode-diff .pane-diff{display:block}
.pane-side{display:none;gap:16px}
.stage.mode-side .pane-side{display:grid;grid-template-columns:1fr 1fr}
figure{margin:0;background:#010409;border:1px solid var(--line);border-radius:8px;overflow:hidden}
figcaption{font:11px ui-monospace,monospace;color:var(--dim);padding:6px 10px;border-bottom:1px solid var(--line);text-transform:uppercase;letter-spacing:.06em}
figure img{display:block;width:100%;max-height:70vh;object-fit:contain;object-position:top}
figure.single img{max-height:none}
.onion{position:relative;background:#010409;border:1px solid var(--line);border-radius:8px;overflow:hidden;max-height:70vh}
.onion img{display:block;width:100%;object-fit:contain;object-position:top}
.onion .over{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}
.slider{width:100%;margin:12px 0 0;accent-color:var(--accent)}
@media(max-width:760px){.stage.mode-side .pane-side{grid-template-columns:1fr}}
footer{margin-top:40px;color:var(--dim);font-size:12px;text-align:center}
`;

const SCRIPT = `
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.tabs button');
  if (!btn) return;
  const card = btn.closest('.card');
  const stage = card.querySelector('.stage');
  card.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  stage.className = 'stage mode-' + btn.dataset.mode;
});
document.querySelectorAll('.onion').forEach((onion) => {
  const slider = onion.parentElement.querySelector('.slider');
  if (!slider) return;
  const update = () => { onion.querySelector('.over').style.clipPath = 'inset(0 ' + (100 - slider.value) + '% 0 0)'; };
  slider.addEventListener('input', update);
  update();
});
`;

export function renderReport(results, runDir, meta = {}) {
  const tally = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const generated = meta.generatedAt || new Date().toISOString();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>doubletake · visual report</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>doubletake <span>· visual report</span></h1>
    <div class="tally">
      <div><b>${results.length}</b> shots</div>
      <div style="color:var(--pass)"><b>${tally.pass || 0}</b> unchanged</div>
      <div style="color:var(--fail)"><b>${tally.fail || 0}</b> changed</div>
      <div style="color:var(--new)"><b>${tally.new || 0}</b> new</div>
    </div>
  </header>
  ${results.map((r) => card(r, runDir)).join('\n')}
  <footer>generated ${esc(generated)} · baselines live in <code>.doubletake/baselines</code></footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;

  const out = path.join(runDir, 'report.html');
  ensureDir(runDir);
  fs.writeFileSync(out, html);
  return out;
}
