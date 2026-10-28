import type { AuthSnapshot, AuthStatus } from "../types/settings.js";

const AUTH_KEY = "cam_auth_v1";

/**
 * Claude session affinity — identity = whoever is signed into claude.ai
 * in this Chrome profile. We only persist page-visible signals from the
 * content script. Never cookies, passwords, or session tokens.
 */
export async function loadAuth(): Promise<AuthSnapshot> {
  const raw = await chrome.storage.local.get(AUTH_KEY);
  const stored = raw[AUTH_KEY] as AuthSnapshot | undefined;
  return (
    stored ?? {
      status: "unknown",
      checkedAt: new Date().toISOString(),
    }
  );
}

export async function saveAuth(auth: AuthSnapshot): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export function authFromPageSignals(input: {
  hasUserMenu?: boolean;
  hasLoginCta?: boolean;
  hasComposer?: boolean;
}): AuthSnapshot {
  let status: AuthStatus = "unknown";
  let signal: string | undefined;

  if (input.hasLoginCta && !input.hasComposer && !input.hasUserMenu) {
    status = "signed_out";
    signal = "login_cta";
  } else if (input.hasComposer || input.hasUserMenu) {
    status = "signed_in";
    signal = input.hasUserMenu ? "user_menu" : "composer";
  }

  return {
    status,
    checkedAt: new Date().toISOString(),
    signal,
  };
}

/**
 * Heuristic DOM probes for claude.ai signed-in UI.
 * Selectors are intentionally loose — Claude's DOM churns; keep thin.
 */
export function probeClaudeAuthDom(doc: Document = document): {
  hasUserMenu: boolean;
  hasLoginCta: boolean;
  hasComposer: boolean;
} {
  const hasComposer = Boolean(
    doc.querySelector(
      'div[contenteditable="true"], textarea[placeholder*="Message" i], [data-testid="chat-input"]'
    )
  );
  const hasUserMenu = Boolean(
    doc.querySelector(
      '[data-testid="user-menu"], button[aria-label*="User" i], img[alt*="avatar" i]'
    )
  );
  const bodyText = (doc.body?.innerText ?? "").slice(0, 4000).toLowerCase();
  const hasLoginCta =
    /log\s*in|sign\s*in|continue with/.test(bodyText) && !hasComposer;

  return { hasUserMenu, hasLoginCta, hasComposer };
}
