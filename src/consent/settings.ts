import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
} from "../types/settings.js";

const KEY = "cam_settings_v1";

export async function loadSettings(): Promise<ExtensionSettings> {
  const raw = await chrome.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<ExtensionSettings> | undefined;
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    consent: { ...DEFAULT_SETTINGS.consent, ...stored.consent },
    flags: { ...DEFAULT_SETTINGS.flags, ...stored.flags },
  };
}

export async function saveSettings(
  settings: ExtensionSettings
): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

export async function setConsent(consented: boolean): Promise<ExtensionSettings> {
  const settings = await loadSettings();
  settings.consent = {
    autoMemoryConsented: consented,
    consentedAt: consented ? new Date().toISOString() : undefined,
  };
  if (!consented) settings.flags.paused = true;
  await saveSettings(settings);
  return settings;
}

export async function setPaused(paused: boolean): Promise<ExtensionSettings> {
  const settings = await loadSettings();
  settings.flags.paused = paused;
  await saveSettings(settings);
  return settings;
}

/** Auto-memory may run only with consent, not paused. */
export function canAutoMemory(settings: ExtensionSettings): boolean {
  return settings.consent.autoMemoryConsented && !settings.flags.paused;
}
