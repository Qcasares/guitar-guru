// Shared AudioContext + master bus for all in-app audio sources.
//
// Single lazy context so synth, metronome, finger cues, and the recorded-audio
// track all run on one clock and one output graph. Two parallel destinations
// are exposed:
//   master     — dry bus, gain 0.32, straight to ctx.destination
//   reverbSend — wet bus; feeds a ConvolverNode with a 0.6 s algorithmic IR
//                through a low send gain so ambience is subtle, not a wash
//
// Callers can connect to `master` for the dry signal and (optionally) to
// `reverbSend` for ambience, e.g. `out.connect(master); out.connect(reverbSend)`.

interface WebkitWindow {
  webkitAudioContext?: typeof AudioContext;
}

export interface SharedAudio {
  ctx: AudioContext;
  master: GainNode;
  reverbSend: GainNode;
}

let shared: SharedAudio | null = null;

function resolveCtor(): typeof AudioContext {
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext)
      : undefined;
  if (!Ctor) throw new Error('Web Audio API is not available in this environment.');
  return Ctor;
}

/** Build a short (~0.6 s) exponentially-decaying noise IR for a convolver. */
function buildImpulseResponse(ctx: AudioContext): AudioBuffer {
  const durationSec = 0.6;
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // noise * (1-t)^2.2 — quick decay, no metallic tail.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
    }
  }
  return buf;
}

/** Lazily construct (and resume) the shared audio graph. */
export function getSharedCtx(): SharedAudio {
  if (shared) {
    if (shared.ctx.state === 'suspended') void shared.ctx.resume();
    return shared;
  }
  const Ctor = resolveCtor();
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);

  // Wet bus: reverbSend → convolver → wetGain → master.
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  let convolver: ConvolverNode | null = null;
  try {
    convolver = ctx.createConvolver();
    convolver.buffer = buildImpulseResponse(ctx);
  } catch {
    // Some very old stacks lack ConvolverNode. Fall through — reverbSend then
    // just feeds nothing and callers still get dry sound from master.
    convolver = null;
  }
  if (convolver) {
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.08;
    reverbSend.connect(convolver).connect(wetGain).connect(master);
  }

  if (ctx.state === 'suspended') void ctx.resume();

  shared = { ctx, master, reverbSend };
  return shared;
}

/** Idempotent — ensures the shared audio graph is built and running. */
export function primeSharedAudio(): void {
  getSharedCtx();
}

/** Test-only: drop the cached graph so the next getSharedCtx builds a fresh one. */
export function __resetSharedCtxForTests(): void {
  shared = null;
}
