# OASys Notes

A **local-first, native desktop** note-taking app — the spiritual successor to
Obsidian you described: plain `.md` files on disk, `[[wikilinks]]`, a graph
view, and **typed structure** so a local AI can read and edit notes precisely.

> **Not a website.** There is no HTTP server and nothing listens on localhost.
> The app is a native desktop window (Electron) that reads and writes your
> `vault/` folder directly through the file system in the main process. The
> frontend (HTML/CSS/JS) runs inside the app window and talks to the engine
> via a narrow, safe IPC bridge (`preload.js`) — never over the network.

## Why plain files + typed frontmatter?
You write notes like normal Markdown:

