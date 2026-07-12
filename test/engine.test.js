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

// ---- 2. Advanced HTML backend ----
test('parses HTML note: typed root, wikilinks, and embedded graph', () => {
  const html = `<oasys-note type="project" title="Board" status="active" tags="a, b">
  <h1>Board</h1>
  <p>See [[Engine]].</p>
  <oasys-graph id="g1">
    <oasys-node id="engine" label="Engine" type="project"/>
    <oasys-node id="ui" label="UI"/>
    <oasys-edge from="engine" to="ui"/>
  </oasys-graph>
</oasys-note>`;
  const n = notes.parseHtmlNote(html);
  assert.equal(n.type, 'project');
  assert.equal(n.props.title, 'Board');
  assert.deepEqual(n.props.tags, ['a', 'b']);
  assert.deepEqual(n.links, ['Engine']);
  assert.equal(n.graphs.length, 1);
  assert.equal(n.graphs[0].nodes.length, 2);
  assert.equal(n.graphs[0].edges.length, 1);
  assert.equal(n.graphs[0].edges[0].from, 'engine');
});
test('AI scenario: write HTML note with embedded graph, then read it back', () => {
  const note = {
    type: 'project',
    props: { title: 'AI Graph', status: 'idea' },
    body: `<h1>AI Graph</h1>
<oasys-graph id="g">
  <oasys-node id="x" label="X"/>
  <oasys-node id="y" label="Y"/>
  <oasys-edge from="x" to="y"/>
</oasys-graph>
See [[Index]].`
  };
  notes.writeNote('AI Graph.html', note);
  const back = notes.readNote('AI Graph.html');
  assert.equal(back.type, 'project');
  assert.equal(back.graphs.length, 1);
  assert.equal(back.graphs[0].nodes.length, 2);
  assert.deepEqual(back.links, ['Index']);
  // embedded graphs are queryable separately for the renderer
  const g = notes.getEmbeddedGraphs('AI Graph.html');
  assert.equal(g[0].nodes.length, 2);
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
test('graph and backlinks reflect typed + body links (both backends)', () => {
  const g = notes.getGraph();
  assert.ok(g.nodes.find(n => n.label === 'Alice'));
  assert.ok(g.nodes.find(n => n.label === 'Project Board' && n.backend === 'html'));
  const bl = notes.readNote('Alice.md');
  assert.ok(bl.backlinks.includes('Index.md') || bl.backlinks.includes('Local Notes App.md'));
});
