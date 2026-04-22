// Thin wrapper around the Web Speech Synthesis API for voice announcements.
// Used to announce the upcoming chord (rhythm mode) or next note (lead GODMODE).

type SpeakOpts = {
  rate?: number; // 0.1–10, default 1
  pitch?: number; // 0–2, default 1
  volume?: number; // 0–1, default 1
  priority?: 'queue' | 'replace';
};

const DEFAULTS: Required<Pick<SpeakOpts, 'rate' | 'pitch' | 'volume' | 'priority'>> = {
  rate: 1.05,
  pitch: 1,
  volume: 1,
  priority: 'replace',
};

export function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: SpeakOpts = {}): void {
  if (!supported() || !text) return;
  const merged = { ...DEFAULTS, ...opts };
  if (merged.priority === 'replace') {
    window.speechSynthesis.cancel();
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = merged.rate;
  utter.pitch = merged.pitch;
  utter.volume = merged.volume;
  window.speechSynthesis.speak(utter);
}

export function stop(): void {
  if (!supported()) return;
  window.speechSynthesis.cancel();
}
