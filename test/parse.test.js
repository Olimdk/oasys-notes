const { test } = require('node:test');
const assert = require('node:assert/strict');
const notes = require('../lib/notes');

test('cleanScalar strips surrounding quotes and brackets', () => {
  assert.equal(notes.cleanScalar('"app"'), 'app');
  assert.equal(notes.cleanScalar('["Local Notes App"]'), 'Local Notes App');
  assert.equal(notes.cleanScalar('[["Foo"]]'), 'Foo');
  assert.equal(notes.cleanScalar(' "pkm" '), 'pkm');
});
test('parseYamlSimple handles scalars, lists, and nested quotes', () => {
  const y = `title: Local Notes App
status: active
tags: [app, pkm]
links: [["Getting Started"], ["Alice"]]`;
  const o = notes.parseYamlSimple(y);
  assert.equal(o.title, 'Local Notes App');
  assert.deepEqual(o.tags, ['app', 'pkm']);
  assert.deepEqual(o.links, ['Getting Started', 'Alice']);
});
test('parseHtmlNote extracts attributes, links and graphs', () => {
  const html = `<oasys-note type="x" title="T" tags="a, b"><p>[[L]]</p>
  <oasys-graph id="g"><oasys-node id="n" label="N"/><oasys-edge from="n" to="n"/></oasys-graph></oasys-note>`;
  const n = notes.parseHtmlNote(html);
  assert.equal(n.type, 'x');
  assert.deepEqual(n.props.tags, ['a', 'b']);
  assert.deepEqual(n.links, ['L']);
  assert.equal(n.graphs[0].id, 'g');
});
test('parseNote extracts type, props, body, links', () => {
  const n = notes.parseNote(`---
type: project
title: Demo
status: idea
tags: [a, b]
---
# Demo

See [[Other]] note.`);
  assert.equal(n.type, 'project');
  assert.equal(n.props.status, 'idea');
  assert.deepEqual(n.props.tags, ['a', 'b']);
  assert.deepEqual(n.links, ['Other']);
  assert.ok(n.body.startsWith('# Demo'));
});
test('validate: default schema for unknown type', () => {
  assert.equal(notes.validate('unknown', {}).length, 0);
});
