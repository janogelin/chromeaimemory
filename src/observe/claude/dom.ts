import type { ObservedTurn } from "../../types/messages.js";

/**
 * Thin Claude.ai DOM adapter. Selectors will break — isolate churn here.
 * Stubs use best-effort heuristics; structure is real for messaging/SW.
 */

const MARKER_ATTR = "data-cam-seen";

export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function getContextId(): string {
  const path = location.pathname;
  const m = path.match(/\/chat\/([a-zA-Z0-9-]+)/);
  if (m?.[1]) return `claude:${m[1]}`;
  return `claude:path:${path}`;
}

export function readComposerText(doc: Document = document): string {
  const el =
    doc.querySelector<HTMLElement>('[data-testid="chat-input"]') ||
    doc.querySelector<HTMLElement>('div[contenteditable="true"]') ||
    doc.querySelector<HTMLTextAreaElement>("textarea");
  if (!el) return "";
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.innerText ?? "";
}

/**
 * Collect newly appeared turn-like blocks. Fragile — returns [] if DOM unknown.
 */
export function collectNewTurns(doc: Document = document): ObservedTurn[] {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[data-testid="user-message"], [data-testid="assistant-message"], [class*="font-claude-message"], div[data-is-streaming]'
    )
  );

  // Fallback: look for role-ish articles
  const nodes =
    candidates.length > 0
      ? candidates
      : Array.from(
          doc.querySelectorAll<HTMLElement>(
            'div[class*="Message"], article, [class*="turn"]'
          )
        ).slice(-12);

  const turns: ObservedTurn[] = [];
  for (const node of nodes) {
    if (node.getAttribute(MARKER_ATTR)) continue;
    const text = (node.innerText ?? "").trim();
    if (text.length < 2) continue;

    const role = inferRole(node, text);
    const turnHash = hashText(`${role}:${text.slice(0, 500)}`);
    node.setAttribute(MARKER_ATTR, turnHash);
    turns.push({ role, text: text.slice(0, 8000), turnHash });
  }
  return turns;
}

function inferRole(
  node: HTMLElement,
  text: string
): "user" | "assistant" {
  const testId = node.getAttribute("data-testid") ?? "";
  if (/user/i.test(testId)) return "user";
  if (/assistant|claude/i.test(testId)) return "assistant";
  const cls = node.className?.toString?.() ?? "";
  if (/user/i.test(cls)) return "user";
  if (/assistant|claude/i.test(cls)) return "assistant";
  // Weak fallback: Human-looking short prompts vs long replies
  if (text.length < 280 && !/^Claude\b/i.test(text)) return "user";
  return "assistant";
}

export function buildQueryText(doc: Document = document): string {
  const title =
    doc.querySelector("title")?.textContent?.trim() ??
    doc.querySelector("h1")?.textContent?.trim() ??
    "";
  const draft = readComposerText(doc);
  const recent = collectRecentPlain(doc, 3);
  return [title, recent, draft].filter(Boolean).join("\n").slice(0, 4000);
}

function collectRecentPlain(doc: Document, n: number): string {
  const turns = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[data-testid="user-message"], [data-testid="assistant-message"]'
    )
  ).slice(-n);
  return turns.map((t) => (t.innerText ?? "").trim()).join("\n");
}
