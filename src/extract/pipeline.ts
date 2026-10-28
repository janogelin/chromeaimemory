import type { ObservedTurn } from "../types/messages.js";
import type { MemoryEntry, MemoryKind } from "../types/memory.js";
import { listMemories, upsertMemory } from "../memory/store/api.js";
import { cosineSimilarity, getEmbedder } from "../memory/vector/embedder.js";
import { getVector } from "../memory/store/idb.js";

export type ExtractDecision =
  | { action: "skip"; reason: string }
  | { action: "write"; entry: MemoryEntry }
  | { action: "merge"; entry: MemoryEntry };

const SECRET_RE =
  /\b(password|passwd|api[_-]?key|secret|token|otp|ssn|credit\s*card)\b/i;

/**
 * On-device heuristic extraction (MVP). No remote LLM.
 * Write/skip/merge rules per framework §6.
 */
export async function extractFromTurns(
  turns: ObservedTurn[],
  context: { chatId?: string }
): Promise<ExtractDecision[]> {
  const userTurns = turns.filter((t) => t.role === "user");
  const decisions: ExtractDecision[] = [];

  for (const turn of userTurns) {
    const text = turn.text.trim();
    if (!text || text.length < 12) {
      decisions.push({ action: "skip", reason: "too_short" });
      continue;
    }
    if (SECRET_RE.test(text)) {
      decisions.push({ action: "skip", reason: "secret_pattern" });
      continue;
    }

    const candidate = heuristicCandidate(text);
    if (!candidate) {
      decisions.push({ action: "skip", reason: "no_durable_signal" });
      continue;
    }

    const mergeTarget = await findMergeTarget(candidate.body, candidate.kind);
    if (mergeTarget) {
      const entry = await upsertMemory({
        id: mergeTarget.id,
        body: candidate.body,
        title: candidate.title,
        kind: candidate.kind,
        source: "auto_extract",
        confidence: candidate.confidence,
        provenance: {
          chatId: context.chatId,
          turnHash: turn.turnHash,
          excerpt: text.slice(0, 240),
        },
      });
      decisions.push({ action: "merge", entry });
    } else {
      const entry = await upsertMemory({
        body: candidate.body,
        title: candidate.title,
        kind: candidate.kind,
        source: "auto_extract",
        confidence: candidate.confidence,
        tags: candidate.tags,
        provenance: {
          chatId: context.chatId,
          turnHash: turn.turnHash,
          excerpt: text.slice(0, 240),
        },
      });
      decisions.push({ action: "write", entry });
    }
  }

  return decisions;
}

interface Candidate {
  body: string;
  title: string;
  kind: MemoryKind;
  confidence: "high" | "medium" | "low";
  tags: string[];
}

function heuristicCandidate(text: string): Candidate | null {
  const patterns: Array<{
    re: RegExp;
    kind: MemoryKind;
    confidence: Candidate["confidence"];
    pick?: (m: RegExpMatchArray) => string;
  }> = [
    {
      re: /\b(?:call me|my name is|i(?:'m| am))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      kind: "identity",
      confidence: "high",
      pick: (m) => `User's name: ${m[1]}`,
    },
    {
      re: /\b(?:i (?:always|prefer|want you to)|please (?:always|be)|don'?t (?:ever )?(?:use|assume))\b[^.!?\n]{8,160}/i,
      kind: "preference",
      confidence: "medium",
    },
    {
      re: /\b(?:always use|we use|prefer)\s+(pnpm|npm|yarn|bun|poetry|pip)\b/i,
      kind: "procedure",
      confidence: "high",
      pick: (m) => `Package manager: always use ${m[1]}`,
    },
    {
      re: /\b(?:i work (?:on|at|as)|i(?:'m| am) (?:a|an|the)\s+)[^.!?\n]{6,120}/i,
      kind: "context",
      confidence: "medium",
    },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (!m) continue;
    const body = (p.pick ? p.pick(m) : m[0]!).trim();
    return {
      body,
      title: body.slice(0, 64),
      kind: p.kind,
      confidence: p.confidence,
      tags: ["auto"],
    };
  }
  return null;
}

async function findMergeTarget(
  body: string,
  kind: MemoryKind
): Promise<MemoryEntry | null> {
  const existing = (await listMemories()).filter(
    (e) => e.kind === kind && e.enabled
  );
  const embedder = getEmbedder();
  const q = await embedder.embed(body);

  let best: { entry: MemoryEntry; score: number } | null = null;
  for (const e of existing) {
    const normSame =
      normalize(e.body) === normalize(body) ||
      normalize(e.body).includes(normalize(body)) ||
      normalize(body).includes(normalize(e.body));
    if (normSame) return e;

    const vec = await getVector(e.id);
    if (!vec) continue;
    const score = cosineSimilarity(q, Float32Array.from(vec.values));
    if (score > 0.92 && (!best || score > best.score)) {
      best = { entry: e, score };
    }
  }
  return best?.entry ?? null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
