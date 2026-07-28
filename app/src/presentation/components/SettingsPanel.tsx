import { useState } from 'react';
import {
  getGeminiApiKey,
  getSpeechEnabled,
  notifySettingsChanged,
  setGeminiApiKey,
  setSpeechEnabled,
} from '../../infrastructure/config/settingsStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Bring-your-own-key settings panel. Saving swaps the composition root's reasoning engines
 * from Mock -> Gemini automatically (see App.tsx's settings-version state) — no rebuild, no
 * reload needed. Left as a plain text input per this milestone's scope (a real deployment
 * would want a secrets vault; this is a client-only prototype, the key never leaves the
 * browser except in direct calls to Google's API).
 */
export function SettingsPanel({ open, onClose }: Props) {
  const [key, setKey] = useState(getGeminiApiKey());
  const [speechEnabled, setSpeechEnabledLocal] = useState(getSpeechEnabled());

  if (!open) return null;

  const handleSave = () => {
    setGeminiApiKey(key.trim());
    setSpeechEnabled(speechEnabled);
    notifySettingsChanged();
    onClose();
  };

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-panel">
        <h2>Settings</h2>
        <label htmlFor="gemini-key">Gemini API key</label>
        <input
          id="gemini-key"
          type="password"
          autoComplete="off"
          placeholder="Paste your Gemini API key here"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <p className="settings-hint">
          Optional. Without a key, FlowViz uses an offline rule-based engine so the two HCXAI loops stay demoable. Add a key to
          switch both the diagram and schema reasoning engines to live Gemini generation.
        </p>

        <label htmlFor="speech-enabled" className="settings-checkbox-row">
          <input
            id="speech-enabled"
            type="checkbox"
            checked={speechEnabled}
            onChange={(e) => setSpeechEnabledLocal(e.target.checked)}
          />
          Speak confirmations and descriptions aloud
        </label>
        <p className="settings-hint">
          Spoken feedback uses your browser's built-in text-to-speech, which may show an audio indicator on this tab while
          speaking. Turn this off if you only want the written chat log.
        </p>

        <div className="settings-actions">
          <button type="button" onClick={handleSave}>
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
