/**
 * Tiny localStorage-backed settings store. Currently holds just the Gemini API key (the
 * user brings their own — see docs/architecture.md "Bring your own key"). Kept as its own
 * module so the composition root (App.tsx) and the SettingsPanel component both depend on
 * one small, swappable seam instead of touching `localStorage` directly.
 */

const GEMINI_API_KEY_STORAGE_KEY = 'flowviz.geminiApiKey';
const SPEECH_ENABLED_STORAGE_KEY = 'flowviz.speechEnabled';

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, SSR, etc.) — silently no-op, engine falls
    // back to the mock reasoning engine.
  }
}

/** Spoken confirmations (WebSpeechTTS) are opt-out, not opt-in — they're a core accessibility
 *  channel for blind/low-vision users, so default true. Muting also stops the browser's
 *  native "this tab is playing audio" tab indicator from appearing on every confirmation. */
export function getSpeechEnabled(): boolean {
  try {
    const v = localStorage.getItem(SPEECH_ENABLED_STORAGE_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export function setSpeechEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SPEECH_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable — speech stays at its default (enabled).
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySettingsChanged(): void {
  for (const l of listeners) l();
}
