import type {
  MemoryEntry,
  MemoryPack,
  MemoryPackView,
} from "../../types/memory.js";
import { loadSettings } from "../../consent/settings.js";
import { listEntries, listVectors, getEntry } from "../store/idb.js";
import {
  cosineSimilarity,
  getEmbedder,
} from "../vector/embedder.js";

export interface RetrieveOptions {
  contextId: string;
  queryText: string;
  topK?: number;
  charBudget?: number;
  excludeIds?: string[];
}

/**
 * Hybrid retrieve: structured filters → flat cosine top-k → pack budget.
 */
export async function retrievePack(
  opts: RetrieveOptions
): Promise<MemoryPackView> {
  const settings = await loadSettings();
  const topK = opts.topK ?? settings.retrieveTopK;
  const charBudget = opts.charBudget ?? settings.packCharBudget;
  const exclude = new Set(opts.excludeIds ?? []);

  const now = Date.now();
  const entries = (await listEntries()).filter((e) => {
    if (!e.enabled || exclude.has(e.id)) return false;
    if (e.expiresAt && Date.parse(e.expiresAt) < now) return false;
    // MVP: global scope only (project scopes later)
    if (e.scope !== "global" && !e.scope.startsWith("host:claude")) {
      return false;
    }
    return true;
  });

  const embedder = getEmbedder();
  const queryVec = await embedder.embed(opts.queryText);
  const vectors = await listVectors();
  const byId = new Map(vectors.map((v) => [v.id, v]));

  const scored = entries
    .map((entry) => {
      const rec = byId.get(entry.id);
      if (!rec) return { entry, score: 0 };
      const score = cosineSimilarity(
        queryVec,
        Float32Array.from(rec.values)
      );
      const recencyBoost = recencyScore(entry.updatedAt);
      const kindBoost = kindPrior(entry.kind);
      return { entry, score: score + 0.05 * recencyBoost + kindBoost };
    })
    .sort((a, b) => b.score - a.score);

  const picked: MemoryEntry[] = [];
  let chars = 0;
  for (const { entry } of scored) {
    if (picked.length >= topK) break;
    const cost = (entry.title?.length ?? 0) + entry.body.length + 8;
    if (picked.length > 0 && chars + cost > charBudget) continue;
    picked.push(entry);
    chars += cost;
  }

  const pack: MemoryPack = {
    contextId: opts.contextId,
    entryIds: picked.map((e) => e.id),
    builtAt: new Date().toISOString(),
    queryText: opts.queryText,
  };

  return { ...pack, entries: picked };
}

export async function packFromIds(
  contextId: string,
  entryIds: string[],
  queryText: string
): Promise<MemoryPackView> {
  const entries: MemoryEntry[] = [];
  for (const id of entryIds) {
    const e = await getEntry(id);
    if (e && e.enabled) entries.push(e);
  }
  return {
    contextId,
    entryIds: entries.map((e) => e.id),
    builtAt: new Date().toISOString(),
    queryText,
    entries,
  };
}

function recencyScore(iso: string): number {
  const ageDays = (Date.now() - Date.parse(iso)) / (86400 * 1000);
  return Math.max(0, 1 - ageDays / 90);
}

function kindPrior(kind: MemoryEntry["kind"]): number {
  switch (kind) {
    case "identity":
      return 0.04;
    case "preference":
      return 0.03;
    case "procedure":
      return 0.02;
    case "context":
      return 0.01;
    default:
      return 0;
  }
}

/** Format pack text for visible composer inject. */
export function formatPackForInject(pack: MemoryPackView): string {
  if (pack.entries.length === 0) return "";
  const lines = pack.entries.map((e, i) => {
    const title = e.title ? `${e.title}: ` : "";
    return `${i + 1}. [${e.kind}] ${title}${e.body}`;
  });
  return [
    "<!-- chrome-ai-memory:begin -->",
    "Relevant personal memory (from local Chrome AI Memory extension):",
    ...lines,
    "<!-- chrome-ai-memory:end -->",
  ].join("\n");
}
