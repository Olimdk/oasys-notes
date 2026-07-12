// Seed a demo vault for first run / tests. Lazily requires server to avoid a
// circular require at module-eval time.
const fs = require('fs');
const path = require('path');

function write(rel, note) {
  // Lazy require — server.js is fully evaluated by the time seed() runs.
  const { VAULT, serializeNote } = require('../server');
  const fp = path.join(VAULT, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, serializeNote(note), 'utf8');
}

function seed() {
  write('Index.md', {
    type: 'note', props: { title: 'Index', tags: ['home', 'meta'], status: 'active' },
    body: '# Index\n\nWelcome to **OASys Notes**.\n\n- [[Local Notes App]]\n- [[Alice]]\n- [[Getting Started]]\n'
  });
  write('Local Notes App.md', {
    type: 'project',
    props: { title: 'Local Notes App', status: 'active', due: '2025-02-01', tags: ['app', 'pkm'], links: ['Getting Started', 'Alice'] },
    body: '# Local Notes App\n\nWe build a local-first notes app with typed structure.\n\nOwner: [[Alice]]\n'
  });
  write('Alice.md', {
    type: 'person',
    props: { title: 'Alice', role: 'Product designer', tags: ['team'], links: ['Local Notes App'] },
    body: '# Alice\n\nProduct designer on [[Local Notes App]].\n\n![[Getting Started]]\n'
  });
  write('Getting Started.md', {
    type: 'note',
    props: { title: 'Getting Started', tags: ['guide'], status: 'active' },
    body: '# Getting Started\n\nNotes are .md files with typed frontmatter.\n\nRelated: [[Local Notes App]]\n'
  });
  write('Daily/2025-01-01.md', {
    type: 'note',
    props: { title: '2025-01-01', tags: ['daily'], status: 'active' },
    body: '# 2025-01-01\n\nStarted the project. See [[Index]].\n'
  });
}

if (require.main === module) {
  const { VAULT } = require('../server');
  fs.mkdirSync(VAULT, { recursive: true });
  seed();
  console.log('Vault seeded at', VAULT);
}

module.exports = { write, seed };
