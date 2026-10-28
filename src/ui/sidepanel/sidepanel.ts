import { sendMessage } from "../../messaging/bus.js";
import { isMessage, type Message } from "../../types/messages.js";
import type { MemoryEntry, MemoryPackView } from "../../types/memory.js";

const packList = document.getElementById("pack-list")!;
const packEmpty = document.getElementById("pack-empty")!;
const allList = document.getElementById("all-list")!;
const meta = document.getElementById("meta")!;
const viewPack = document.getElementById("view-pack")!;
const viewAll = document.getElementById("view-all")!;
const tabPack = document.getElementById("tab-pack")!;
const tabAll = document.getElementById("tab-all")!;

function showPack(): void {
  viewPack.classList.remove("hidden");
  viewAll.classList.add("hidden");
  tabPack.classList.add("active");
  tabAll.classList.remove("active");
}

function showAll(): void {
  viewPack.classList.add("hidden");
  viewAll.classList.remove("hidden");
  tabPack.classList.remove("active");
  tabAll.classList.add("active");
  void loadAll();
}

tabPack.addEventListener("click", showPack);
tabAll.addEventListener("click", showAll);

document.getElementById("btn-refresh")!.addEventListener("click", () => {
  void refresh();
});

document.getElementById("add-form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("add-body") as HTMLInputElement;
  const body = input.value.trim();
  if (!body) return;
  await sendMessage({
    type: "UPSERT_ENTRY",
    entry: { body, kind: "note", source: "manual" },
  });
  input.value = "";
  await loadAll();
  await refresh();
});

document.getElementById("btn-export")!.addEventListener("click", async () => {
  const reply = await sendMessage({ type: "EXPORT_JSON" });
  if (reply.type !== "EXPORT_RESULT") return;
  const blob = new Blob([reply.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chromeaimemory-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document
  .getElementById("import-file")!
  .addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const json = await file.text();
    await sendMessage({ type: "IMPORT_JSON", json });
    await loadAll();
    await refresh();
  });

document.getElementById("btn-wipe")!.addEventListener("click", async () => {
  const ok = prompt('Type WIPE to delete all local memories:');
  if (ok !== "WIPE") return;
  await sendMessage({ type: "WIPE_ALL" });
  await loadAll();
  await refresh();
});

chrome.runtime.onMessage.addListener((raw) => {
  if (!isMessage(raw)) return;
  if (raw.type === "PACK_UPDATED") renderPack(raw.pack);
  if (raw.type === "STATUS" && raw.pack) renderPack(raw.pack);
});

async function refresh(): Promise<void> {
  const status = await sendMessage({ type: "GET_STATUS" });
  if (status.type === "STATUS") {
    if (status.pack) renderPack(status.pack);
    else {
      packList.innerHTML = "";
      packEmpty.classList.remove("hidden");
      meta.textContent = statusLine(status);
    }
    return;
  }
  const packReply = await sendMessage({ type: "GET_PACK" });
  if (packReply.type === "PACK_UPDATED") renderPack(packReply.pack);
}

function statusLine(status: Extract<Message, { type: "STATUS" }>): string {
  const auto = status.settings.consent.autoMemoryConsented
    ? status.settings.flags.paused
      ? "paused"
      : "on"
    : "consent required";
  return `Auto-memory ${auto} · ${status.memoryCount} stored · Claude ${status.auth.status}`;
}

function renderPack(pack: MemoryPackView): void {
  meta.textContent = `context ${pack.contextId} · built ${new Date(pack.builtAt).toLocaleString()} · query “${truncate(pack.queryText, 80)}”`;
  packList.innerHTML = "";
  if (pack.entries.length === 0) {
    packEmpty.classList.remove("hidden");
    return;
  }
  packEmpty.classList.add("hidden");
  for (const entry of pack.entries) {
    packList.appendChild(packItem(entry));
  }
}

function packItem(entry: MemoryEntry): HTMLLIElement {
  const li = document.createElement("li");
  li.innerHTML = `
    <div class="item-top">
      <span class="badge">${entry.kind}</span>
    </div>
    <p class="title"></p>
    <p class="body"></p>
    <div class="item-actions">
      <button type="button" data-act="exclude" class="ghost">Remove from pack</button>
      <button type="button" data-act="disable" class="ghost">Disable</button>
    </div>
  `;
  li.querySelector(".title")!.textContent = entry.title ?? "Memory";
  li.querySelector(".body")!.textContent = entry.body;
  li.querySelector('[data-act="exclude"]')!.addEventListener("click", async () => {
    await sendMessage({ type: "EXCLUDE_FROM_PACK", entryId: entry.id });
    await refresh();
  });
  li.querySelector('[data-act="disable"]')!.addEventListener("click", async () => {
    await sendMessage({ type: "DISABLE_ENTRY", entryId: entry.id });
    await refresh();
  });
  return li;
}

async function loadAll(): Promise<void> {
  const reply = await sendMessage({ type: "LIST_MEMORIES" });
  allList.innerHTML = "";
  if (reply.type !== "MEMORIES") return;
  for (const entry of reply.entries) {
    allList.appendChild(allItem(entry));
  }
}

function allItem(entry: MemoryEntry): HTMLLIElement {
  const li = document.createElement("li");
  li.innerHTML = `
    <div class="item-top">
      <span class="badge">${entry.kind}${entry.enabled ? "" : " · off"}</span>
    </div>
    <p class="title"></p>
    <p class="body"></p>
    <div class="item-actions">
      <button type="button" data-act="disable" class="ghost">${entry.enabled ? "Disable" : "Already off"}</button>
      <button type="button" data-act="delete" class="danger ghost">Delete</button>
    </div>
  `;
  li.querySelector(".title")!.textContent = entry.title ?? "Memory";
  li.querySelector(".body")!.textContent = entry.body;
  const dis = li.querySelector('[data-act="disable"]') as HTMLButtonElement;
  dis.disabled = !entry.enabled;
  dis.addEventListener("click", async () => {
    await sendMessage({ type: "DISABLE_ENTRY", entryId: entry.id });
    await loadAll();
  });
  li.querySelector('[data-act="delete"]')!.addEventListener("click", async () => {
    await sendMessage({ type: "DELETE_ENTRY", entryId: entry.id });
    await loadAll();
    await refresh();
  });
  return li;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || "(empty)";
}

void refresh();
