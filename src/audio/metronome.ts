// Simple Web Audio metronome — a 900Hz blip on the downbeat,
// a 600Hz blip on off-beats. Creates / resumes the AudioContext lazily.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

export function click(options: { accent?: boolean; gain?: number } = {}): void {
  const { accent = false, gain = 0.35 } = options;
  const context = getCtx();
  const now = context.currentTime;
  const osc = context.createOscillator();
  const amp = context.createGain();

  osc.type = 'square';
  osc.frequency.value = accent ? 980 : 620;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(amp).connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function primeAudio(): void {
  getCtx();
}
