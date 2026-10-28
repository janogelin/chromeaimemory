/** Structured memory entry — durable fact/rule, not chat history. */
export type MemoryKind =
  | "preference"
  | "identity"
  | "procedure"
  | "context"
  | "note";

export type MemorySource =
  | "manual"
  | "selection"
  | "import"
  | "auto_extract";

export type Confidence = "high" | "medium" | "low";

export type MemoryScope = "global" | `project:${string}` | `host:${string}`;

export interface Provenance {
  chatId?: string;
  turnHash?: string;
  excerpt?: string;
}

export interface MemoryEntry {
  id: string;
  body: string;
  title?: string;
  kind: MemoryKind;
  tags: string[];
  scope: MemoryScope;
  enabled: boolean;
  source: MemorySource;
  confidence: Confidence;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  provenance?: Provenance;
  /** Model id used for this entry's embedding (re-embed on bump). */
  embeddingModelId: string;
}

/** Ephemeral pack — exact set shown in sidebar / injected into Claude. */
export interface MemoryPack {
  contextId: string;
  entryIds: string[];
  builtAt: string;
  queryText: string;
}

export interface MemoryPackView extends MemoryPack {
  entries: MemoryEntry[];
}

export interface VectorRecord {
  id: string;
  embeddingModelId: string;
  /** Length = EMBEDDING_DIM */
  values: number[];
}

export const EMBEDDING_MODEL_ID = "stub-hash-v1";
export const EMBEDDING_DIM = 64;
