export interface ConsentState {
  /** Explicit opt-in before observe/learn/inject. */
  autoMemoryConsented: boolean;
  consentedAt?: string;
}

export interface RuntimeFlags {
  /** Pause stops learn + inject while keeping consent. */
  paused: boolean;
}

export interface ExtensionSettings {
  consent: ConsentState;
  flags: RuntimeFlags;
  /** Inject when retrieved pack entry set changes (MVP default). */
  injectWhenPackChanges: boolean;
  retrieveTopK: number;
  packCharBudget: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  consent: { autoMemoryConsented: false },
  flags: { paused: false },
  injectWhenPackChanges: true,
  retrieveTopK: 8,
  packCharBudget: 2400,
};

export type AuthStatus = "unknown" | "signed_in" | "signed_out";

export interface AuthSnapshot {
  status: AuthStatus;
  checkedAt: string;
  /** Page-visible signal only — never cookies/passwords. */
  signal?: string;
}
