// All sound is synthesized with WebAudio — no audio files.
// initAudio() must be called from a user gesture (browser autoplay policy).

let ac: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
let muted = localStorage.getItem('nova-muted') === '1';

export function isMuted() { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem('nova-muted', muted ? '1' : '0');
  if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.02);
  return muted;
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
  startMusic();
  // silence completely when the tab is hidden — no ghost soundtrack
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend();
    else ac.resume();
  });
}

// fade the soundtrack down (victory/defeat screen)
export function duckMusic() {
  if (ac && musicBus) musicBus.gain.setTargetAtTime(0.05, ac.currentTime, 1.2);
}

// ---------------- sound effects ----------------

type SfxName = 'shot' | 'shotHeavy' | 'explosion' | 'place' | 'ready' | 'click'
             | 'error' | 'cash' | 'research' | 'upgrade' | 'siren' | 'alert';

const lastPlayed: Record<string, number> = {};
const MIN_GAP: Partial<Record<SfxName, number>> = {
  shot: 0.06, shotHeavy: 0.12, explosion: 0.12, cash: 0.25, click: 0.03,
};

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode) {
  const o = ac!.createOscillator();
  const g = ac!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, peak, 0.005, dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(t: number, dur: number, peak: number, filterFrom: number, filterTo: number) {
  if (!noiseBuf) {
    noiseBuf = ac!.createBuffer(1, ac!.sampleRate, ac!.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac!.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFrom, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t + dur);
  const g = ac!.createGain();
  env(g, t, peak, 0.005, dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t); src.stop(t + dur + 0.05);
}

export function sfx(name: SfxName) {
  if (!ac || muted) return;
  const now = ac.currentTime;
  const gap = MIN_GAP[name] ?? 0.08;
  if (now - (lastPlayed[name] ?? -9) < gap) return;
  lastPlayed[name] = now;
  const t = now;
  switch (name) {
    case 'shot': {
      // rifle crack: sharp noise snap + zap, slight pitch variation per shot
      const v = 1 + (Math.random() - 0.5) * 0.3;
      noise(t, 0.05, 0.14, 5200 * v, 900);
      osc('square', 620 * v, 110, t, 0.08, 0.09, sfxBus);
      osc('sine', 190 * v, 70, t, 0.09, 0.10, sfxBus);   // body thump
      break;
    }
    case 'shotHeavy':
      // cannon: muzzle crack, pressure boom, sub-bass kick
      noise(t, 0.05, 0.20, 6000, 1500);
      noise(t + 0.01, 0.35, 0.22, 1100, 90);
      osc('sawtooth', 240, 40, t, 0.3, 0.14, sfxBus);
      osc('sine', 85, 28, t, 0.42, 0.34, sfxBus);
      break;
    case 'explosion': {
      // deep blast with rumble tail and debris crackle
      osc('sine', 68, 22, t, 0.8, 0.45, sfxBus);
      noise(t, 0.12, 0.30, 4500, 800);
      noise(t + 0.02, 0.9, 0.34, 750, 45);
      for (let k = 0; k < 5; k++) {
        noise(t + 0.08 + Math.random() * 0.45, 0.04, 0.10, 3000 + Math.random() * 2500, 600);
      }
      break;
    }
    case 'place':
      osc('sine', 150, 60, t, 0.16, 0.28, sfxBus);
      noise(t, 0.08, 0.10, 3000, 500);
      break;
    case 'ready':
      osc('sine', 660, 660, t, 0.09, 0.12, sfxBus);
      osc('sine', 880, 880, t + 0.1, 0.16, 0.12, sfxBus);
      break;
    case 'click':
      osc('square', 1400, 1000, t, 0.03, 0.05, sfxBus);
      break;
    case 'error':
      osc('square', 170, 140, t, 0.16, 0.10, sfxBus);
      break;
    case 'cash':
      osc('sine', 1150, 1150, t, 0.05, 0.08, sfxBus);
      osc('sine', 1550, 1550, t + 0.06, 0.08, 0.08, sfxBus);
      break;
    case 'research':
      osc('sine', 420, 1250, t, 0.4, 0.10, sfxBus);
      osc('sine', 630, 1870, t + 0.05, 0.4, 0.06, sfxBus);
      break;
    case 'upgrade':
      osc('triangle', 520, 520, t, 0.08, 0.12, sfxBus);
      osc('triangle', 660, 660, t + 0.09, 0.08, 0.12, sfxBus);
      osc('triangle', 780, 780, t + 0.18, 0.2, 0.12, sfxBus);
      break;
    case 'siren': {
      // rising-then-falling air-raid klaxon — an orbital strike is inbound
      for (let k = 0; k < 3; k++) {
        const st = t + k * 0.42;
        osc('sawtooth', 300, 620, st, 0.22, 0.16, sfxBus);
        osc('sawtooth', 620, 300, st + 0.22, 0.22, 0.16, sfxBus);
      }
      break;
    }
    case 'alert': {
      // two urgent low blips — the base is under attack
      osc('square', 440, 440, t, 0.12, 0.13, sfxBus);
      osc('square', 440, 440, t + 0.18, 0.12, 0.13, sfxBus);
      break;
    }
  }
}

// ---------------- generative ambient music ----------------
// A slow synth loop: low drone, evolving pad chords, sparse echoing plucks.

const CHORDS = [
  [110.0, 220.0, 261.6, 329.6],  // Am
  [87.3, 174.6, 220.0, 261.6],   // F
  [98.0, 196.0, 246.9, 293.7],   // G
  [82.4, 164.8, 220.0, 246.9],   // Em-ish
];
const PLUCK_SCALE = [440, 523.3, 587.3, 659.3, 784, 880]; // A minor-ish

let musicTimer: number | null = null;

function startMusic() {
  if (!ac || musicTimer !== null) return;

  // constant drone with a slowly breathing filter
  const droneFilter = ac.createBiquadFilter();
  droneFilter.type = 'lowpass'; droneFilter.frequency.value = 220; droneFilter.Q.value = 2;
  const droneGain = ac.createGain(); droneGain.gain.value = 0.16;
  droneFilter.connect(droneGain); droneGain.connect(musicBus);
  for (const [f, detune] of [[55, -4], [55, 4], [110, 0]] as const) {
    const o = ac.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = detune;
    o.connect(droneFilter); o.start();
  }
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.05; lfoGain.gain.value = 140;
  lfo.connect(lfoGain); lfoGain.connect(droneFilter.frequency); lfo.start();

  // echo bus for plucks
  const delay = ac.createDelay(1); delay.delayTime.value = 0.42;
  const fb = ac.createGain(); fb.gain.value = 0.38;
  delay.connect(fb); fb.connect(delay);
  const wet = ac.createGain(); wet.gain.value = 0.5;
  delay.connect(wet); wet.connect(musicBus);

  const BEAT = 0.62; // ~97bpm half-time feel
  let nextBar = ac.currentTime + 0.1;
  let chordIdx = 0;

  const schedule = () => {
    if (!ac) return;
    while (nextBar < ac.currentTime + 1.2) {
      const t = nextBar;
      // pad chord: swells over 4 beats, every 2 bars
      if (chordIdx % 2 === 0) {
        const chord = CHORDS[(chordIdx / 2) % CHORDS.length | 0];
        for (const f of chord) {
          const o = ac.createOscillator();
          o.type = 'triangle'; o.frequency.value = f;
          o.detune.value = (Math.random() - 0.5) * 10;
          const g = ac.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.05, t + BEAT * 3);
          g.gain.linearRampToValueAtTime(0, t + BEAT * 8.2);
          o.connect(g); g.connect(musicBus);
          o.start(t); o.stop(t + BEAT * 8.5);
        }
      }
      // sparse plucks on the off-beats
      for (let b = 0; b < 4; b++) {
        if (Math.random() < 0.4) {
          const f = PLUCK_SCALE[Math.floor(Math.random() * PLUCK_SCALE.length)];
          const o = ac.createOscillator();
          o.type = 'sine'; o.frequency.value = f;
          const g = ac.createGain();
          env(g, t + b * BEAT, 0.06, 0.01, 0.5);
          o.connect(g); g.connect(musicBus); g.connect(delay);
          o.start(t + b * BEAT); o.stop(t + b * BEAT + 0.6);
        }
      }
      nextBar += BEAT * 4;
      chordIdx++;
    }
  };
  schedule();
  musicTimer = window.setInterval(schedule, 400);
}
