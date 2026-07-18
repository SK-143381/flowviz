/**
 * Tiny localStorage-backed settings store. Currently holds just the Gemini API key (the
 * user brings their own — see docs/architecture.md "Bring your own key"). Kept as its own
 * module so the composition root (App.tsx) and the SettingsPanel component both depend on
 * one small, swappable seam instead of touching `localStorage` directly.
 */

const GEMINI_API_KEY_STORAGE_KEY = 'flowviz.geminiApiKey';

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

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySettingsChanged(): void {
  for (const l of listeners) l();
}
