# OASys Notes

A local-first, Obsidian-style note-taking app where every note is a **plain
file on disk** with an optional **typed structure** (frontmatter). You write
notes like normal Markdown, but you can also attach validated, machine-readable
fields — which is what lets a local AI read and *edit* notes precisely instead
of guessing from prose.

- 📁 Real `.md` files in a `vault/` folder (agent-writable, no database lock-in)
- 🔗 `[[wikilinks]]`, `![[embeds]]`, backlinks
- 🧩 **Typed notes**: `type` selects a schema in `schemas/` (enum / date / list validation)
- 🕸 Force-directed **graph view**
- 🤖 **AI integration**: precise field-level `PATCH` (schema-validated) plus a
  diff+approve edit flow. Works with a local model (Ollama) or any agent that
  can call the REST API.
- 🎨 **Advanced structures**: notes can carry structured data (a "CSS-like"
  separation of presentation from content) so the UI and AI treat them as objects.

## Run

