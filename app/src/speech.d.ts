// Minimal ambient types for the Web Speech API, which TypeScript's default DOM lib
// does not fully cover across all versions/browsers.
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}
