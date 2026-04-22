// Live microphone pipeline — getUserMedia → AnalyserNode, emitting paired
// time-domain + frequency-domain frames at display refresh rate. Consumers
// decide whether to run autocorrelation (monophonic pitch) or chromagram
// (polyphonic chord) on each frame.

export interface AudioFrame {
  timeData: Float32Array;
  /** Frequency-domain magnitudes in dBFS (−Infinity…0). */
  freqData: Float32Array;
  sampleRate: number;
  fftSize: number;
}

export type FrameHandler = (frame: AudioFrame) => void;

export class AudioInput {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array | null = null;
  private freqBuf: Float32Array | null = null;
  private raf = 0;
  private onFrame: FrameHandler | null = null;

  async start(onFrame: FrameHandler): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Disable browser DSP so the raw instrument signal hits the analyser.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0.45;
    source.connect(this.analyser);
    // Use explicit ArrayBuffer backing so the Float32Array parameter
    // matches AnalyserNode's getFloat*Data signature on newer TS libs.
    this.timeBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.freqBuf = new Float32Array(new ArrayBuffer(this.analyser.frequencyBinCount * 4));
    this.onFrame = onFrame;
    this.loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.timeBuf = null;
    this.freqBuf = null;
    this.onFrame = null;
  }

  isRunning(): boolean {
    return this.stream !== null;
  }

  private loop = (): void => {
    const analyser = this.analyser;
    const timeBuf = this.timeBuf;
    const freqBuf = this.freqBuf;
    const ctx = this.ctx;
    const cb = this.onFrame;
    if (!analyser || !timeBuf || !freqBuf || !ctx || !cb) return;

    // TS 5.7+ typed-array buffer widening: cast to the DOM-expected form.
    analyser.getFloatTimeDomainData(timeBuf as Float32Array<ArrayBuffer>);
    analyser.getFloatFrequencyData(freqBuf as Float32Array<ArrayBuffer>);
    cb({
      timeData: timeBuf,
      freqData: freqBuf,
      sampleRate: ctx.sampleRate,
      fftSize: analyser.fftSize,
    });
    this.raf = requestAnimationFrame(this.loop);
  };
}

/** Compute rough RMS of a time-domain buffer; used to suppress detection on silence. */
export function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
