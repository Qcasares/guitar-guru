// Wrapper around the Web Speech Recognition API — handles browser quirks,
// continuous restart on natural end, and explicit user-driven stop.
//
// Browser support as of 2026: Chrome / Edge (native), Safari (webkit prefix,
// sometimes flaky), Firefox (not supported). We surface `supported()` so
// callers can render an inline "not available in this browser" notice.

type SpeechRecognitionCtor = new () => SpeechRecognition;

/** Minimal structural type — the Web Speech DOM lib isn't always in scope. */
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: ((e: Event) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onstart: ((e: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

function ctor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function supported(): boolean {
  return ctor() !== null;
}

export interface VoiceOptions {
  onFinalTranscript: (transcript: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

export class VoiceRecognizer {
  private recognition: SpeechRecognition | null = null;
  private desired = false;
  private lastRestartAt = 0;

  constructor(private opts: VoiceOptions) {}

  start(): void {
    if (this.desired) return;
    const Ctor = ctor();
    if (!Ctor) {
      this.opts.onError?.('Voice recognition not supported in this browser.');
      return;
    }
    this.desired = true;
    this.ensureRunning();
  }

  stop(): void {
    this.desired = false;
    this.recognition?.abort();
    this.recognition = null;
  }

  isRunning(): boolean {
    return this.desired;
  }

  private ensureRunning(): void {
    if (!this.desired) return;
    const Ctor = ctor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = this.opts.lang ?? 'en-US';

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result.isFinal) continue;
        const alt = result[0];
        if (alt) this.opts.onFinalTranscript(alt.transcript.trim().toLowerCase());
      }
    };

    rec.onend = () => {
      if (!this.desired) return;
      // Throttle auto-restart so a permission revoke loop doesn't hammer.
      const now = performance.now();
      const gap = now - this.lastRestartAt;
      this.lastRestartAt = now;
      const delay = gap < 500 ? 500 : 0;
      window.setTimeout(() => this.ensureRunning(), delay);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.desired = false;
        this.opts.onError?.('Microphone permission denied for voice commands.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.opts.onError?.(e.error);
      }
    };

    try {
      rec.start();
      this.recognition = rec;
    } catch (err) {
      // `InvalidStateError` if a previous instance is still winding down.
      this.opts.onError?.(err instanceof Error ? err.message : String(err));
    }
  }
}
