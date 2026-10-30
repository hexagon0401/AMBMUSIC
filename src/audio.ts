export type Sound = 'water' | 'wind' | 'birds';

// Locally synthesized sound: no recording downloads or autoplay.
export class NatureAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private channels = new Map<Sound, GainNode>();
  private levels: Record<Sound, number> = { water: 0.55, wind: 0.25, birds: 0.30 };
  private birdTimer?: ReturnType<typeof setInterval>;
  private volume = 0.55;
  private playing = false;

  private setup() {
    const ctx = this.context = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.35;
    this.master.connect(ctx.destination);
    for (const sound of ['water', 'wind', 'birds'] as Sound[]) {
      const gain = ctx.createGain();
      gain.gain.value = this.levels[sound];
      gain.connect(this.master);
      this.channels.set(sound, gain);
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < samples.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) / 1.02;
      samples[i] = brown * 4;
    }
    for (const sound of ['water', 'wind'] as const) {
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      noise.playbackRate.value = sound === 'water' ? 1 : 0.55;
      const filter = ctx.createBiquadFilter();
      filter.type = sound === 'water' ? 'highpass' : 'lowpass';
      filter.frequency.value = sound === 'water' ? 350 : 280;
      filter.Q.value = 0.5;
      noise.connect(filter).connect(this.channels.get(sound)!);
      noise.start();
    }
    this.birdTimer = setInterval(() => {
      if (!this.playing || ctx.state !== 'running' || this.levels.birds === 0) return;
      const start = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        const at = start + i * 0.18;
        oscillator.frequency.setValueAtTime(1700 + Math.random() * 500, at);
        oscillator.frequency.exponentialRampToValueAtTime(2900 + Math.random() * 600, at + 0.06);
        oscillator.frequency.exponentialRampToValueAtTime(1800, at + 0.14);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
        oscillator.connect(gain).connect(this.channels.get('birds')!);
        oscillator.start(at);
        oscillator.stop(at + 0.18);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
    }, 6800);
  }
  async setPlaying(playing: boolean) {
    if (!this.context && playing) this.setup();
    if (!this.context) return;
    this.playing = playing;
    if (playing) await this.context.resume();
    else await this.context.suspend();
  }
  setLevel(sound: Sound, value: number) {
    this.levels[sound] = value;
    const gain = this.channels.get(sound);
    if (gain && this.context) gain.gain.setTargetAtTime(value, this.context.currentTime, 0.08);
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(value * 0.35, this.context.currentTime, 0.08);
  }
  get state() { return this.context?.state ?? 'suspended'; }
  dispose() { clearInterval(this.birdTimer); void this.context?.close(); }
}
