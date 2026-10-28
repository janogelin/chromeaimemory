import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
} from "../../types/memory.js";

/**
 * Embedding interface — swap StubEmbedder for a WASM MiniLM / Transformers.js
 * implementation without touching retrieve or store layers.
 */
export interface Embedder {
  readonly modelId: string;
  readonly dim: number;
  embed(text: string): Promise<Float32Array>;
}

/**
 * Deterministic bag-of-hashes stub. Good enough for scaffold + cosine top-k
 * wiring; not semantic. Replace with on-device WASM for real retrieval quality.
 *
 * First-run WASM path (later): download/cache MiniLM-class model into
 * chrome.storage / OPFS, then implement WasmEmbedder behind this interface.
 */
export class StubEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL_ID;
  readonly dim = EMBEDDING_DIM;

  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(this.dim);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vec;

    for (const token of tokens) {
      const h = fnv1a(token);
      const i = h % this.dim;
      const sign = h & 1 ? 1 : -1;
      vec[i] += sign;
      // light bigram mixing
      const h2 = fnv1a(token + "#");
      vec[h2 % this.dim] += 0.5 * (h2 & 1 ? 1 : -1);
    }
    return l2Normalize(vec);
  }
}

let defaultEmbedder: Embedder = new StubEmbedder();

export function getEmbedder(): Embedder {
  return defaultEmbedder;
}

/** Test / future WASM hook. */
export function setEmbedder(embedder: Embedder): void {
  defaultEmbedder = embedder;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= norm;
  return v;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}
