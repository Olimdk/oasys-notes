// OASys Notes — pure file-system note engine (no HTTP, runs in the app process).
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
    else if (e.name.endsWith('.md')) out.push(rel);
  }
  return out;
}
function getIndex() {
  return walk(VAULT).map(f => {
    const n = parseNote(fs.readFileSync(path.join(VAULT, f), 'utf8'));
    return { rel: f, title: n.props.title || path.basename(f, '.md'), type: n.type, links: n.links };
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
  const nodes = idx.map(x => ({ id: x.rel, label: x.title, type: x.type }));
  const links = [];
  for (const x of idx) for (const t of x.links) {
    const tr = idx.find(y => y.title === t);
    if (tr && tr.rel !== x.rel) links.push({ source: x.rel, target: tr.rel });
  }
  return { nodes, links };
}
function readNote(rel) {
  const fp = safeJoin(VAULT, rel);
  if (!fp || !fs.existsSync(fp)) { const e = new Error('not found'); e.code = 'ENOENT'; throw e; }
  const n = parseNote(fs.readFileSync(fp, 'utf8'));
  return { rel, ...n, backlinks: getBacklinks(rel) };
}
function writeNote(rel, note) {
  const fp = safeJoin(VAULT, rel);
  if (!fp) { const e = new Error('bad path'); e.code = 'EBADPATH'; throw e; }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, serializeNote(note), 'utf8');
  return { ok: true, backlinks: getBacklinks(rel) };
}
function patchNote(rel, props) {
  const fp = safeJoin(VAULT, rel);
  if (!fp || !fs.existsSync(fp)) { const e = new Error('not found'); e.code = 'ENOENT'; throw e; }
  const n = parseNote(fs.readFileSync(fp, 'utf8'));
  Object.assign(n.props, props);
  const errs = validate(n.type, n.props);
  if (errs.length) { const e = new Error('validation'); e.code = 'EVALID'; e.details = errs; throw e; }
  fs.writeFileSync(fp, serializeNote(n), 'utf8');
  return { ok: true, props: n.props, backlinks: getBacklinks(rel) };
}
function seedDemoVault() {
  const notes = [
    { rel: 'Index.md', note: { type: 'note', props: { title: 'Index', tags: ['home', 'meta'], status: 'active' }, body: '# Index\n\nWelcome to **OASys Notes**.\n\n- [[Local Notes App]]\n- [[Alice]]\n- [[Getting Started]]\n' } },
    { rel: 'Local Notes App.md', note: { type: 'project', props: { title: 'Local Notes App', status: 'active', due: '2025-02-01', tags: ['app', 'pkm'], links: ['Getting Started', 'Alice'] }, body: '# Local Notes App\n\nWe build a local-first notes app with typed structure.\n\nOwner: [[Alice]]\n' } },
    { rel: 'Alice.md', note: { type: 'person', props: { title: 'Alice', role: 'Product designer', tags: ['team'], links: ['Local Notes App'] }, body: '# Alice\n\nProduct designer on [[Local Notes App]].\n\n![[Getting Started]]\n' } },
    { rel: 'Getting Started.md', note: { type: 'note', props: { title: 'Getting Started', tags: ['guide'], status: 'active' }, body: '# Getting Started\n\nNotes are .md files with typed frontmatter.\n\nRelated: [[Local Notes App]]\n' } },
    { rel: 'Daily/2025-01-01.md', note: { type: 'note', props: { title: '2025-01-01', tags: ['daily'], status: 'active' }, body: '# 2025-01-01\n\nStarted the project. See [[Index]].\n' } },
  ];
  for (const { rel, note } of notes) {
    const fp = path.join(VAULT, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, serializeNote(note), 'utf8');
  }
}
module.exports = {
  VAULT, SCHEMAS, cleanScalar, parseYamlSimple, parseNote, serializeNote,
  validate, loadSchemas, walk, getIndex, getBacklinks, getGraph,
  readNote, writeNote, patchNote, seedDemoVault, listNotes: () => walk(VAULT)
};
