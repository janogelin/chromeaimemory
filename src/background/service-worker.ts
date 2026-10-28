import { onMessage, sendToTab } from "../messaging/bus.js";
import type { Message } from "../types/messages.js";
import type { MemoryPackView } from "../types/memory.js";
import {
  canAutoMemory,
  loadSettings,
  setConsent,
  setPaused,
} from "../consent/settings.js";
import { loadAuth, saveAuth } from "../auth/claude-session.js";
import {
  deleteMemory,
  disableMemory,
  exportJson,
  importJson,
  listMemories,
  memoryCount,
  upsertMemory,
  wipeMemories,
} from "../memory/store/api.js";
import { packFromIds, retrievePack } from "../memory/retrieve/hybrid.js";
import { extractFromTurns } from "../extract/pipeline.js";

const PACK_KEY = "cam_active_pack_v1";
const EXCLUDE_KEY = "cam_pack_excludes_v1";

let lastPackSignature = "";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

onMessage(async (message, sender) => {
  switch (message.type) {
    case "PING":
      return { type: "PONG", version: "0.1.0" };

    case "GET_STATUS":
      return buildStatus();

    case "SET_CONSENT": {
      await setConsent(message.consented);
      return buildStatus();
    }

    case "SET_PAUSED": {
      await setPaused(message.paused);
      return buildStatus();
    }

    case "AUTH_UPDATE": {
      await saveAuth(message.auth);
      return buildStatus();
    }

    case "TURNS_OBSERVED": {
      const settings = await loadSettings();
      const auth = await loadAuth();
      if (!canAutoMemory(settings) || auth.status !== "signed_in") {
        return { type: "PONG", version: "0.1.0" };
      }
      await extractFromTurns(message.turns, {
        chatId: message.contextId,
      });
      // After learn, refresh pack from latest context query if we have one
      const packState = await loadPack();
      if (packState) {
        await rebuildAndMaybeInject(
          message.contextId,
          packState.queryText || message.contextId,
          sender.tab?.id
        );
      }
      return buildStatus();
    }

    case "CONTEXT_CHANGED": {
      const settings = await loadSettings();
      const auth = await loadAuth();
      if (!canAutoMemory(settings) || auth.status !== "signed_in") {
        return { type: "PONG", version: "0.1.0" };
      }
      await rebuildAndMaybeInject(
        message.contextId,
        message.queryText,
        sender.tab?.id
      );
      return buildStatus();
    }

    case "EXCLUDE_FROM_PACK": {
      const pack = await loadPack();
      if (!pack) return buildStatus();
      const excludes = await loadExcludes(pack.contextId);
      excludes.add(message.entryId);
      await saveExcludes(pack.contextId, excludes);
      const nextIds = pack.entryIds.filter((id) => id !== message.entryId);
      const next = await packFromIds(pack.contextId, nextIds, pack.queryText);
      await savePack(next);
      await broadcastPack(next, sender.tab?.id);
      return buildStatus();
    }

    case "DISABLE_ENTRY": {
      await disableMemory(message.entryId);
      const pack = await loadPack();
      if (pack) {
        await rebuildAndMaybeInject(
          pack.contextId,
          pack.queryText,
          sender.tab?.id
        );
      }
      return buildStatus();
    }

    case "DELETE_ENTRY": {
      await deleteMemory(message.entryId);
      const pack = await loadPack();
      if (pack) {
        await rebuildAndMaybeInject(
          pack.contextId,
          pack.queryText,
          sender.tab?.id
        );
      }
      return buildStatus();
    }

    case "UPSERT_ENTRY": {
      await upsertMemory(message.entry);
      return buildStatus();
    }

    case "LIST_MEMORIES": {
      const entries = await listMemories();
      return { type: "MEMORIES", entries };
    }

    case "EXPORT_JSON": {
      const json = await exportJson();
      return { type: "EXPORT_RESULT", json };
    }

    case "IMPORT_JSON": {
      await importJson(message.json);
      return buildStatus();
    }

    case "WIPE_ALL": {
      await wipeMemories();
      await chrome.storage.local.remove([PACK_KEY, EXCLUDE_KEY]);
      lastPackSignature = "";
      return buildStatus();
    }

    case "GET_PACK": {
      const pack = await loadPack();
      return pack
        ? { type: "PACK_UPDATED", pack }
        : { type: "PONG", version: "0.1.0" };
    }

    case "OPEN_SIDEPANEL": {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        await chrome.sidePanel.open({ tabId });
      } else {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id != null) await chrome.sidePanel.open({ tabId: tab.id });
      }
      return { type: "PONG", version: "0.1.0" };
    }

    default:
      return { type: "PONG", version: "0.1.0" };
  }
});

async function buildStatus(): Promise<Message> {
  const [settings, auth, count, pack] = await Promise.all([
    loadSettings(),
    loadAuth(),
    memoryCount(),
    loadPack(),
  ]);
  return {
    type: "STATUS",
    settings,
    auth,
    memoryCount: count,
    pack,
  };
}

async function rebuildAndMaybeInject(
  contextId: string,
  queryText: string,
  tabId?: number
): Promise<void> {
  const settings = await loadSettings();
  const excludes = await loadExcludes(contextId);
  const pack = await retrievePack({
    contextId,
    queryText,
    excludeIds: [...excludes],
  });
  await savePack(pack);

  const signature = pack.entryIds.join(",");
  const changed = signature !== lastPackSignature;
  lastPackSignature = signature;

  await broadcastPack(pack, tabId);

  if (settings.injectWhenPackChanges && changed) {
    if (tabId != null) {
      await sendToTab(tabId, { type: "INJECT_PACK", pack });
    } else {
      const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
      for (const tab of tabs) {
        if (tab.id != null) {
          await sendToTab(tab.id, { type: "INJECT_PACK", pack });
        }
      }
    }
  }
}

async function broadcastPack(
  pack: MemoryPackView,
  tabId?: number
): Promise<void> {
  const msg: Message = { type: "PACK_UPDATED", pack };
  // UI pages listening via runtime.onMessage
  try {
    await chrome.runtime.sendMessage(msg);
  } catch {
    /* no UI listeners */
  }
  if (tabId != null) await sendToTab(tabId, msg);
}

async function loadPack(): Promise<MemoryPackView | null> {
  // Prefer session; fall back to local for older Chrome / missing API.
  try {
    if (chrome.storage.session) {
      const raw = await chrome.storage.session.get(PACK_KEY);
      if (PACK_KEY in raw) {
        return (raw[PACK_KEY] as MemoryPackView | undefined) ?? null;
      }
    }
  } catch {
    /* fall through */
  }
  const local = await chrome.storage.local.get(PACK_KEY);
  return (local[PACK_KEY] as MemoryPackView | undefined) ?? null;
}

async function savePack(pack: MemoryPackView): Promise<void> {
  try {
    if (chrome.storage.session) {
      await chrome.storage.session.set({ [PACK_KEY]: pack });
      return;
    }
  } catch {
    /* fall through */
  }
  await chrome.storage.local.set({ [PACK_KEY]: pack });
}

async function loadExcludes(contextId: string): Promise<Set<string>> {
  const raw = await chrome.storage.local.get(EXCLUDE_KEY);
  const map = (raw[EXCLUDE_KEY] as Record<string, string[]> | undefined) ?? {};
  return new Set(map[contextId] ?? []);
}

async function saveExcludes(
  contextId: string,
  ids: Set<string>
): Promise<void> {
  const raw = await chrome.storage.local.get(EXCLUDE_KEY);
  const map = (raw[EXCLUDE_KEY] as Record<string, string[]> | undefined) ?? {};
  map[contextId] = [...ids];
  await chrome.storage.local.set({ [EXCLUDE_KEY]: map });
}

// Soft expiry purge alarm (optional MVP hygiene)
chrome.alarms.create("cam-purge", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "cam-purge") return;
  void (async () => {
    const entries = await listMemories();
    const now = Date.now();
    for (const e of entries) {
      if (e.expiresAt && Date.parse(e.expiresAt) < now) {
        await deleteMemory(e.id);
      }
    }
  })();
});
