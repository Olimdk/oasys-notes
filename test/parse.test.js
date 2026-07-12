const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseNote, serializeNote, validate, parseYamlSimple, cleanScalar } = require('../server');

test('cleanScalar strips surrounding quotes and brackets', () => {
  assert.equal(cleanScalar('"app"'), 'app');
  assert.equal(cleanScalar('["Local Notes App"]'), 'Local Notes App');
  assert.equal(cleanScalar('[["Foo"]]'), 'Foo');
});

test('parseYamlSimple handles scalars, lists, and nested quotes', () => {
  const y = `title: Local Notes App
status: active
tags: [app, pkm]
links: [["Getting Started"], ["Alice"]]`;
  const o = parseYamlSimple(y);
  assert.equal(o.title, 'Local Notes App');
  assert.deepEqual(o.tags, ['app', 'pkm']);
  assert.deepEqual(o.links, ['Getting Started', 'Alice']);
});

test('parseNote extracts type, props, body, links', () => {
  const text = `---
type: project
title: Demo
status: idea
tags: [a, b]
---
# Demo

See [[Other]] note.`;
  const n = parseNote(text);
  assert.equal(n.type, 'project');
  assert.equal(n.props.status, 'idea');
  assert.deepEqual(n.props.tags, ['a', 'b']);
  assert.deepEqual(n.links, ['Other']);
  assert.ok(n.body.startsWith('# Demo'));
});

test('note without frontmatter is type=note with empty props', () => {
  const n = parseNote('Just a plain note with [[Link]].');
  assert.equal(n.type, 'note');
  assert.deepEqual(n.links, ['Link']);
});

test('validate: default schema for unknown type', () => {
  assert.equal(validate('unknown', {}).length, 0);
});
