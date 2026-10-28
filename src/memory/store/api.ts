import {
  EMBEDDING_MODEL_ID,
  type MemoryEntry,
  type MemoryKind,
  type MemorySource,
} from "../../types/memory.js";
import { getEmbedder } from "../vector/embedder.js";
import * as idb from "./idb.js";

function newId(): string {
  return crypto.randomUUID();
}

export async function upsertMemory(
  partial: Partial<MemoryEntry> & { body: string }
): Promise<MemoryEntry> {
  const now = new Date().toISOString();
  const existing = partial.id ? await idb.getEntry(partial.id) : undefined;

  const entry: MemoryEntry = {
    id: existing?.id ?? partial.id ?? newId(),
    body: partial.body.trim(),
    title: partial.title ?? existing?.title ?? deriveTitle(partial.body),
    kind: (partial.kind ?? existing?.kind ?? "note") as MemoryKind,
    tags: partial.tags ?? existing?.tags ?? [],
    scope: partial.scope ?? existing?.scope ?? "global",
    enabled: partial.enabled ?? existing?.enabled ?? true,
    source: (partial.source ?? existing?.source ?? "manual") as MemorySource,
    confidence: partial.confidence ?? existing?.confidence ?? "high",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastUsedAt: partial.lastUsedAt ?? existing?.lastUsedAt,
    expiresAt: partial.expiresAt ?? existing?.expiresAt,
    provenance: partial.provenance ?? existing?.provenance,
    embeddingModelId: EMBEDDING_MODEL_ID,
  };

  await idb.putEntry(entry);
  await reembed(entry);
  return entry;
}

export async function reembed(entry: MemoryEntry): Promise<void> {
  const embedder = getEmbedder();
  const vec = await embedder.embed(`${entry.title ?? ""} ${entry.body}`);
  await idb.putVector({
    id: entry.id,
    embeddingModelId: embedder.modelId,
    values: Array.from(vec),
  });
}

export async function disableMemory(id: string): Promise<void> {
  const entry = await idb.getEntry(id);
  if (!entry) return;
  entry.enabled = false;
  entry.updatedAt = new Date().toISOString();
  await idb.putEntry(entry);
}

export async function deleteMemory(id: string): Promise<void> {
  await idb.deleteEntry(id);
}

export async function listMemories(): Promise<MemoryEntry[]> {
  const all = await idb.listEntries();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function memoryCount(): Promise<number> {
  return idb.countEntries();
}

export async function wipeMemories(): Promise<void> {
  await idb.wipeAll();
}

export async function exportJson(): Promise<string> {
  const entries = await listMemories();
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), entries },
    null,
    2
  );
}

export async function importJson(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { entries?: MemoryEntry[] };
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Import JSON must contain an entries array");
  }
  const n = await idb.importEntries(parsed.entries);
  for (const e of parsed.entries) {
    await reembed(e);
  }
  return n;
}

function deriveTitle(body: string): string {
  const line = body.trim().split(/\n/)[0] ?? body;
  return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}
