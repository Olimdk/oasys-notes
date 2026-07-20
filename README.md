# OASYS Notes

A local-first, Obsidian-style note-taking app with typed structure, wikilinks,
backlinks, and a graph view. Native desktop app built with **Tauri** (Rust backend
+ Vite/TypeScript frontend), styled with the **eDex** dark-space aesthetic used
across oasysOS.

Notes are plain `.md` files with YAML frontmatter — fully Obsidian-compatible, so
any local agent (OASYS, etc.) can read/write the vault directly.

## Roadmap
- [x] Open local vault
- [x] Markdown notes with typed frontmatter (note / project / person)
- [x] `[[wikilinks]]` + backlinks
- [x] Folder tree + search
- [x] Graph view (canvas)
- [ ] Offline-first sync (SMB / WebDAV / self-hosted server) with push-on-reconnect
- [ ] ooo-logo branding
- [ ] Real-time FS watcher so agent edits show up live

## Dev
    npm install
    npm run tauri dev

## Build
    npm run tauri build

## License
MIT © 2026 Oliver
