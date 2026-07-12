# OASys Notes

A **local-first, native desktop** note-taking app — an Obsidian-style clone that
also supports an **advanced, HTML-based note backend** so AI can create rich
structures (graphs, tables, components) inside each note.

> **Not a website.** No HTTP server, nothing listens on localhost. It is a native
> desktop window (Electron) that reads/writes your `vault/` folder directly
> through the file system. The UI talks to the engine via a narrow IPC bridge.

## Two note backends
1. **Markdown (`.md`)** — Obsidian-style: YAML frontmatter + `[[wikilinks]]`.
2. **HTML (`.html`)** — a typed, structured note:
   