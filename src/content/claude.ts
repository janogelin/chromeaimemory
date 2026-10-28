import { sendMessage } from "../messaging/bus.js";
import { isMessage, type Message } from "../types/messages.js";
import {
  authFromPageSignals,
  probeClaudeAuthDom,
} from "../auth/claude-session.js";
import {
  buildQueryText,
  collectNewTurns,
  getContextId,
} from "../observe/claude/dom.js";
import {
  ensurePageChip,
  injectPackIntoComposer,
} from "../inject/claude/composer.js";
import type { MemoryPackView } from "../types/memory.js";

const ISOLATION = "chrome-ai-memory-cs";

declare global {
  interface Window {
    __camCsBootstrapped?: string;
  }
}

if (window.__camCsBootstrapped !== ISOLATION) {
  window.__camCsBootstrapped = ISOLATION;
  boot();
}

function boot(): void {
  void pushAuth();
  void pushContext();
  observeDom();
  listenRuntime();
  ensurePageChip(0, () => {
    void sendMessage({ type: "OPEN_SIDEPANEL" });
  });

  // Periodic auth / context refresh (Claude is an SPA)
  setInterval(() => {
    void pushAuth();
  }, 8000);
}

function listenRuntime(): void {
  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    if (!isMessage(raw)) return false;
    void handle(raw).then((reply) => {
      if (reply) sendResponse(reply);
    });
    return true;
  });
}

async function handle(message: Message): Promise<Message | void> {
  if (message.type === "INJECT_PACK") {
    injectPackIntoComposer(message.pack);
    ensurePageChip(message.pack.entryIds.length, () => {
      void sendMessage({ type: "OPEN_SIDEPANEL" });
    });
    return { type: "PONG", version: "0.1.0" };
  }
  if (message.type === "PACK_UPDATED") {
    ensurePageChip(message.pack.entryIds.length, () => {
      void sendMessage({ type: "OPEN_SIDEPANEL" });
    });
    return { type: "PONG", version: "0.1.0" };
  }
  return { type: "PONG", version: "0.1.0" };
}

async function pushAuth(): Promise<void> {
  const signals = probeClaudeAuthDom();
  const auth = authFromPageSignals(signals);
  await sendMessage({ type: "AUTH_UPDATE", auth });
}

let lastContextSig = "";
let lastTurnCount = 0;

async function pushContext(): Promise<void> {
  const contextId = getContextId();
  const queryText = buildQueryText();
  const sig = `${contextId}|${queryText.slice(0, 200)}`;
  if (sig === lastContextSig) return;
  lastContextSig = sig;
  await sendMessage({
    type: "CONTEXT_CHANGED",
    contextId,
    queryText,
  });
}

function observeDom(): void {
  let debounce: number | undefined;
  const schedule = () => {
    if (debounce) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      void onDomTick();
    }, 400);
  };

  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Also watch composer input for retrieve refresh
  document.addEventListener(
    "input",
    () => {
      schedule();
    },
    true
  );
}

async function onDomTick(): Promise<void> {
  const turns = collectNewTurns();
  if (turns.length > 0) {
    lastTurnCount += turns.length;
    await sendMessage({
      type: "TURNS_OBSERVED",
      turns,
      contextId: getContextId(),
    });
  }
  await pushContext();

  // Keep chip count roughly in sync via status
  const status = await sendMessage({ type: "GET_STATUS" });
  if (status.type === "STATUS") {
    const n = status.pack?.entryIds.length ?? 0;
    ensurePageChip(n, () => {
      void sendMessage({ type: "OPEN_SIDEPANEL" });
    });
  }

  void lastTurnCount;
}

// Suppress unused if tree-shaken oddly
export type { MemoryPackView };
