const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const notes = require('../lib/notes');

const VAULT = notes.VAULT;

before(() => {
  fs.mkdirSync(VAULT, { recursive: true });
  for (const f of fs.readdirSync(VAULT)) fs.rmSync(path.join(VAULT, f), { recursive: true, force: true });
  notes.seedDemoVault();
});
after(() => { for (const f of fs.readdirSync(VAULT)) fs.rmSync(path.join(VAULT, f), { recursive: true, force: true }); });

// ---- 1. Normal note-taking (Markdown + wikilinks) ----
test('parses markdown body and wikilinks', () => {
  const n = notes.parseNote('# Hello\n\nLink to [[Alice]] and ![[Getting Started]].');
  assert.ok(n.body.includes('# Hello'));
  assert.deepEqual(n.links.sort(), ['Alice', 'Getting Started']);
});
test('serialize -> parse round-trips without quote corruption', () => {
  const note = { type: 'project', props: { title: 'X', tags: ['app', 'pkm'], links: ['Alice'] }, body: '# X\n' };
  const back = notes.parseNote(notes.serializeNote(note));
  assert.equal(back.type, 'project');
  assert.deepEqual(back.props.tags, ['app', 'pkm']);
  assert.deepEqual(back.props.links, ['Alice']);
  assert.equal(back.props.title, 'X');
});
test('tolerates double-bracketed links in frontmatter', () => {
  const n = notes.parseNote('---\ntype: person\ntitle: Bob\nlinks: [["Local Notes App"]]\n---\n# Bob\n');
  assert.deepEqual(n.props.links, ['Local Notes App']);
});
test('note without frontmatter is type=note', () => {
  const n = notes.parseNote('Just a note with [[Link]].');
  assert.equal(n.type, 'note');
  assert.deepEqual(n.links, ['Link']);
});

// ---- 2. Advanced structures (typed schemas) ----
test('validates enum, required, and date', () => {
  assert.equal(notes.validate('project', { title: 'P', status: 'active' }).length, 0);
  assert.ok(notes.validate('project', { status: 'bogus' }).length > 0);
  assert.ok(notes.validate('project', { status: 'active' }).length > 0);
  assert.ok(notes.validate('project', { due: 'not-a-date' }).length > 0);
});

// ---- 3. AI integration (file engine, no HTTP) ----
test('patchNote edits one field and re-validates (AI-style precise edit)', () => {
  const r = notes.patchNote('Local Notes App.md', { status: 'done' });
  assert.equal(r.props.status, 'done');
  assert.equal(notes.parseNote(fs.readFileSync(path.join(VAULT, 'Local Notes App.md'), 'utf8')).props.status, 'done');
});
test('patchNote rejects invalid enum (schema guard)', () => {
  assert.throws(() => notes.patchNote('Getting Started.md', { status: 'purple' }), e => e.code === 'EVALID');
});
test('writeNote creates a new note; readNote returns structured form', () => {
  notes.writeNote('New Idea.md', { type: 'note', props: { title: 'New Idea', tags: ['idea'] }, body: '# New Idea\n' });
  const n = notes.readNote('New Idea.md');
  assert.equal(n.type, 'note');
  assert.deepEqual(n.props.tags, ['idea']);
});
test('typed note keeps its type across write/read', () => {
  const n = notes.readNote('Alice.md');
  assert.equal(n.type, 'person');
  assert.equal(n.props.role, 'Product designer');
});
test('graph and backlinks reflect typed + body links', () => {
  const g = notes.getGraph();
  assert.ok(g.nodes.find(n => n.label === 'Alice'));
  const bl = notes.readNote('Alice.md');
  assert.ok(bl.backlinks.includes('Index.md') || bl.backlinks.includes('Local Notes App.md'));
});
