// Original procedural effects. No audio from the reference recording is used.
export class EncounterAudio {
  prepare() {
    if (this.context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = this.context = new Context({latencyHint: 'interactive'});
    this.output = context.createGain();
    this.output.gain.value = .32;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.ratio.value = 4;
    this.output.connect(compressor).connect(context.destination);
    const room = context.createConvolver();
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * .7), context.sampleRate);
    let seed = 381;
    const random = () => {seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1;};
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = random() * Math.pow(1 - i / data.length, 3) * .22;
    }
    room.buffer = impulse;
    this.send = context.createGain();
    this.send.gain.value = .20;
    this.send.connect(room).connect(this.output);
    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random();
    this.last = new Map();
    this.muted = false;
  }

  unlock() {
    try {
      this.prepare();
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    } catch {}
  }

  toggle() {
    this.unlock();
    this.muted = !this.muted;
    if (this.output) this.output.gain.setTargetAtTime(this.muted ? 0 : .32, this.context.currentTime, .02);
    return this.muted;
  }

  tone(frequency, end, duration, volume, type = 'sine', delay = 0) {
    const context = this.context, at = context.currentTime + delay;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, end), at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), at + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(this.output); gain.connect(this.send);
    oscillator.start(at); oscillator.stop(at + duration + .015);
    oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
  }

  hiss(duration, frequency, end, volume, type = 'lowpass', delay = 0) {
    const context = this.context, at = context.currentTime + delay;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise;
    filter.type = type; filter.Q.value = .7;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), at + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(gain); gain.connect(this.output); gain.connect(this.send);
    source.start(at, 0, duration + .02);
    source.onended = () => {source.disconnect(); filter.disconnect(); gain.disconnect();};
  }

  play(type, strength = 1) {
    if (!this.context || this.context.state !== 'running' || this.muted) return;
    const now = this.context.currentTime;
    const spacing = type === 'step' ? .14 : type === 'stone' ? .075 : .035;
    if (now - (this.last.get(type) ?? -Infinity) < spacing) return;
    this.last.set(type, now);
    const volume = Math.min(1, Math.max(0, strength));
    if (type === 'guard') {
      this.tone(325, 178, .13, .17 * volume, 'triangle');
      this.tone(795, 590, .10, .06 * volume, 'triangle');
      this.hiss(.075, 3600, 800, .22 * volume);
    } else if (type === 'parry') {
      for (const [i, frequency] of [640, 1430, 2170, 3280].entries())
        this.tone(frequency, frequency * .97, .27 + i * .07, volume * .11 / (i + 1), 'triangle');
      this.hiss(.09, 5800, 1800, .16 * volume, 'highpass');
    } else if (type === 'hit') {
      this.tone(125, 38, .18, .19 * volume, 'triangle');
      this.hiss(.19, 2400, 230, .31 * volume);
    } else if (type === 'hurt') {
      this.tone(95, 28, .27, .24 * volume);
      this.hiss(.24, 1800, 160, .32 * volume);
    } else if (type === 'thrust') {
      this.hiss(.095, 1300, 3900, .20 * volume, 'bandpass');
      this.hiss(.065, 3200, 750, .12 * volume, 'bandpass', .055);
    } else if (type === 'dodge') {
      this.hiss(.19, 1200, 380, .20 * volume, 'bandpass');
      this.hiss(.11, 850, 180, .12 * volume, 'lowpass', .10);
    } else if (type === 'slash') {
      this.hiss(.21, 3400, 360, .23 * volume, 'bandpass');
    } else if (type === 'stone') {
      this.tone(72, 25, .46, .30 * volume);
      this.hiss(.55, 1800, 100, .45 * volume);
      this.hiss(.19, 3200, 1400, .16 * volume, 'bandpass', .08);
    } else if (type === 'holy') {
      this.hiss(.65, 1700, 5000, .14 * volume, 'bandpass');
      for (const [i, frequency] of [523, 784, 1047, 1568].entries())
        this.tone(frequency, frequency * 1.003, .7, .06 * volume / (i + 1), 'sine', i * .035);
    } else if (type === 'step') {
      this.hiss(.11, 1100, 240, .12 * volume);
      this.tone(65, 38, .08, .07 * volume);
    } else if (type === 'drink') {
      this.hiss(.13, 650, 1900, .07 * volume, 'bandpass');
      this.tone(340, 220, .12, .03 * volume, 'sine', .15);
    } else if (type === 'death') {
      this.tone(90, 24, 1.3, .18 * volume);
      this.hiss(.9, 1100, 100, .18 * volume);
    }
  }
}
