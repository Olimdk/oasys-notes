// ---- OASys Notes SPA (renderer) ----
const state = { current: null, index: [], tree: [], expanded: new Set(), query: '', tag: null };
let rawBody = '';
const $ = id => document.getElementById(id);

function renderTree() {
  const container = $('tree');
  container.innerHTML = '';
  const render = (nodes, depth) => {
    for (const n of nodes) {
      const el = document.createElement('div');
      el.className = n.type;
      if (n.type === 'folder') {
        const open = state.expanded.has(n.path);
        if (open) el.classList.add('open');
        el.textContent = n.name;
        el.style.paddingLeft = (depth * 12 + 4) + 'px';
        el.dataset.folder = n.path;
        el.onclick = (e) => { e.stopPropagation(); if (state.expanded.has(n.path)) state.expanded.delete(n.path); else state.expanded.add(n.path); renderTree(); };
      } else {
        if (n.path === state.current) el.classList.add('active');
        el.textContent = n.name;
        el.style.paddingLeft = (depth * 12 + 4) + 'px';
        el.dataset.rel = n.path;
        el.onclick = (e) => { e.stopPropagation(); openFile(n.path); };
      }
      el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showCtxMenu(e, n); });
      container.appendChild(el);
      if (n.children && n.children.length && (n.type !== 'folder' || state.expanded.has(n.path))) {
        render(n.children, depth + 1);
      }
    }
  };
  render(state.tree, 0);
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
  if (!rel) return;
  state.current = rel;
  const n = await window.oasys.read(rel);
  if (!n || n.error) { $('title').value = ''; $('props').innerHTML = ''; $('editor').innerHTML = '<p style="color:#666">Note not found.</p>'; return; }
  rawBody = n.body || '';
  $('title').value = n.props.title || rel.replace(/\.md$/, '').split('/').pop();
  const skip = ['type', 'title'];
  $('props').innerHTML = Object.entries(n.props).filter(([k]) => !skip.includes(k))
    .map(([k, v]) => `<span class="chip" data-tag="${Array.isArray(v)?v.join(','):v}"><b>${k}:</b> ${Array.isArray(v) ? v.join(', ') : v}</span>`).join('');
  $('props').querySelectorAll('.chip').forEach(c => c.onclick = () => { state.tag = c.dataset.tag; state.query=''; $('search').value=''; renderTree(); renderTags(); });
  $('editor').innerHTML = renderMarkdown(rawBody);
  bindWikiLinks();
  $('backlinks').innerHTML = (n.backlinks && n.backlinks.length)
    ? '<b>↩ backlinks:</b> ' + n.backlinks.map(b => `<a data-file="${b}">${b}</a>`).join(', ') : '';
  $('backlinks').querySelectorAll('a[data-file]').forEach(a => a.onclick = () => openFile(a.dataset.file));
  if (!$('sidepanel').hidden) showJSON(n);
  renderTree();
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
    add('📁 New folder here', () => { const name = prompt('Folder name:'); if (name) window.oasys.mkdir((node.path ? node.path + '/' : '') + name).then(refresh); });
    add('📄 New note here', () => { const name = prompt('Note name:'); if (name) createNote(name, node.path || ''); });
  }
  if (node.type === 'file') {
    add('✏️ Rename', () => { const name = prompt('New name (without .md):', node.name.replace(/\.md$/, '')); if (name) window.oasys.rename(node.path, node.path.replace(/[^/]+$/, name.replace(/[^\w -]/g, '') + '.md')).then(refresh); });
    add('🗑 Delete', () => { if (confirm('Delete ' + node.name + '?')) window.oasys.remove(node.path).then(() => { if (state.current === node.path) state.current = null; refresh(); }); });
  }
  add('➕ New note (root)', () => { const t = prompt('Note name:'); if (t) createNote(t, ''); });
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.hidden = false;
}
document.addEventListener('click', e => { if (!e.target.closest('#ctxMenu')) $('ctxMenu').hidden = true; });

$('editor').addEventListener('blur', () => { if (state.current) rawBody = $('editor').innerText; });
$('newBtn').onclick = () => { const t = prompt('New note title:'); if (t) createNote(t, ''); };
$('search').addEventListener('input', e => { state.query = e.target.value.toLowerCase(); state.tag = null; renderTree(); });

let graphData = null;
$('graphBtn').onclick = async () => {
  const c = $('graph');
  if (!c.hidden) { c.hidden = true; return; }
  c.hidden = false; graphData = await window.oasys.graph(); drawGraph();
};
function drawGraph() {
  const c = $('graph'); const ctx = c.getContext('2d');
  c.width = window.innerWidth; c.height = window.innerHeight - 45;
  const nodes = graphData.nodes, links = graphData.links;
  const pos = {};
  nodes.forEach(n => pos[n.id] = { x: c.width/2 + (Math.random()-0.5)*200, y: c.height/2 + (Math.random()-0.5)*200, vx:0, vy:0 });
  // adjacency for clustering
  const adj = {}; nodes.forEach(n => adj[n.id] = new Set());
  links.forEach(l => { adj[l.source] && adj[l.source].add(l.target); adj[l.target] && adj[l.target].add(l.source); });
  const degree = {}; nodes.forEach(n => degree[n.id] = adj[n.id].size);
  function step() {
    ctx.clearRect(0,0,c.width,c.height);
    // repulsion (all pairs)
    for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
      const a=pos[nodes[i].id], b=pos[nodes[j].id];
      let dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy+0.01, d=Math.sqrt(d2);
      const f = 4000/d2; // repulsion
      const fx=fx0(dx,d)*f, fy=fy0(dy,d)*f;
      a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
    }
    // spring attraction along edges (bundles connected notes)
    for (const l of links) {
      const a=pos[l.source], b=pos[l.target];
      let dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy)+0.01;
      const f = (d - 70) * 0.05; // rest length 70
      const fx=fx0(dx,d)*f, fy=fy0(dy,d)*f;
      a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
    }
    // mild gravity to center keeps everything on screen
    for (const n of nodes) {
      const p=pos[n.id];
      p.vx += (c.width/2 - p.x) * 0.002;
      p.vy += (c.height/2 - p.y) * 0.002;
    }
    for (const n of nodes) {
      const p=pos[n.id]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.85; p.vy*=0.85;
      p.x=Math.max(10,Math.min(c.width-10,p.x)); p.y=Math.max(10,Math.min(c.height-10,p.y));
    }
    // draw edges
    for (const l of links) { const a=pos[l.source], b=pos[l.target]; ctx.strokeStyle='#2a2a2a'; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    // draw nodes
    for (const n of nodes) {
      const p=pos[n.id]; const r=4+Math.min(8, degree[n.id]*1.5);
      ctx.fillStyle = n.type==='project'?'#c15f3c':n.type==='person'?'#4ec9b0':'#e0e0e0';
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,7); ctx.fill();
      ctx.fillStyle='#e0e0e0'; ctx.fillText(n.label, p.x+r+3, p.y+3);
    }
    requestAnimationFrame(step);
  }
  step();
}
function fx0(d,dist){ return d/dist; }
function fy0(d,dist){ return d/dist; }
$('jsonBtn').onclick = () => {
  const sp = $('sidepanel'); sp.hidden = !sp.hidden;
  if (!sp.hidden && state.current) window.oasys.read(state.current).then(showJSON);
  else if (!sp.hidden) renderTags();
};
function renderTags() {
  const tagSet = {};
  state.index.forEach(n => { const t = n.props.tags; if (Array.isArray(t)) t.forEach(x => tagSet[x]=(tagSet[x]||0)+1); });
  const tags = Object.entries(tagSet).sort((a,b)=>b[1]-a[1]);
  $('sidepanel').innerHTML = '<h3 class="mono">// tags (' + tags.length + ')</h3>' + tags.map(([t,c]) => `<span class="tag" data-tag="${t}">${t} (${c})</span>`).join('');
  $('sidepanel').querySelectorAll('.tag').forEach(el => el.onclick = () => {
    state.tag = el.dataset.tag; state.query=''; $('search').value=''; renderTree(); renderTags();
    if (state.index.find(x => (x.props.tags||[]).includes(state.tag))) openFile(state.index.find(x => (x.props.tags||[]).includes(state.tag)).rel);
  });
}
function showJSON(n) {
  const { rel, backlinks, body, ...rest } = n;
  $('sidepanel').innerHTML = '<h3 class="mono">// structured (agent-visible)</h3><pre class="mono">' +
    JSON.stringify({ type: rest.type, props: rest.props, links: rest.links }, null, 2) + '</pre>';
}
async function refresh() {
  state.index = await window.oasys.index();
  state.tree = await window.oasys.tree();
  // apply search/tag filter to tree
  filterTree();
  renderTree();
}
function filterTree() {
  if (!state.query && !state.tag) return;
  const matches = (n) => {
    if (n.type === 'file') {
      const rec = state.index.find(x => x.rel === n.path);
      const hay = (rec ? (rec.title + ' ' + (rec.props.tags||[]).join(' ') + ' ' + (rec.links||[]).join(' ')) : n.name).toLowerCase();
      if (state.query && !hay.includes(state.query)) return false;
      if (state.tag && !(rec && (rec.props.tags||[]).includes(state.tag))) return false;
    }
    return true;
  };
  const prune = (nodes) => nodes.filter(matches).map(n => { if (n.children) { n.children = prune(n.children); } return n; });
  state.tree = prune(state.tree);
  // auto-expand all when filtering
  const expandAll = (nodes) => nodes.forEach(n => { if (n.type==='folder'){ state.expanded.add(n.path); if (n.children) expandAll(n.children);} });
  expandAll(state.tree);
}
refresh().then(async () => {
  // expand top folders by default so user sees structure
  state.tree.filter(n=>n.type==='folder').forEach(f => state.expanded.add(f.path));
  renderTree();
  const first = state.index[0];
  if (first) openFile(first.rel);
});
