import type { MemoryPackView } from "../../types/memory.js";
import { formatPackForInject } from "../../memory/retrieve/hybrid.js";

const BLOCK_START = "<!-- chrome-ai-memory:begin -->";
const BLOCK_END = "<!-- chrome-ai-memory:end -->";

/**
 * Visible composer prepend. Prefer transparent inject over hidden hooks.
 * DOM write paths are best-effort stubs — structure is wired for SW sync.
 */
export function injectPackIntoComposer(
  pack: MemoryPackView,
  doc: Document = document
): { ok: boolean; reason?: string } {
  const block = formatPackForInject(pack);
  const el = findComposer(doc);
  if (!el) return { ok: false, reason: "composer_not_found" };

  if (!block) {
    stripMemoryBlock(el);
    return { ok: true, reason: "empty_pack_cleared" };
  }

  if (el instanceof HTMLTextAreaElement) {
    el.value = replaceOrPrepend(el.value, block);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true };
  }

  // contenteditable
  const current = el.innerText ?? "";
  const next = replaceOrPrepend(current, block);
  // Prefer textContent to avoid HTML injection from memory bodies
  if (el.isContentEditable) {
    // Only rewrite when pack text changed
    if (!current.includes(block)) {
      el.focus();
      // Soft path: set text and fire input — may not stick on React sites
      trySetContentEditable(el, next);
    }
    return { ok: true, reason: "contenteditable_best_effort" };
  }

  return { ok: false, reason: "unsupported_composer" };
}

function findComposer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>('[data-testid="chat-input"]') ||
    doc.querySelector<HTMLElement>('div[contenteditable="true"]') ||
    doc.querySelector<HTMLTextAreaElement>("textarea")
  );
}

function replaceOrPrepend(current: string, block: string): string {
  if (current.includes(BLOCK_START) && current.includes(BLOCK_END)) {
    return current.replace(
      new RegExp(
        `${escapeReg(BLOCK_START)}[\\s\\S]*?${escapeReg(BLOCK_END)}\\n?`,
        "m"
      ),
      `${block}\n`
    );
  }
  return `${block}\n\n${current}`;
}

function stripMemoryBlock(el: HTMLElement): void {
  if (el instanceof HTMLTextAreaElement) {
    if (!el.value.includes(BLOCK_START)) return;
    el.value = el.value.replace(
      new RegExp(
        `${escapeReg(BLOCK_START)}[\\s\\S]*?${escapeReg(BLOCK_END)}\\n*`,
        "m"
      ),
      ""
    );
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const text = el.innerText ?? "";
  if (!text.includes(BLOCK_START)) return;
  trySetContentEditable(
    el,
    text.replace(
      new RegExp(
        `${escapeReg(BLOCK_START)}[\\s\\S]*?${escapeReg(BLOCK_END)}\\n*`,
        "m"
      ),
      ""
    )
  );
}

function trySetContentEditable(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Floating page chip: Memory · N · Open */
export function ensurePageChip(
  count: number,
  onOpen: () => void,
  doc: Document = document
): void {
  const id = "cam-page-chip";
  let chip = doc.getElementById(id) as HTMLButtonElement | null;
  if (!chip) {
    chip = doc.createElement("button");
    chip.id = id;
    chip.type = "button";
    Object.assign(chip.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483646",
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #2a2a2a",
      background: "#111",
      color: "#f2f2f2",
      font: "12px/1.2 ui-sans-serif, system-ui, sans-serif",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,.25)",
    });
    doc.body.appendChild(chip);
    chip.addEventListener("click", () => onOpen());
  }
  chip.textContent = `Memory · ${count} · Open`;
}
