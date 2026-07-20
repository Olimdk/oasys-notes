use std::collections::HashSet;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use regex::Regex;

#[derive(Serialize, Deserialize, Clone)]
pub struct Note {
    pub rel: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub body: String,
    pub props: serde_json::Value,
    pub links: Vec<String>,
    pub backlinks: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Vec<TreeNode>,
}

#[derive(Serialize, Deserialize)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub links: Vec<GraphLink>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub note_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct GraphLink {
    pub source: String,
    pub target: String,
}

static mut VAULT_PATH: Option<String> = None;

#[tauri::command]
pub fn vault_open(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    unsafe { VAULT_PATH = Some(path); }
    let root = vault_root()?;
    if WalkDir::new(&root).min_depth(1).into_iter().count() == 0 {
        seed_demo(&root);
    }
    Ok(())
}

fn vault_root() -> Result<PathBuf, String> {
    unsafe { VAULT_PATH.clone().ok_or_else(|| "Vault not opened".into()).map(PathBuf::from) }
}

struct Parsed {
    props: serde_json::Value,
    body: String,
    note_type: String,
}

fn parse_note(raw: &str) -> Parsed {
    if !raw.starts_with("---\n") {
        return Parsed { props: serde_json::json!({}), body: raw.to_string(), note_type: "note".into() };
    }
    let rest = &raw[4..];
    let end = match rest.find("\n---") {
        Some(i) => i,
        None => return Parsed { props: serde_json::json!({}), body: raw.to_string(), note_type: "note".into() },
    };
    let fm = &rest[0..end];
    let body = rest[end + 4..].to_string();
    let mut map = serde_json::Map::new();
    let mut note_type = "note".to_string();
    for line in fm.lines() {
        if let Some((k, v)) = line.split_once(':') {
            let k = k.trim().to_string();
            let v = v.trim().to_string();
            if k == "type" { note_type = v.clone(); }
            if v.starts_with('[') && v.ends_with(']') {
                let items: Vec<String> = v[1..v.len() - 1]
                    .split(',').map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                    .filter(|s| !s.is_empty()).collect();
                map.insert(k, serde_json::json!(items));
            } else {
                map.insert(k, serde_json::json!(v));
            }
        }
    }
    Parsed { props: serde_json::Value::Object(map), body, note_type }
}

fn serialize_note(note_type: &str, props: &serde_json::Value, body: &str) -> String {
    let mut yaml = String::from("---\n");
    yaml.push_str(&format!("type: {}\n", note_type));
    if let serde_json::Value::Object(map) = props {
        for (k, v) in map {
            if k == "type" { continue; }
            match v {
                serde_json::Value::Array(a) => {
                    let items: Vec<String> = a.iter().map(|x| format!("\"{}\"", x.as_str().unwrap_or(""))).collect();
                    yaml.push_str(&format!("{}: [{}]\n", k, items.join(", ")));
                }
                _ => yaml.push_str(&format!("{}: {}\n", k, v.as_str().unwrap_or(""))),
            }
        }
    }
    yaml.push_str("---\n");
    yaml.push_str(body);
    yaml
}

fn extract_links(body: &str) -> Vec<String> {
    let re = Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]").unwrap();
    let mut set = HashSet::new();
    for c in re.captures_iter(body) {
        set.insert(c[1].trim().to_string());
    }
    set.into_iter().collect()
}

fn list_md(root: &Path) -> Vec<PathBuf> {
    WalkDir::new(root).into_iter().filter_map(|e| e.ok()).filter(|e| {
        e.path().extension().map(|x| x == "md").unwrap_or(false)
    }).map(|e| e.path().to_path_buf()).collect()
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).to_string_lossy().replace('\\', "/")
}

fn title_of(parsed: &Parsed, rel: &str) -> String {
    if let serde_json::Value::Object(m) = &parsed.props {
        if let Some(serde_json::Value::String(t)) = m.get("title") {
            return t.clone();
        }
    }
    Path::new(rel).file_stem().unwrap().to_string_lossy().to_string()
}

fn read_all(root: &Path) -> Result<Vec<Note>, String> {
    let files = list_md(root);
    let mut notes: Vec<Note> = Vec::new();
    for f in &files {
        let raw = std::fs::read_to_string(f).map_err(|e| e.to_string())?;
        let p = parse_note(&raw);
        let rel = rel_of(root, f);
        let title = title_of(&p, &rel);
        let links = extract_links(&p.body);
        notes.push(Note { rel: rel.clone(), title, note_type: p.note_type, body: p.body, props: p.props, links, backlinks: vec![] });
    }
    for n in notes.iter_mut() {
        for other in notes.iter() {
            if other.rel != n.rel && other.links.contains(&n.title) {
                n.backlinks.push(other.rel.clone());
            }
        }
    }
    Ok(notes)
}

#[tauri::command]
pub fn vault_index() -> Result<Vec<Note>, String> {
    read_all(&vault_root()?)
}

#[tauri::command]
pub fn vault_tree() -> Result<Vec<TreeNode>, String> {
    let root = vault_root()?;
    let files = list_md(&root);
    let mut top = TreeNode { name: "".into(), path: "".into(), node_type: "folder".into(), children: vec![] };
    for f in &files {
        let rel = rel_of(&root, f);
        let parts: Vec<&str> = rel.split('/').collect();
        let mut node = &mut top;
        let mut acc = String::new();
        for (i, part) in parts.iter().enumerate() {
            acc = if acc.is_empty() { part.to_string() } else { format!("{}/{}", acc, part) };
            let is_file = i == parts.len() - 1;
            if is_file {
                node.children.push(TreeNode { name: part.to_string(), path: acc.clone(), node_type: "file".into(), children: vec![] });
            } else {
                if !node.children.iter().any(|c| c.node_type == "folder" && c.name == *part) {
                    node.children.push(TreeNode { name: part.to_string(), path: acc.clone(), node_type: "folder".into(), children: vec![] });
                }
                let idx = node.children.iter().position(|c| c.node_type == "folder" && c.name == *part).unwrap();
                node = &mut node.children[idx];
            }
        }
    }
    fn sortrec(n: &mut TreeNode) {
        n.children.sort_by(|a, b| {
            if a.node_type == b.node_type { a.name.cmp(&b.name) }
            else if a.node_type == "folder" { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater }
        });
        for c in n.children.iter_mut() { sortrec(c); }
    }
    sortrec(&mut top);
    Ok(top.children)
}

#[tauri::command]
pub fn vault_read(rel: String) -> Result<Note, String> {
    let root = vault_root()?;
    let p = root.join(&rel);
    if !p.exists() { return Err("not found".into()); }
    let raw = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let parsed = parse_note(&raw);
    let title = title_of(&parsed, &rel);
    let links = extract_links(&parsed.body);
    let all = read_all(&root)?;
    let backlinks = all.iter().filter(|n| n.rel != rel && n.links.contains(&title)).map(|n| n.rel.clone()).collect();
    Ok(Note { rel, title, note_type: parsed.note_type, body: parsed.body, props: parsed.props, links, backlinks })
}

#[tauri::command]
pub fn vault_write(rel: String, note_type: String, props: serde_json::Value, body: String) -> Result<(), String> {
    let root = vault_root()?;
    let p = root.join(&rel);
    if let Some(parent) = p.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    std::fs::write(p, serialize_note(&note_type, &props, &body)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_create(rel: String, note_type: Option<String>) -> Result<(), String> {
    let root = vault_root()?;
    let p = root.join(&rel);
    if let Some(parent) = p.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let nt = note_type.unwrap_or_else(|| "note".into());
    let title = Path::new(&rel).file_stem().unwrap().to_string_lossy().to_string();
    let props = serde_json::json!({ "title": title });
    let body = format!("# {}\n\n", title);
    std::fs::write(p, serialize_note(&nt, &props, &body)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_patch(rel: String, props: serde_json::Value) -> Result<(), String> {
    let root = vault_root()?;
    let p = root.join(&rel);
    if !p.exists() { return Err("not found".into()); }
    let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let parsed = parse_note(&raw);
    let merged = merge_props(&parsed.props, &props);
    std::fs::write(&p, serialize_note(&parsed.note_type, &merged, &parsed.body)).map_err(|e| e.to_string())
}

fn merge_props(base: &serde_json::Value, patch: &serde_json::Value) -> serde_json::Value {
    let mut b = match base { serde_json::Value::Object(m) => m.clone(), _ => serde_json::Map::new() };
    if let serde_json::Value::Object(m) = patch {
        for (k, v) in m { b.insert(k.clone(), v.clone()); }
    }
    serde_json::Value::Object(b)
}

#[tauri::command]
pub fn vault_delete(rel: String) -> Result<(), String> {
    let root = vault_root()?;
    let p = root.join(&rel);
    if p.is_dir() { std::fs::remove_dir_all(p) } else { std::fs::remove_file(p) }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_rename(from: String, to: String) -> Result<(), String> {
    let root = vault_root()?;
    let f = root.join(&from);
    let t = root.join(&to);
    if let Some(parent) = t.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    std::fs::rename(f, t).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_graph() -> Result<Graph, String> {
    let notes = read_all(&vault_root()?)?;
    let titles: std::collections::HashMap<String, String> =
        notes.iter().map(|n| (n.title.clone(), n.rel.clone())).collect();
    let nodes = notes.iter().map(|n| GraphNode { id: n.rel.clone(), label: n.title.clone(), note_type: n.note_type.clone() }).collect();
    let mut links = Vec::new();
    for n in &notes {
        for l in &n.links {
            if let Some(target) = titles.get(l) {
                if target != &n.rel { links.push(GraphLink { source: n.rel.clone(), target: target.clone() }); }
            }
        }
    }
    Ok(Graph { nodes, links })
}

#[tauri::command]
pub fn vault_backlinks(rel: String) -> Result<Vec<String>, String> {
    Ok(vault_read(rel)?.backlinks)
}

fn seed_demo(root: &Path) {
    let notes = [
        ("Index.md", "note", "Index", "# Index\n\nWelcome to **OASYS Notes**.\n\n- [[Local Notes App]]\n- [[Alice]]\n- [[Getting Started]]\n"),
        ("Local Notes App.md", "project", "Local Notes App", "# Local Notes App\n\nWe build a local-first notes app with typed structure.\n\nOwner: [[Alice]]\n"),
        ("Alice.md", "person", "Alice", "# Alice\n\nProduct designer on [[Local Notes App]].\n"),
        ("Getting Started.md", "note", "Getting Started", "# Getting Started\n\nNotes are .md files with typed frontmatter.\n\nRelated: [[Local Notes App]]\n"),
    ];
    for (rel, nt, title, body) in notes {
        let p = root.join(rel);
        if let Some(parent) = p.parent() { let _ = std::fs::create_dir_all(parent); }
        let props = serde_json::json!({ "title": title });
        let _ = std::fs::write(p, serialize_note(nt, &props, body));
    }
}
