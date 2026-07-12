// OASys Notes — local-first structured notes server
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const VAULT = path.join(ROOT, 'vault');
const PUBLIC = path.join(ROOT, 'public');
const SCHEMAS = path.join(ROOT, 'schemas');
const PORT = process.env.PORT || 5173;

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
function titleIndex() {
  return walk(VAULT).map(f => {
    const n = parseNote(fs.readFileSync(path.join(VAULT, f), 'utf8'));
    return { rel: f, title: n.props.title || path.basename(f, '.md'), type: n.type, links: n.links };
  });
}
function backlinks(targetRel) {
  const idx = titleIndex();
  const t = idx.find(x => x.rel === targetRel);
  if (!t) return [];
  return idx.filter(x => x.rel !== targetRel && x.links.includes(t.title)).map(x => x.rel);
}
function graph() {
  const idx = titleIndex();
  const nodes = idx.map(x => ({ id: x.rel, label: x.title, type: x.type }));
  const links = [];
  for (const x of idx) for (const t of x.links) {
    const tr = idx.find(y => y.title === t);
    if (tr && tr.rel !== x.rel) links.push({ source: x.rel, target: tr.rel });
  }
  return { nodes, links };
}
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (p === '/api/tree') return send(res, 200, walk(VAULT));
  if (p === '/api/index') return send(res, 200, titleIndex());
  if (p === '/api/graph') return send(res, 200, graph());
  if (p === '/api/schemas') return send(res, 200, SCHEMAS_DEF);
  if (p.startsWith('/api/note/')) {
    const rel = decodeURIComponent(p.replace('/api/note/', ''));
    const fp = safeJoin(VAULT, rel);
    if (!fp) return send(res, 400, { error: 'bad path' });
    if (req.method === 'GET') {
      if (!fs.existsSync(fp)) return send(res, 404, { error: 'missing' });
      const n = parseNote(fs.readFileSync(fp, 'utf8'));
      return send(res, 200, { rel, ...n, backlinks: backlinks(rel) });
    }
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.mkdirSync(path.dirname(fp), { recursive: true });
          fs.writeFileSync(fp, serializeNote(data), 'utf8');
          return send(res, 200, { ok: true, backlinks: backlinks(rel) });
        } catch (e) { return send(res, 500, { error: e.message }); }
      });
      return;
    }
    if (req.method === 'PATCH') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const { props } = JSON.parse(body);
          if (!fs.existsSync(fp)) return send(res, 404, { error: 'missing' });
          const n = parseNote(fs.readFileSync(fp, 'utf8'));
          Object.assign(n.props, props);
          const errs = validate(n.type, n.props);
          if (errs.length) return send(res, 422, { error: 'validation', details: errs });
          fs.writeFileSync(fp, serializeNote(n), 'utf8');
          return send(res, 200, { ok: true, props: n.props, backlinks: backlinks(rel) });
        } catch (e) { return send(res, 500, { error: e.message }); }
      });
      return;
    }
  }
  let sp = p === '/' ? '/index.html' : p;
  const fp = safeJoin(PUBLIC, sp);
  if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    return send(res, 200, fs.readFileSync(fp), types[ext] || 'text/plain');
  }
  send(res, 404, { error: 'not found' });
});

// Minimal inline seed used only on first run (no circular require).
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

if (require.main === module) {
  if (!fs.existsSync(VAULT) || fs.readdirSync(VAULT).length === 0) {
    fs.mkdirSync(VAULT, { recursive: true });
    seedDemoVault();
    console.log('Seeded demo vault.');
  }
  server.listen(PORT, () => console.log(`OASys Notes on http://localhost:${PORT}`));
}
module.exports = { server, parseNote, serializeNote, validate, parseYamlSimple, cleanScalar, titleIndex, graph, backlinks, walk, VAULT };
