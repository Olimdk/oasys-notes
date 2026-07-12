// OASys Notes — pure file-system note engine (no HTTP, runs in the app process).
// Supports two note backends:
//   - .md   : Markdown + YAML frontmatter (Obsidian-like)
//   - .html : HTML note with <oasys-note> root + <oasys-graph> components
// Both preserve [[wikilinks]], backlinks and the vault graph.
const fs = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', 'vault');
const SCHEMAS = path.join(__dirname, '..', 'schemas');

function cleanScalar(s) {
  return String(s).trim().replace(/^[["']+/g, '').replace(/["'\]]+$/g, '').trim();
}
function parseYamlSimple(s) {
  const out = {};
  let curKey = null, curList = null;
  for (let line of s.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s*-\s+/.test(line)) {
      if (curList) curList.push(cleanScalar(line.trim().replace(/^\s*-\s+/, '')));
      continue;
    }
    const cm = line.match(/^([\w-]+):\s*(.*)$/);
    if (cm) {
      curKey = cm[1]; curList = null;
      let v = cm[2].trim();
      if (v === '') { curList = []; out[curKey] = curList; continue; }
      if (v.startsWith('[') && v.endsWith(']')) {
        out[curKey] = v.slice(1, -1).split(',').map(x => cleanScalar(x)).filter(s => s !== '');
      } else {
        out[curKey] = cleanScalar(v);
      }
    }
  }
  return out;
}
function parseNote(text) {
  let props = {}, body = text, type = 'note';
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    props = parseYamlSimple(m[1]);
    type = props.type || 'note';
  }
  const links = new Set();
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g; let mm;
  while ((mm = re.exec(body))) links.add(mm[1].trim());
  if (Array.isArray(props.links)) props.links.forEach(l => links.add(cleanScalar(l)));
  return { type, props, body, links: [...links] };
}
function serializeNote({ type, props, body }) {
  props = { ...props, type };
  let yaml = '---\n';
  yaml += `type: ${type}\n`;
  for (const [k, v] of Object.entries(props)) {
    if (k === 'type') continue;
    if (Array.isArray(v)) yaml += `${k}: [${v.map(x => `"${cleanScalar(x)}"`).join(', ')}]\n`;
    else yaml += `${k}: ${cleanScalar(v)}\n`;
  }
  yaml += `---\n${body}`;
  return yaml;
}

// ---------- HTML note backend ----------
function parseAttrs(s) {
  const out = {};
  const re = /([\w-]+)\s*=\s*"([^"]*)"/g; let m;
  while ((m = re.exec(s))) out[m[1]] = m[2];
  return out;
}
function parseHtmlNote(text) {
  let type = 'note', props = {};
  const root = text.match(/<oasys-note([^>]*)>/i);
  if (root) {
    const attrs = parseAttrs(root[1]);
    type = attrs.type || 'note';
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'type') continue;
      props[k] = v.includes(',') ? v.split(',').map(s => cleanScalar(s)) : cleanScalar(v);
    }
  }
  const links = new Set();
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g; let mm;
  while ((mm = re.exec(text))) links.add(mm[1].trim());

  const graphs = [];
  const gRe = /<oasys-graph([^>]*)>([\s\S]*?)<\/oasys-graph>/gi; let gm;
  while ((gm = gRe.exec(text))) {
    const gattrs = parseAttrs(gm[1]);
    const nodes = [], edges = [];
    const nRe = /<oasys-node([^>]*)\/?>/gi; let nm;
    while ((nm = nRe.exec(gm[2]))) { const a = parseAttrs(nm[1]); nodes.push({ id: a.id, label: a.label || a.id, type: a.type }); }
    const eRe = /<oasys-edge([^>]*)\/?>/gi; let em;
    while ((em = eRe.exec(gm[2]))) { const a = parseAttrs(em[1]); edges.push({ from: a.from, to: a.to }); }
    graphs.push({ id: gattrs.id || ('g' + graphs.length), nodes, edges });
  }
  return { type, props, body: text, links: [...links], graphs };
}
function serializeHtmlNote({ type, props, body }) {
  const attrStr = `type="${type}" ` + Object.entries(props)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `${k}="${Array.isArray(v) ? v.join(', ') : v}"`).join(' ');
  return `<oasys-note ${attrStr}>\n${body}\n</oasys-note>\n`;
}
function isHtml(rel) { return rel.endsWith('.html'); }
function parseByExt(rel, text) { return isHtml(rel) ? parseHtmlNote(text) : parseNote(text); }

function loadSchemas() {
  const out = {};
  if (fs.existsSync(SCHEMAS)) {
    for (const f of fs.readdirSync(SCHEMAS)) {
      if (f.endsWith('.json')) out[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(path.join(SCHEMAS, f), 'utf8'));
    }
  }
  return out;
}
const SCHEMAS_DEF = loadSchemas();
function validate(type, props) {
  const sch = SCHEMAS_DEF[type] || SCHEMAS_DEF.note || {};
  const errs = [];
  for (const [k, def] of Object.entries(sch.fields || {})) {
    const val = props[k];
    if (def.required && (val === undefined || val === '')) errs.push(`${k} is required`);
    if (val !== undefined && def.type === 'enum' && !def.values.includes(val)) errs.push(`${k} must be one of ${def.values.join(', ')}`);
    if (val !== undefined && def.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) errs.push(`${k} must be YYYY-MM-DD`);
  }
  return errs;
}
function safeJoin(base, p) {
  const full = path.resolve(base, '.' + path.sep + (p || ''));
  if (!full.startsWith(path.resolve(base))) return null;
  return full;
}
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    const rel = path.relative(base, fp).split(path.sep).join('/');
    if (e.isDirectory()) walk(fp, base, out);
    else if (e.name.endsWith('.md') || e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}
function getIndex() {
  return walk(VAULT).map(f => {
    const n = parseByExt(f, fs.readFileSync(path.join(VAULT, f), 'utf8'));
    return { rel: f, title: n.props.title || path.basename(f).replace(/\.(md|html)$/, ''), type: n.type, links: n.links, backend: isHtml(f) ? 'html' : 'md' };
  });
}
function getBacklinks(targetRel) {
  const idx = getIndex();
  const t = idx.find(x => x.rel === targetRel);
  if (!t) return [];
  return idx.filter(x => x.rel !== targetRel && x.links.includes(t.title)).map(x => x.rel);
}
function getGraph() {
  const idx = getIndex();
  const nodes = idx.map(x => ({ id: x.rel, label: x.title, type: x.type, backend: x.backend }));
  const links = [];
  for (const x of idx) for (const t of x.links) {
    const tr = idx.find(y => y.title === t);
    if (tr && tr.rel !== x.rel) links.push({ source: x.rel, target: tr.rel });
  }
  return { nodes, links };
}
function getEmbeddedGraphs(rel) {
  const fp = safeJoin(VAULT, rel);
  if (!fp || !fs.existsSync(fp)) return [];
  const n = parseHtmlNote(fs.readFileSync(fp, 'utf8'));
  return n.graphs || [];
}
function readNote(rel) {
  const fp = safeJoin(VAULT, rel);
  if (!fp || !fs.existsSync(fp)) { const e = new Error('not found'); e.code = 'ENOENT'; throw e; }
  const n = parseByExt(rel, fs.readFileSync(fp, 'utf8'));
  n.rel = rel;
  n.backlinks = getBacklinks(rel);
  n.graphs = isHtml(rel) ? (n.graphs || []) : [];
  return n;
}
function writeNote(rel, note) {
  const fp = safeJoin(VAULT, rel);
  if (!fp) { const e = new Error('bad path'); e.code = 'EBADPATH'; throw e; }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const text = isHtml(rel) ? serializeHtmlNote(note) : serializeNote(note);
  fs.writeFileSync(fp, text, 'utf8');
  return { ok: true, backlinks: getBacklinks(rel) };
}
function patchNote(rel, props) {
  const fp = safeJoin(VAULT, rel);
  if (!fp || !fs.existsSync(fp)) { const e = new Error('not found'); e.code = 'ENOENT'; throw e; }
  const n = parseByExt(rel, fs.readFileSync(fp, 'utf8'));
  Object.assign(n.props, props);
  const errs = validate(n.type, n.props);
  if (errs.length) { const e = new Error('validation'); e.code = 'EVALID'; e.details = errs; throw e; }
  fs.writeFileSync(fp, isHtml(rel) ? serializeHtmlNote(n) : serializeNote(n), 'utf8');
  return { ok: true, props: n.props, backlinks: getBacklinks(rel) };
}
function seedDemoVault() {
  const mdNotes = [
    { rel: 'Index.md', note: { type: 'note', props: { title: 'Index', tags: ['home', 'meta'], status: 'active' }, body: '# Index\n\nWelcome to **OASys Notes**.\n\n- [[Local Notes App]]\n- [[Alice]]\n- [[Getting Started]]\n- [[Project Board]]\n' } },
    { rel: 'Local Notes App.md', note: { type: 'project', props: { title: 'Local Notes App', status: 'active', due: '2025-02-01', tags: ['app', 'pkm'], links: ['Getting Started', 'Alice'] }, body: '# Local Notes App\n\nWe build a local-first notes app with typed structure.\n\nOwner: [[Alice]]\n' } },
    { rel: 'Alice.md', note: { type: 'person', props: { title: 'Alice', role: 'Product designer', tags: ['team'], links: ['Local Notes App'] }, body: '# Alice\n\nProduct designer on [[Local Notes App]].\n\n![[Getting Started]]\n' } },
    { rel: 'Getting Started.md', note: { type: 'note', props: { title: 'Getting Started', tags: ['guide'], status: 'active' }, body: '# Getting Started\n\nNotes are .md or .html files with typed structure.\n\nRelated: [[Local Notes App]]\n' } },
  ];
  for (const { rel, note } of mdNotes) {
    const fp = path.join(VAULT, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, serializeNote(note), 'utf8');
  }
  // An HTML note with an embedded, AI-creatable graph component.
  const board = `<oasys-note type="project" title="Project Board" status="active" tags="plan">
  <h1>Project Board</h1>
  <p>Live component rendered by the app. Linked to [[Local Notes App]].</p>
  <oasys-graph id="deps">
    <oasys-node id="engine" label="Engine" type="project"/>
    <oasys-node id="ui" label="UI" type="note"/>
    <oasys-node id="ai" label="AI" type="note"/>
    <oasys-edge from="engine" to="ui"/>
    <oasys-edge from="ai" to="engine"/>
  </oasys-graph>
</oasys-note>
`;
  fs.writeFileSync(path.join(VAULT, 'Project Board.html'), board, 'utf8');
}
module.exports = {
  VAULT, SCHEMAS, cleanScalar, parseYamlSimple, parseNote, serializeNote,
  parseAttrs, parseHtmlNote, serializeHtmlNote, isHtml, parseByExt,
  validate, loadSchemas, walk, getIndex, getBacklinks, getGraph, getEmbeddedGraphs,
  readNote, writeNote, patchNote, seedDemoVault, listNotes: () => walk(VAULT)
};
