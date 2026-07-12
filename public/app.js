// ---- OASys Notes SPA ----
const state = { current: null, index: [] };
let rawBody = '';
const $ = id => document.getElementById(id);
async function api(path, opts) { const r = await fetch(path, opts); return r.json(); }

function renderTree(files) {
  const tree = $('tree'); tree.innerHTML = '';
  const root = {};
  for (const f of files) {
    const parts = f.split('/');
    let node = root;
    parts.forEach((p, i) => { node[p] = node[p] || {}; if (i === parts.length - 1) node[p].__file = f; node = node[p]; });
  }
  const walk = (node, name, depth) => {
    if (name !== undefined) {
      if (node.__file) {
        const el = document.createElement('div'); el.className = 'file'; el.textContent = '📄 ' + name;
        el.style.paddingLeft = (depth * 12 + 8) + 'px'; el.onclick = () => openFile(node.__file); tree.appendChild(el);
      } else {
        const el = document.createElement('div'); el.className = 'folder'; el.textContent = '📁 ' + name;
        el.style.paddingLeft = (depth * 12) + 'px'; tree.appendChild(el);
      }
    }
    for (const k of Object.keys(node)) { if (k === '__file') continue; walk(node[k], k, depth + (name === undefined ? 0 : 1)); }
  };
  walk(root, undefined, 0);
}
function renderMarkdown(md) {
  return md
    .replace(/^###### (.*)$/gm, '<h6>$1</h6>').replace(/^##### (.*)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.*)$/gm, '<h4>$1</h4>').replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, t) => `<span class="embed" data-embed="${t.trim()}">⧉ embed: ${t.trim()}</span>`)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, t, label) => `<a class="wikilink" data-target="${t.trim()}">${label || t.trim()}</a>`)
    .replace(/\n/g, '<br/>');
}
function bindWikiLinks() {
  document.querySelectorAll('a.wikilink').forEach(a => a.onclick = () => resolveLink(a.dataset.target));
  document.querySelectorAll('.embed').forEach(e => e.onclick = () => resolveLink(e.dataset.embed));
}
function resolveLink(target) {
  const hit = state.index.find(x => x.title === target);
  if (hit) return openFile(hit.rel);
  if (confirm(`Create note "${target}"?`)) createNote(target);
}
async function openFile(rel) {
  state.current = rel;
  const n = await api('/api/note/' + encodeURIComponent(rel));
  if (n.error) return;
  rawBody = n.body || '';
  $('title').value = n.props.title || rel.replace(/\.md$/, '').split('/').pop();
  const skip = ['type', 'title'];
  $('props').innerHTML = Object.entries(n.props).filter(([k]) => !skip.includes(k))
    .map(([k, v]) => `<span class="chip"><b>${k}:</b> ${Array.isArray(v) ? v.join(', ') : v}</span>`).join('');
  $('editor').innerHTML = renderMarkdown(rawBody);
  bindWikiLinks();
  $('backlinks').innerHTML = (n.backlinks && n.backlinks.length)
    ? '<b>Backlinks:</b> ' + n.backlinks.map(b => `<a data-file="${b}">${b}</a>`).join(', ') : '';
  $('backlinks').querySelectorAll('a[data-file]').forEach(a => a.onclick = () => openFile(a.dataset.file));
  if (!$('sidepanel').hidden) showJSON(n);
}
async function createNote(title) {
  const rel = title.replace(/[^\w -]/g, '') + '.md';
  const type = prompt('Type (note/project/person):', 'note') || 'note';
  await api('/api/note/' + encodeURIComponent(rel), { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, props: { title }, body: '# ' + title + '\n\n' }) });
  await refresh(); openFile(rel);
}
$('editor').addEventListener('blur', () => { if (state.current) rawBody = $('editor').innerText; });
$('newBtn').onclick = () => { const t = prompt('New note title:'); if (t) createNote(t); };

let graphData = null;
$('graphBtn').onclick = async () => {
  const c = $('graph');
  if (!c.hidden) { c.hidden = true; return; }
  c.hidden = false; graphData = await api('/api/graph'); drawGraph();
};
function drawGraph() {
  const c = $('graph'); const ctx = c.getContext('2d');
  c.width = window.innerWidth; c.height = window.innerHeight - 45;
  const pos = {};
  graphData.nodes.forEach(n => pos[n.id] = { x: Math.random() * c.width, y: Math.random() * c.height, vx: 0, vy: 0 });
  function step() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const a of graphData.nodes) for (const b of graphData.nodes) {
      if (a === b) continue; const pa = pos[a.id], pb = pos[b.id];
      const dx = pa.x - pb.x, dy = pa.y - pb.y, d = Math.hypot(dx, dy) || 1;
      pa.vx += dx / d / d * 4; pa.vy += dy / d / d * 4;
    }
    for (const l of graphData.links) {
      const pa = pos[l.source], pb = pos[l.target];
      const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1;
      pa.vx += dx / d * 0.02; pa.vy += dy / d * 0.02; pb.vx -= dx / d * 0.02; pb.vy -= dy / d * 0.02;
      ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    for (const n of graphData.nodes) {
      const p = pos[n.id]; p.x += p.vx; p.y += p.vy; p.vx *= 0.85; p.vy *= 0.85;
      p.x = Math.max(10, Math.min(c.width - 10, p.x)); p.y = Math.max(10, Math.min(c.height - 10, p.y));
      ctx.fillStyle = n.type === 'project' ? '#c586c0' : n.type === 'person' ? '#4ec9b0' : '#569cd6';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ccc'; ctx.fillText(n.label, p.x + 8, p.y + 3);
    }
    requestAnimationFrame(step);
  }
  step();
}
$('jsonBtn').onclick = () => {
  const sp = $('sidepanel'); sp.hidden = !sp.hidden;
  if (!sp.hidden && state.current) api('/api/note/' + encodeURIComponent(state.current)).then(showJSON);
};
function showJSON(n) {
  const { rel, backlinks, body, ...rest } = n;
  $('sidepanel').innerHTML = '<h3>Structured (AI-visible)</h3><pre>' +
    JSON.stringify({ type: rest.type, props: rest.props, links: rest.links }, null, 2) + '</pre>';
}
let _patch = null;
$('aiBtn').onclick = () => { $('aiPanel').hidden = !$('aiPanel').hidden; };
$('aiCancel').onclick = () => { $('aiPanel').hidden = true; };
$('aiRun').onclick = async () => {
  const prompt = $('aiPrompt').value; const props = {};
  const m = prompt.match(/status\s+(?:to\s+)?(\w+)/i); if (m) props.status = m[1];
  const t = prompt.match(/tag\s+['"]?([\w-]+)['"]?/i);
  if (t) { const n = await api('/api/note/' + encodeURIComponent(state.current));
    const tags = Array.isArray(n.props.tags) ? [...n.props.tags] : []; if (!tags.includes(t[1])) tags.push(t[1]); props.tags = tags; }
  _patch = { rel: state.current, props };
  $('aiDiff').textContent = 'PATCH ' + state.current + '\n' + JSON.stringify(props, null, 2);
  $('aiApply').disabled = false;
};
$('aiApply').onclick = async () => {
  if (!_patch) return;
  const r = await api('/api/note/' + encodeURIComponent(_patch.rel), { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ props: _patch.props }) });
  if (r.error) { alert('Validation: ' + (r.details || r.error).join('\n')); return; }
  $('aiPanel').hidden = true; $('aiApply').disabled = true; openFile(_patch.rel);
};
async function refresh() { state.index = await api('/api/index'); renderTree(await api('/api/tree')); }
refresh().then(() => openFile('Index.md'));
