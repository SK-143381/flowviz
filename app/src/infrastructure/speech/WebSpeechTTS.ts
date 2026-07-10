import type { ITextToSpeech } from '../../domain/ports';

/** Text-to-speech via the browser-native Web Speech API (write-up Section 4: month-one choice). */
export class WebSpeechTTS implements ITextToSpeech {
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

  speak(text: string): void {
    if (!this.synth) return;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    this.synth.speak(utterance);
  }

  cancel(): void {
    this.synth?.cancel();
  }
}
