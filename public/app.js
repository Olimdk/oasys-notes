// ---- OASys Notes SPA (renderer) ----
const state = { current: null, index: [], tree: [] };
let rawBody = '';
const $ = id => document.getElementById(id);

function renderTree(nodes, container, depth = 0) {
  container.innerHTML = '';
  const render = (nodes, depth) => {
    for (const n of nodes) {
      const el = document.createElement('div');
      el.className = n.type;
      el.textContent = n.name;
      el.style.paddingLeft = (depth * 12 + 4) + 'px';
      if (n.type === 'file') {
        el.onclick = () => openFile(n.path);
        el.dataset.rel = n.path;
      } else {
        el.dataset.folder = n.path;
      }
      el.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, n); });
      container.appendChild(el);
      if (n.children && n.children.length) render(n.children, depth + 1);
    }
  };
  render(nodes, depth);
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
  if (confirm(`Create note "${target}"?`)) createNote(target, '');
}
async function openFile(rel) {
  state.current = rel;
  const n = await window.oasys.read(rel);
  if (!n || n.error) return;
  rawBody = n.body || '';
  $('title').value = n.props.title || rel.replace(/\.md$/, '').split('/').pop();
  const skip = ['type', 'title'];
  $('props').innerHTML = Object.entries(n.props).filter(([k]) => !skip.includes(k))
    .map(([k, v]) => `<span class="chip"><b>${k}:</b> ${Array.isArray(v) ? v.join(', ') : v}</span>`).join('');
  $('editor').innerHTML = renderMarkdown(rawBody);
  bindWikiLinks();
  $('backlinks').innerHTML = (n.backlinks && n.backlinks.length)
    ? '<b>↩ backlinks:</b> ' + n.backlinks.map(b => `<a data-file="${b}">${b}</a>`).join(', ') : '';
  $('backlinks').querySelectorAll('a[data-file]').forEach(a => a.onclick = () => openFile(a.dataset.file));
  if (!$('sidepanel').hidden) showJSON(n);
}
async function createNote(title, folder) {
  const base = (folder ? folder + '/' : '') + title.replace(/[^\w -]/g, '');
  const rel = base + '.md';
  const type = prompt('Type (note/project/person):', 'note') || 'note';
  await window.oasys.create(rel, { type, props: { title }, body: '# ' + title + '\n\n' });
  await refresh(); openFile(rel);
}
function showCtxMenu(e, node) {
  const menu = $('ctxMenu');
  menu.innerHTML = '';
  const add = (label, fn) => { const d = document.createElement('div'); d.textContent = label; d.onclick = () => { menu.hidden = true; fn(); }; menu.appendChild(d); };
  if (node.type === 'folder' || node.name === undefined) {
    add('📁 New folder here', () => {
      const name = prompt('Folder name:'); if (name) window.oasys.mkdir((node.path ? node.path + '/' : '') + name).then(refresh);
    });
    add('📄 New note here', () => {
      const name = prompt('Note name:'); if (name) createNote(name, node.path || '');
    });
  }
  if (node.type === 'file') {
    add('✏️ Rename', () => {
      const name = prompt('New name (without .md):', node.name.replace(/\.md$/, ''));
      if (name) window.oasys.rename(node.path, node.path.replace(/[^/]+$/, name.replace(/[^\w -]/g, '') + '.md')).then(refresh);
    });
    add('🗑 Delete', () => {
      if (confirm('Delete ' + node.name + '?')) window.oasys.remove(node.path).then(() => { if (state.current === node.path) state.current = null; refresh(); });
    });
  }
  add('➕ New note (root)', () => { const t = prompt('Note name:'); if (t) createNote(t, ''); });
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.hidden = false;
}
document.addEventListener('click', e => { if (!e.target.closest('#ctxMenu')) $('ctxMenu').hidden = true; });

$('editor').addEventListener('blur', () => { if (state.current) rawBody = $('editor').innerText; });
$('newBtn').onclick = () => { const t = prompt('New note title:'); if (t) createNote(t, ''); };

let graphData = null;
$('graphBtn').onclick = async () => {
  const c = $('graph');
  if (!c.hidden) { c.hidden = true; return; }
  c.hidden = false; graphData = await window.oasys.graph(); drawGraph();
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
      ctx.strokeStyle = '#2a2a2a'; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    for (const n of graphData.nodes) {
      const p = pos[n.id]; p.x += p.vx; p.y += p.vy; p.vx *= 0.85; p.vy *= 0.85;
      p.x = Math.max(10, Math.min(c.width - 10, p.x)); p.y = Math.max(10, Math.min(c.height - 10, p.y));
      ctx.fillStyle = n.type === 'project' ? '#c15f3c' : n.type === 'person' ? '#4ec9b0' : '#e0e0e0';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#e0e0e0'; ctx.fillText(n.label, p.x + 8, p.y + 3);
    }
    requestAnimationFrame(step);
  }
  step();
}
$('jsonBtn').onclick = () => {
  const sp = $('sidepanel'); sp.hidden = !sp.hidden;
  if (!sp.hidden && state.current) window.oasys.read(state.current).then(showJSON);
};
function showJSON(n) {
  const { rel, backlinks, body, ...rest } = n;
  $('sidepanel').innerHTML = '<h3 class="mono">// structured (agent-visible)</h3><pre class="mono">' +
    JSON.stringify({ type: rest.type, props: rest.props, links: rest.links }, null, 2) + '</pre>';
}
async function refresh() {
  state.index = await window.oasys.index();
  state.tree = await window.oasys.tree();
  renderTree(state.tree, $('tree'));
}
refresh().then(() => openFile('Index.md'));
