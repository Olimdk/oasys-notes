import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface Note { rel: string; title: string; type: string; body: string; props: any; links: string[]; backlinks: string[]; }
interface TreeNode { name: string; path: string; type: string; children: TreeNode[]; }

const state: { current: string | null; tree: TreeNode[]; index: Note[]; query: string } = {
  current: null, tree: [], index: [], query: ""
};

const $ = (id: string) => document.getElementById(id)!;

async function openVault() {
  const picked = await open({ directory: true, multiple: false });
  if (!picked || typeof picked !== "string") return;
  await invoke("vault_open", { path: picked });
  await refresh();
}

async function refresh() {
  state.tree = await invoke("vault_tree");
  state.index = await invoke("vault_index");
  renderTree();
}

function renderTree() {
  const c = $("tree"); c.innerHTML = "";
  const q = state.query.toLowerCase();
  const render = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (q && n.type === "file" && !n.name.toLowerCase().includes(q)) continue;
      const el = document.createElement("div");
      el.className = n.type;
      el.style.paddingLeft = (depth * 12 + 4) + "px";
      el.textContent = (n.type === "folder" ? "▸ " : "◦ ") + n.name;
      if (n.type === "folder") {
        el.onclick = () => { el.classList.toggle("open"); renderTree(); };
      } else {
        if (n.path === state.current) el.classList.add("active");
        el.onclick = () => openFile(n.path);
      }
      c.appendChild(el);
      if (n.type === "folder" && el.classList.contains("open")) {
        render(n.children, depth + 1);
      }
    }
  };
  render(state.tree, 0);
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^###### (.*)$/gm, "<h6>$1</h6>")
    .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
    .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => `<a class="wikilink" data-target="${t.trim()}">${l || t.trim()}</a>`)
    .replace(/\n/g, "<br/>");
}

async function openFile(rel: string) {
  state.current = rel;
  const n: Note = await invoke("vault_read", { rel });
  ($("title") as HTMLInputElement).value = n.title;
  ($("title") as HTMLInputElement).disabled = false;
  $("editor").innerHTML = renderMarkdown(n.body);
  $("backlinks").innerHTML = n.backlinks.length ? "<b>Backlinks:</b> " + n.backlinks.join(", ") : "";
  renderTree();
  bindWiki();
}

function bindWiki() {
  document.querySelectorAll("a.wikilink").forEach(a => {
    (a as HTMLElement).onclick = async () => {
      const target = (a as HTMLElement).dataset.target!;
      const hit = state.index.find(x => x.title === target);
      if (hit) openFile(hit.rel);
      else if (confirm(`Create note "${target}"?`)) {
        await invoke("vault_create", { rel: target + ".md" });
        await refresh(); openFile(target + ".md");
      }
    };
  });
}

async function newNote() {
  const name = prompt("Note name:");
  if (!name) return;
  const rel = name.endsWith(".md") ? name : name + ".md";
  await invoke("vault_create", { rel });
  await refresh(); openFile(rel);
}

function saveCurrent() {
  if (!state.current) return;
  const body = (($("editor") as HTMLElement).innerText || "").replace(/<br>/g, "\n");
  const title = ($("title") as HTMLInputElement).value;
  invoke("vault_write", { rel: state.current, noteType: "note", props: { title }, body });
}

$("openBtn").onclick = openVault;
$("newBtn").onclick = () => newNote();
$("search").oninput = (e) => { state.query = (e.target as HTMLInputElement).value; renderTree(); };
$("editor").onblur = saveCurrent;
$("graphBtn").onclick = async () => {
  const g: any = await invoke("vault_graph");
  drawGraph(g);
  ($("graph") as HTMLCanvasElement).hidden = false;
};
$("syncBtn").onclick = async () => {
  const s: any = await invoke("sync_status");
  alert(`Sync mode: ${s.mode}\nRemote: ${s.remote}\nConnected: ${s.connected}\n\n(Push/pull not yet implemented)`);
};

function drawGraph(g: any) {
  const cv = $("graph") as HTMLCanvasElement;
  const ctx = cv.getContext("2d")!;
  cv.width = window.innerWidth; cv.height = window.innerHeight - 49;
  ctx.fillStyle = "#0a0a0f"; ctx.fillRect(0, 0, cv.width, cv.height);
  const pos: any = {};
  g.nodes.forEach((n: any) => { pos[n.id] = { x: Math.random() * cv.width, y: Math.random() * cv.height }; });
  g.links.forEach((l: any) => {
    if (pos[l.source] && pos[l.target]) {
      ctx.strokeStyle = "rgba(123,92,255,0.4)";
      ctx.beginPath(); ctx.moveTo(pos[l.source].x, pos[l.source].y); ctx.lineTo(pos[l.target].x, pos[l.target].y); ctx.stroke();
    }
  });
  g.nodes.forEach((n: any) => {
    const p = pos[n.id];
    ctx.fillStyle = n.type === "person" ? "#2de2e6" : "#7b5cff";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#c8c8e0"; ctx.font = "11px monospace";
    ctx.fillText(n.label, p.x + 10, p.y + 4);
  });
  cv.onclick = () => { cv.hidden = true; };
}
