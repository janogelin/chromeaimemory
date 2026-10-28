import type { AuthSnapshot } from "./settings.js";
import type { MemoryEntry, MemoryPackView } from "./memory.js";
import type { ExtensionSettings } from "./settings.js";

export type Message =
  | { type: "PING" }
  | { type: "PONG"; version: string }
  | { type: "GET_STATUS" }
  | {
      type: "STATUS";
      settings: ExtensionSettings;
      auth: AuthSnapshot;
      memoryCount: number;
      pack: MemoryPackView | null;
    }
  | { type: "SET_CONSENT"; consented: boolean }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "AUTH_UPDATE"; auth: AuthSnapshot }
  | { type: "TURNS_OBSERVED"; turns: ObservedTurn[]; contextId: string }
  | { type: "CONTEXT_CHANGED"; contextId: string; queryText: string }
  | { type: "PACK_UPDATED"; pack: MemoryPackView }
  | { type: "EXCLUDE_FROM_PACK"; entryId: string }
  | { type: "DISABLE_ENTRY"; entryId: string }
  | { type: "DELETE_ENTRY"; entryId: string }
  | { type: "UPSERT_ENTRY"; entry: Partial<MemoryEntry> & { body: string } }
  | { type: "LIST_MEMORIES" }
  | { type: "MEMORIES"; entries: MemoryEntry[] }
  | { type: "EXPORT_JSON" }
  | { type: "EXPORT_RESULT"; json: string }
  | { type: "IMPORT_JSON"; json: string }
  | { type: "WIPE_ALL" }
  | { type: "INJECT_PACK"; pack: MemoryPackView }
  | { type: "OPEN_SIDEPANEL" }
  | { type: "GET_PACK" }
  | { type: "ERROR"; error: string };

export interface ObservedTurn {
  role: "user" | "assistant";
  text: string;
  turnHash: string;
}

export function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
