# OASys Notes

A **local-first, native desktop** note-taking app — an Obsidian-style clone that
uses the **same plain `.md` file system as Obsidian**, with typed structure on
top. Styled to match the **OASys TUI** theme.

> **No server, no localhost.** It is a native desktop window (Electron) that
> reads/writes your `vault/` folder directly through the file system. The UI
> talks to the engine via a narrow IPC bridge.

> **No in-app AI UI.** Editing is done by *any AI/agent with system access*
> (e.g. OASYS) by writing or patching the `.md` files directly — the same files
> Obsidian reads. OASYS can create a note here and Obsidian picks it up instantly.

## Notes are plain Markdown (Obsidian-compatible)
