const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { VAULT, parseNote, serializeNote, validate } = require('../server');
const { seed } = require('../lib/init-vault');

const PORT = 5199;
let server;

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ method, path: p, port: PORT, host: '127.0.0.1',
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : d })); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

before(async () => {
  fs.mkdirSync(VAULT, { recursive: true });
  for (const f of fs.readdirSync(VAULT)) fs.rmSync(path.join(VAULT, f), { recursive: true, force: true });
  seed();
  server = require('../server').server;
  await new Promise(r => server.listen(PORT, r));
});
after(() => { if (server) server.close(); });

test('parses markdown body and wikilinks', () => {
  const n = parseNote('# Hello\n\nLink to [[Alice]] and ![[Getting Started]].');
  assert.ok(n.body.includes('# Hello'));
  assert.deepEqual(n.links.sort(), ['Alice', 'Getting Started']);
});

test('serialize -> parse round-trips without quote corruption', () => {
  const note = { type: 'project', props: { title: 'X', tags: ['app', 'pkm'], links: ['Alice'] }, body: '# X\n' };
  const text = serializeNote(note);
  const back = parseNote(text);
  assert.equal(back.type, 'project');
  assert.deepEqual(back.props.tags, ['app', 'pkm']);
  assert.deepEqual(back.props.links, ['Alice']);
  assert.equal(back.props.title, 'X');
});

test('tolerates double-bracketed links in frontmatter', () => {
  const text = '---\ntype: person\ntitle: Bob\nlinks: [["Local Notes App"]]\n---\n# Bob\n';
  const n = parseNote(text);
  assert.deepEqual(n.props.links, ['Local Notes App']);
});

test('validates enum and required fields', () => {
  assert.equal(validate('project', { title: 'P', status: 'active' }).length, 0);
  assert.ok(validate('project', { status: 'bogus' }).length > 0);
  assert.ok(validate('project', { status: 'active' }).length > 0);
  assert.ok(validate('project', { due: 'not-a-date' }).length > 0);
});

test('PATCH edits one field and re-validates (AI-style precise edit)', async () => {
  const r = await req('PATCH', '/api/note/' + encodeURIComponent('Local Notes App.md'), { props: { status: 'done' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.props.status, 'done');
  const n = parseNote(fs.readFileSync(path.join(VAULT, 'Local Notes App.md'), 'utf8'));
  assert.equal(n.props.status, 'done');
  assert.equal(n.props.title, 'Local Notes App');
});

test('PATCH rejects invalid enum (schema guard)', async () => {
  const r = await req('PATCH', '/api/note/' + encodeURIComponent('Getting Started.md'), { props: { status: 'purple' } });
  assert.equal(r.status, 422);
  assert.ok(r.body.details.length > 0);
});

test('PUT creates a new note; GET reads structured form', async () => {
  await req('PUT', '/api/note/New%20Idea.md', { type: 'note', props: { title: 'New Idea', tags: ['idea'] }, body: '# New Idea\n' });
  const r = await req('GET', '/api/note/' + encodeURIComponent('New Idea.md'));
  assert.equal(r.status, 200);
  assert.equal(r.body.type, 'note');
  assert.deepEqual(r.body.props.tags, ['idea']);
});

test('typed note keeps its type across serialize/parse', async () => {
  const r = await req('GET', '/api/note/' + encodeURIComponent('Alice.md'));
  assert.equal(r.body.type, 'person');
  assert.equal(r.body.props.role, 'Product designer');
});

test('graph and backlinks reflect typed + body links', async () => {
  const g = await req('GET', '/api/graph');
  const alice = g.body.nodes.find(n => n.label === 'Alice');
  assert.ok(alice);
  const bl = await req('GET', '/api/note/' + encodeURIComponent('Alice.md'));
  assert.ok(bl.body.backlinks.includes('Index.md') || bl.body.backlinks.includes('Local Notes App.md'));
});
