/**
 * Listening for voice commands with the browser's speech recogniser (the Web
 * Speech API: Chrome, Edge, Safari; availability in headset browsers varies).
 * It keeps listening until stopped, restarting when the browser ends a session.
 */

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

type Ctor = new () => Recognition;

export class SpeechInput {
  private rec: Recognition | null = null;
  listening = false;
  readonly supported: boolean;
  private ctor: Ctor | undefined;

  constructor(private onText: (text: string) => void, private onState: (listening: boolean, error?: string) => void) {
    const w = typeof window === 'undefined' ? undefined : (window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor });
    this.ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
    this.supported = !!this.ctor;
  }

  toggle(): void {
    if (this.listening) this.stop();
    else this.start();
  }

  start(): void {
    if (!this.ctor) return this.onState(false, 'Voice commands need a browser with speech recognition (Chrome, Edge or Safari).');
    if (this.listening) return;
    const rec = new this.ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) this.onText(e.results[i][0].transcript);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.listening = false;
        this.onState(false, 'Microphone permission was refused.');
      }
    };
    // browsers end recognition after silence; keep going while switched on
    rec.onend = () => {
      if (this.listening) {
        try {
          rec.start();
        } catch {
          this.listening = false;
          this.onState(false);
        }
      }
    };
    this.rec = rec;
    this.listening = true;
    try {
      rec.start();
      this.onState(true);
    } catch (err) {
      this.listening = false;
      this.onState(false, (err as Error).message);
    }
  }

  stop(): void {
    this.listening = false;
    try {
      this.rec?.stop();
    } catch {
      // already stopped
    }
    this.rec = null;
    this.onState(false);
  }
}
