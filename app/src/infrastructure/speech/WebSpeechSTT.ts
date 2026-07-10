import type { ISpeechToText } from '../../domain/ports';

type SpeechRecognitionCtor = new () => SpeechRecognition;

interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

/** Speech-to-text via the browser-native Web Speech API. Falls back gracefully if unsupported. */
export class WebSpeechSTT implements ISpeechToText {
  private recognition: SpeechRecognition | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && Boolean(getCtor());
  }

  start(onResult: (text: string) => void, onEnd?: () => void): void {
    const Ctor = getCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: unknown) => {
      const e = event as SpeechRecognitionEventLike;
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => onEnd?.();
    this.recognition = recognition;
    recognition.start();
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }
}

function getCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
