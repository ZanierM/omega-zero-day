// All sound is synthesized with WebAudio — no audio files.
// initAudio() must be called from a user gesture (browser autoplay policy).

let ac: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
// battlefield chain: every positioned sound → compressor (so a big fight doesn't clip),
// plus a send into an outdoor echo that grows with distance
let fieldBus: GainNode, verbSend: GainNode;
let muted = false;
try { muted = localStorage.getItem('nova-muted') === '1'; } catch { /* storage may be unavailable */ }

export function isMuted() { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('nova-muted', muted ? '1' : '0'); } catch { /* storage may be unavailable */ }
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
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
  comp.connect(master);
  fieldBus = ac.createGain(); fieldBus.gain.value = 0.7; fieldBus.connect(comp);
  const verb = ac.createConvolver(); verb.buffer = outdoorEcho(ac);
  const verbReturn = ac.createGain(); verbReturn.gain.value = 0.42;
  verbSend = ac.createGain(); verbSend.gain.value = 1;
  verbSend.connect(verb); verb.connect(verbReturn); verbReturn.connect(comp);
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

// interface and alert sounds (not positioned); battle sounds are sfxAt() below
type SfxName = 'place' | 'ready' | 'click'
             | 'error' | 'cash' | 'research' | 'upgrade' | 'siren' | 'alert';

const lastPlayed: Record<string, number> = {};
const MIN_GAP: Partial<Record<SfxName, number>> = {
  cash: 0.25, click: 0.03,
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
function noise(t: number, dur: number, peak: number, filterFrom: number, filterTo: number, dest: AudioNode = sfxBus, type: BiquadFilterType = 'lowpass', q = 0.7) {
  if (!noiseBuf) {
    noiseBuf = ac!.createBuffer(1, ac!.sampleRate, ac!.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac!.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(filterFrom, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t + dur);
  const g = ac!.createGain();
  env(g, t, peak, 0.005, dur);
  src.connect(f); f.connect(g); g.connect(dest);
  // start at a random point so repeated shots never share the same grain
  src.start(t, Math.random() * 0.9); src.stop(t + dur + 0.05);
}

// generated impulse response: a few hard early reflections off rock, then a
// long dark diffuse tail — an open canyon rather than a room
function outdoorEcho(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 2.4);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / c.sampleRate;
      lp += ((Math.random() * 2 - 1) - lp) * (0.18 - 0.12 * Math.min(1, tt / 2));   // darker as it decays
      d[i] = lp * Math.pow(1 - i / len, 3.2) * 0.9;
    }
    for (const [at, amp] of [[0.045, 0.7], [0.11, 0.45], [0.19, 0.3], [0.33, 0.22]]) {
      const i0 = Math.floor((at + ch * 0.007 + Math.random() * 0.01) * c.sampleRate);
      for (let k = 0; k < 300 && i0 + k < len; k++) d[i0 + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / 60);
    }
  }
  return buf;
}

export function sfx(name: SfxName) {
  if (!ac || muted) return;
  const now = ac.currentTime;
  const gap = MIN_GAP[name] ?? 0.08;
  if (now - (lastPlayed[name] ?? -9) < gap) return;
  lastPlayed[name] = now;
  const t = now;
  switch (name) {
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

// ---------------- battlefield sounds (positioned) ----------------
// Weapons, hits and explosions play from where they happen: panned across the
// screen, quieter and duller with distance, with more echo the further off.

export type FieldSound =
  | 'rifle' | 'autocannon' | 'flame' | 'rocket' | 'cannon' | 'artillery' | 'sniper' | 'rail' | 'arc'
  | 'hitMetal' | 'hitStructure' | 'hitSoft' | 'impact' | 'explodeVehicle' | 'explodeBuilding' | 'orbital'
  | 'bite' | 'spit' | 'squelch' | 'lance' | 'arrive'
  | 'musket' | 'oldmg' | 'harpoon' | 'firebomb' | 'smash' | 'oldcannon' | 'mortar' | 'snare';   // the Clans: old powder, springs and glass

let lx = 0, ly = 0, lHalf = 600;
/** Where the player is "standing": the camera centre and half the visible width, in world px. */
export function setListener(x: number, y: number, halfWidth: number) { lx = x; ly = y; lHalf = Math.max(200, halfWidth); }

// same sound from the same spot can't stack faster than this (s)
const FIELD_GAP: Partial<Record<FieldSound, number>> = {
  rifle: 0.045, autocannon: 0.05, flame: 0.12, rocket: 0.08, cannon: 0.1, artillery: 0.15, sniper: 0.1, rail: 0.15, arc: 0.08,
  hitMetal: 0.06, hitStructure: 0.09, hitSoft: 0.07, impact: 0.07, explodeVehicle: 0.1, explodeBuilding: 0.2, orbital: 0.5,
  bite: 0.05, spit: 0.09, squelch: 0.08, lance: 0.07, arrive: 0.3,
  musket: 0.06, oldmg: 0.12, harpoon: 0.1, firebomb: 0.1, smash: 0.08, oldcannon: 0.15, mortar: 0.15, snare: 0.1,
};
// how long each sound's own voice lasts (the echo tail rides the shared bus)
const FIELD_LEN: Partial<Record<FieldSound, number>> = {
  rifle: 0.12, autocannon: 0.2, flame: 0.35, rocket: 0.6, cannon: 0.65, artillery: 1, sniper: 0.22, rail: 0.75, arc: 0.25,
  hitMetal: 0.32, hitStructure: 0.45, hitSoft: 0.1, impact: 1.1, explodeVehicle: 1.9, explodeBuilding: 3, orbital: 3.2,
  bite: 0.14, spit: 0.4, squelch: 0.7, lance: 0.45, arrive: 1.6,
  musket: 0.35, oldmg: 0.32, harpoon: 0.45, firebomb: 0.3, smash: 0.8, oldcannon: 1.1, mortar: 0.6, snare: 0.3,
};
const fieldLast = new Map<string, number>();
let liveVoices = 0;
const MAX_VOICES = 36;

function place(x: number, y: number, loud: number, len: number): { dest: AudioNode, t: number, v: number } | null {
  if (!ac || muted || ac.state !== 'running') return null;
  const d = Math.hypot(x - lx, y - ly) / lHalf;       // 1 = edge of the screen
  if (d > 3.2) return null;                            // too far off to hear
  const gain = loud / (1 + (d * 1.05) ** 2);
  if (gain < 0.03 || liveVoices >= MAX_VOICES) return null;
  const t = ac.currentTime + Math.min(0.12, d * 0.035); // a hint of sound travel time
  const g = ac.createGain(); g.gain.value = gain;
  const pan = ac.createStereoPanner(); pan.pan.value = Math.max(-0.85, Math.min(0.85, (x - lx) / lHalf * 0.8));
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 17000 / (1 + d * 1.6); // air eats the highs
  const send = ac.createGain(); send.gain.value = 0.12 + 0.3 * Math.min(1, d / 2);
  g.connect(lp); lp.connect(pan); pan.connect(fieldBus); pan.connect(send); send.connect(verbSend);
  liveVoices++;
  setTimeout(() => { liveVoices--; try { g.disconnect(); } catch { /* already gone */ } }, (len + 0.15) * 1000 + (t - ac.currentTime) * 1000);
  return { dest: g, t, v: 1 + (Math.random() - 0.5) * 0.16 };   // v: per-shot pitch variation
}

const ring = (dest: AudioNode, t: number, f: number, dur: number, peak: number) => {
  // inharmonic partials: struck metal rather than a musical tone
  for (const [m, a] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.18]]) osc('sine', f * m, f * m * 0.985, t, dur / m ** 0.4, peak * a, dest);
};

// blasts drive a soft clipper: it rounds the peak into a fat, compressed whump instead of a clean synth thud
let satCurve: Float32Array<ArrayBuffer> | null = null;
function sat(dest: AudioNode, drive = 2.5): AudioNode {
  if (!satCurve) { satCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; satCurve[i] = Math.tanh(x * drive) / Math.tanh(drive); } }
  const w = ac!.createWaveShaper(); w.curve = satCurve; w.oversample = '2x'; w.connect(dest);
  return w;
}
// things coming back down after a blast: n short bursts scattered over [t0, t1], fading as they go
function debris(o: AudioNode, t0: number, t1: number, n: number, peak: number, lo: number, hi: number, q = 2) {
  for (let k = 0; k < n; k++) {
    const at = t0 + (t1 - t0) * Math.pow(Math.random(), 0.7), f = lo + Math.random() * (hi - lo);
    noise(at, 0.02 + Math.random() * 0.04, peak * (1 - (at - t0) / (t1 - t0 + 0.01)) * (0.5 + Math.random() * 0.5), f, f * 0.7, o, 'bandpass', q);
  }
}

/** Dev readout: how many positioned sounds are playing right now. */
export function audioStats() { return { state: ac?.state ?? 'none', liveVoices, played: fieldPlayed }; }
let fieldPlayed = 0;

export function sfxAt(name: FieldSound, x: number, y: number, loud = 1) {
  if (!ac || muted) return;
  const key = `${name}:${Math.round(x / 256)},${Math.round(y / 256)}`;
  const now = ac.currentTime;
  if (now - (fieldLast.get(key) ?? -9) < (FIELD_GAP[name] ?? 0.08)) return;
  fieldLast.set(key, now);
  if (fieldLast.size > 400) fieldLast.clear();
  const p = place(x, y, loud, FIELD_LEN[name] ?? 0.5);
  if (!p) return;
  const { dest: o, t, v } = p;
  fieldPlayed++;
  switch (name) {
    case 'rifle':       // coilgun crack: supersonic snap, a metallic coil zing, a little chest thump
      noise(t, 0.035, 0.5, 9000 * v, 2500, o, 'highpass');
      noise(t, 0.09, 0.18, 2600 * v, 1800, o, 'bandpass', 6);
      osc('sine', 150 * v, 55, t, 0.07, 0.22, o);
      break;
    case 'autocannon':  // heavier vehicle gun: lower crack, punchier body, brass-like ring
      noise(t, 0.04, 0.45, 6000 * v, 1400, o, 'highpass');
      noise(t, 0.16, 0.3, 1400 * v, 260, o);
      osc('sine', 110 * v, 40, t, 0.12, 0.34, o);
      ring(o, t + 0.02, 1900 * v, 0.08, 0.03);
      break;
    case 'flame':       // pressurised roar with crackle
      noise(t, 0.32, 0.32, 1300 * v, 500, o, 'bandpass', 0.8);
      noise(t, 0.3, 0.18, 300, 120, o);
      for (let k = 0; k < 4; k++) noise(t + Math.random() * 0.25, 0.018, 0.14, 5000, 2000, o, 'highpass');
      break;
    case 'rocket': {    // ignition pop, then a rising whoosh as it leaves
      noise(t, 0.04, 0.4, 3000, 600, o);
      const src = ac.createBufferSource(); src.buffer = noiseBuf!; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(700 * v, t); bp.frequency.exponentialRampToValueAtTime(3200 * v, t + 0.45);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.36, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      src.connect(bp); bp.connect(g); g.connect(o); src.start(t, Math.random()); src.stop(t + 0.6);
      break;
    }
    case 'cannon':      // tank gun: sharp report, pressure boom, sub kick, metal breech clank
      noise(t, 0.05, 0.6, 7000 * v, 1600, o, 'highpass');
      noise(t + 0.005, 0.55, 0.55, 1100 * v, 70, o);
      osc('sine', 75 * v, 28, t, 0.6, 0.6, o);
      ring(o, t + 0.35, 420 * v, 0.12, 0.04);
      break;
    case 'artillery':   // the long gun: deeper, slower, more air
      noise(t, 0.06, 0.55, 5000 * v, 1000, o, 'highpass');
      noise(t + 0.01, 0.9, 0.62, 800 * v, 45, o);
      osc('sine', 55 * v, 22, t, 0.95, 0.7, o);
      break;
    case 'sniper':      // a single very hard crack that rolls around the canyon
      noise(t, 0.025, 0.7, 11000, 4000, o, 'highpass');
      noise(t + 0.004, 0.2, 0.25, 1800, 300, o);
      osc('sine', 130, 50, t, 0.1, 0.25, o);
      break;
    case 'rail':        // capacitor whine, then the slug breaking the air
      osc('sawtooth', 700 * v, 4200 * v, t, 0.14, 0.05, o);
      noise(t + 0.13, 0.05, 0.65, 9000, 2500, o, 'highpass');
      noise(t + 0.14, 0.6, 0.5, 1200, 60, o);
      osc('sine', 70, 26, t + 0.13, 0.55, 0.55, o);
      break;
    case 'arc':         // electric discharge: buzzing crackle
      osc('sawtooth', 95 * v, 70, t, 0.2, 0.12, o);
      osc('square', 190 * v, 150, t, 0.16, 0.05, o);
      for (let k = 0; k < 6; k++) noise(t + k * 0.03 + Math.random() * 0.02, 0.012, 0.22, 7000, 3000, o, 'highpass');
      break;
    case 'hitMetal': {  // a round on armour: a hard spang, a short inharmonic ring, sparks; now and then a ricochet whines off
      noise(t, 0.006, 0.5, 9000, 5000, o, 'highpass');
      noise(t, 0.03, 0.18, 3200 * v, 2200, o, 'bandpass', 3);
      ring(o, t, (1500 + Math.random() * 1700) * v, 0.1, 0.03);
      debris(o, t + 0.01, t + 0.09, 3, 0.06, 4000, 8000, 3);                               // sparks
      if (Math.random() < 0.28) {
        const f0 = (3200 + Math.random() * 1600) * v;
        osc('sine', f0, f0 * 0.38, t + 0.012, 0.24, 0.022, o);                             // the whine of a ricochet
        noise(t + 0.012, 0.22, 0.05, f0, f0 * 0.4, o, 'bandpass', 14);
      }
      break;
    }
    case 'hitStructure': // a hit on concrete and composite: a dull thwack, then grit crumbling and a hiss of dust
      noise(t, 0.012, 0.36, 2600 * v, 1600, o, 'bandpass', 1);
      noise(t + 0.004, 0.13, 0.26, 900 * v, 220, o);
      debris(o, t + 0.02, t + 0.3, 6, 0.08, 1400, 3600, 2.5);
      noise(t + 0.03, 0.35, 0.035, 5000, 3000, o, 'highpass');
      break;
    case 'hitSoft':     // a hit on a body: a muffled thud and a slap, nothing tonal
      noise(t, 0.05, 0.3, 300 * v, 160, o, 'bandpass', 1.4);
      noise(t, 0.012, 0.12, 1300 * v, 900, o, 'bandpass', 2);
      break;
    case 'impact': {    // a shell or rocket landing: a crack, a whump of earth, then dirt patters back down and the ground rolls
      const s1 = sat(o, 2);
      noise(t, 0.03, 0.5, 6000 * v, 2500, s1, 'highpass');
      noise(t + 0.006, 0.36, 0.6, 1300 * v, 110, s1);
      osc('sine', 72 * v, 30, t, 0.42, 0.5, s1);
      debris(o, t + 0.12, t + 0.9, 9, 0.1, 700, 2600, 1.8);
      noise(t + 0.15, 0.8, 0.14, 320, 70, o);
      break;
    }
    case 'explodeVehicle': { // fuel and ammunition going up: a crack, a fireball, cook-offs, metal raining down, fire
      const s1 = sat(o, 3);
      noise(t, 0.025, 0.7, 7000, 3500, s1, 'highpass');                                     // the supersonic crack
      noise(t + 0.008, 0.62, 0.72, 2400 * v, 85, s1);                                       // the fireball whump
      osc('sine', 56 * v, 24, t, 0.95, 0.8, s1);
      for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {                       // secondary cook-offs
        const at = t + 0.2 + Math.random() * 0.55;
        noise(at, 0.012, 0.3, 6000, 3000, o, 'highpass');
        noise(at + 0.005, 0.14, 0.32, 900, 120, s1);
      }
      for (let k = 0; k < 5; k++) ring(o, t + 0.3 + Math.random() * 1.1, 260 + Math.random() * 900, 0.12, 0.018);   // falling metal
      debris(o, t + 0.25, t + 1.4, 10, 0.08, 1500, 4500, 2);
      debris(o, t + 0.4, t + 1.7, 12, 0.03, 4000, 9000, 3);                                // the fire crackling
      noise(t + 0.25, 1.45, 0.2, 280, 55, o);                                               // the rolling tail
      break;
    }
    case 'explodeBuilding': { // staggered blasts, a collapse that rumbles in swells, concrete and glass coming down, dust settling
      const s1 = sat(o, 3.2);
      for (let k = 0; k < 3; k++) {
        const st = t + k * (0.12 + Math.random() * 0.16);
        noise(st, 0.03, 0.55, 6000, 2500, s1, 'highpass');
        noise(st + 0.01, 0.8, 0.55, 1600, 50, s1);
      }
      osc('sine', 46, 17, t, 2, 0.8, s1);
      for (const [d, a] of [[0.45, 0.32], [0.9, 0.26], [1.35, 0.2]]) noise(t + d, 0.95, a, 420, 70, o);   // the collapse, in swells
      debris(o, t + 0.5, t + 2.5, 16, 0.12, 380, 1600, 1.6);                               // concrete chunks
      for (let k = 0; k < 3; k++) ring(o, t + 0.6 + Math.random() * 1.4, 140 + Math.random() * 260, 0.25, 0.02);   // beams
      for (let k = 0; k < 5; k++) ring(o, t + 0.25 + Math.random() * 0.6, 3000 + Math.random() * 3500, 0.06, 0.012); // glass
      noise(t + 0.6, 2.2, 0.045, 3200, 2000, o, 'highpass');                                // dust settling
      break;
    }
    case 'bite':        // the brood: a wet crunch and a click of mandibles
      noise(t, 0.05, 0.35, 1400 * v, 300, o, 'bandpass', 2);
      noise(t + 0.02, 0.03, 0.25, 6000, 2500, o, 'highpass');
      osc('sine', 180 * v, 70, t, 0.07, 0.2, o);
      break;
    case 'spit': {      // a throat-sac gurgle, then the hiss of the acid leaving
      osc('sawtooth', 120 * v, 60, t, 0.14, 0.08, o);
      noise(t, 0.12, 0.3, 700 * v, 250, o, 'bandpass', 3);
      noise(t + 0.1, 0.25, 0.28, 3000 * v, 6000, o, 'bandpass', 1.2);
      break;
    }
    case 'squelch':     // something of the brood bursting, and a thin dying screech
      noise(t, 0.2, 0.5, 900 * v, 120, o);
      noise(t + 0.02, 0.06, 0.3, 4000, 1500, o, 'bandpass', 3);
      osc('sawtooth', 1400 * v, 380, t + 0.04, 0.4, 0.05, o);
      osc('sine', 90 * v, 30, t, 0.3, 0.3, o);
      break;
    case 'lance': {     // Keeper light: a bright shimmering tone with a glassy edge, no gunpowder in it
      const f = 880 * v;
      osc('sine', f * 2, f, t, 0.22, 0.08, o);
      osc('triangle', f * 1.5, f * 1.49, t, 0.3, 0.05, o);
      noise(t, 0.08, 0.18, 9000, 4000, o, 'highpass');
      ring(o, t + 0.01, 2400 * v, 0.25, 0.02);
      break;
    }
    case 'arrive':      // something arriving down a column of light: a rising open chord
      for (const [m, d] of [[1, 0], [1.5, 0.08], [2, 0.16], [3, 0.24]]) osc('sine', 330 * m, 330 * m * 1.01, t + d, 1.2, 0.06, o);
      noise(t, 1.1, 0.12, 3000, 9000, o, 'bandpass', 0.8);
      break;
    case 'musket':      // an old powder rifle: a fat boom, not a snap, and a little smoke hiss after
      noise(t, 0.05, 0.5, 4200 * v, 900, o);
      noise(t + 0.01, 0.28, 0.32, 900 * v, 120, o);
      osc('sine', 95 * v, 38, t, 0.14, 0.3, o);
      noise(t + 0.08, 0.22, 0.05, 6000, 3000, o, 'highpass');
      break;
    case 'oldmg':       // a worn machine gun: three uneven, rattling rounds
      for (let k = 0; k < 3; k++) {
        const st = t + k * (0.085 + Math.random() * 0.02);
        noise(st, 0.03, 0.42, 5000 * v, 1200, o);
        osc('sine', 120 * v, 48, st, 0.06, 0.22, o);
        noise(st + 0.02, 0.03, 0.08, 3000, 1500, o, 'bandpass', 4);   // the loose bolt
      }
      break;
    case 'harpoon':     // a spring-gun: a deep twang, the line paying out
      osc('triangle', 210 * v, 140 * v, t, 0.25, 0.22, o);
      osc('sine', 420 * v, 300 * v, t, 0.12, 0.08, o);
      noise(t + 0.02, 0.4, 0.16, 2400, 900, o, 'bandpass', 3);
      noise(t, 0.04, 0.25, 3000, 800, o);
      break;
    case 'firebomb':    // a bottle thrown: a soft swish
      noise(t, 0.25, 0.12, 1200, 3000, o, 'bandpass', 1.5);
      break;
    case 'smash':       // the bottle lands: glass, then the whoomp of spirit catching
      for (let k = 0; k < 5; k++) ring(o, t + Math.random() * 0.05, (2500 + Math.random() * 3000) * v, 0.08, 0.025);
      noise(t, 0.03, 0.3, 9000, 4000, o, 'highpass');
      noise(t + 0.04, 0.5, 0.38, 600, 150, o);
      for (let k = 0; k < 5; k++) noise(t + 0.15 + Math.random() * 0.5, 0.02, 0.12, 5000, 2000, o, 'highpass');   // crackle
      break;
    case 'oldcannon':   // a cast barrel and black powder: a huge flat boom and a long smoky roll
      noise(t, 0.07, 0.6, 3800 * v, 700, o);
      noise(t + 0.01, 1, 0.6, 700 * v, 35, o);
      osc('sine', 60 * v, 22, t, 0.9, 0.65, o);
      noise(t + 0.3, 0.7, 0.12, 500, 100, o);
      break;
    case 'mortar':      // the tube coughs: a hollow thoonk
      osc('sine', 180 * v, 70, t, 0.18, 0.5, o);
      noise(t, 0.06, 0.4, 2200 * v, 300, o);
      noise(t + 0.02, 0.4, 0.2, 500, 60, o);
      break;
    case 'snare':       // a spring trap: a snap of steel and a scrape
      noise(t, 0.012, 0.5, 9000, 4000, o, 'highpass');
      ring(o, t, 1400 * v, 0.2, 0.06);
      noise(t + 0.03, 0.2, 0.14, 2500, 800, o, 'bandpass', 3);
      break;
    case 'orbital':     // the sky tears: a descending shriek, then a blast that shakes everything
      osc('sawtooth', 2400, 300, t, 0.5, 0.06, o);
      noise(t + 0.45, 0.12, 0.8, 7000, 1200, o);
      noise(t + 0.47, 2.6, 0.8, 700, 25, o);
      osc('sine', 40, 14, t + 0.45, 2.4, 0.9, o);
      for (let k = 0; k < 10; k++) noise(t + 0.8 + Math.random() * 2, 0.04, 0.12, 3000, 600, o);
      break;
  }
}

// ---------------- unit voices ----------------
// A short acknowledgement when you select your units or give them an order. No
// recordings: a sawtooth "throat" through two vowel formants makes something
// that reads as speech at a distance, and each faction gets its own colour.

export type VoiceKind = 'select' | 'order' | 'attack';
const VOWELS: [number, number][] = [[800, 1200], [450, 2000], [450, 800], [330, 700], [300, 2300], [600, 1000]];
let lastVoice = -9;

// one spoken syllable: pitch glides over it, the vowel is shaped by two band-passes
function syllable(dest: AudioNode, t: number, dur: number, f0: number, f1: number, vowel: [number, number], peak: number, wave: OscillatorType) {
  const o = ac!.createOscillator(); o.type = wave;
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = ac!.createGain(); env(g, t, peak, 0.012, dur);
  for (const [i, f] of vowel.entries()) {
    const bp = ac!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6 + i * 4;
    const fg = ac!.createGain(); fg.gain.value = i ? 0.55 : 1;
    o.connect(bp); bp.connect(fg); fg.connect(g);
  }
  g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
// a radio: a band-limited channel with a squelch click at each end
function radio(t: number, len: number): AudioNode {
  const hp = ac!.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
  const lp = ac!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900;
  hp.connect(lp); lp.connect(sfxBus);
  noise(t, 0.035, 0.07, 6000, 3000, sfxBus, 'highpass');
  noise(t + len + 0.02, 0.05, 0.06, 5000, 2500, sfxBus, 'highpass');
  return hp;
}

/** A unit bark: `faction` is the speaker's faction id, `heavy` deepens it (vehicles, big walkers). */
export function voice(kind: VoiceKind, faction: string, heavy = false) {
  if (!ac || muted || ac.state !== 'running') return;
  const now = ac.currentTime;
  if (now - lastVoice < 0.45) return;          // a group order is one voice, not twenty
  lastVoice = now;
  const t = now + 0.02, r = () => VOWELS[Math.floor(Math.random() * VOWELS.length)];
  const up = kind === 'select';                // a question lifts at the end; an order falls
  const n = kind === 'attack' ? 2 : 2 + Math.floor(Math.random() * 2);
  if (faction === 'helion' || faction === 'kessler') {
    const base = (faction === 'kessler' ? 92 : 128) * (heavy ? 0.8 : 1), dest = radio(t, n * 0.09);
    const wave: OscillatorType = faction === 'kessler' ? 'square' : 'sawtooth';
    for (let k = 0; k < n; k++) {
      const last = k === n - 1, f = base * (1 + (Math.random() - 0.5) * 0.12);
      syllable(dest, t + k * 0.09, 0.08, f, last ? f * (up ? 1.25 : 0.82) : f, r(), faction === 'kessler' ? 0.09 : 0.12, wave);
    }
  } else if (faction === 'ashen' || faction === 'hearth') {
    // a shout across open ground: louder, breathier, no radio
    const base = (heavy ? 120 : 165) * (kind === 'attack' ? 1.15 : 1);
    noise(t, 0.12, 0.05, 1800, 900, sfxBus, 'bandpass', 1.2);
    for (let k = 0; k < Math.min(n, 2); k++) syllable(sfxBus, t + k * 0.11, 0.1, base, base * (up ? 1.2 : 0.75), r(), 0.16, 'sawtooth');
  } else if (faction === 'brood') {
    // chittering clicks and a wet hiss
    for (let k = 0; k < 5 + n; k++) noise(t + k * 0.035 + Math.random() * 0.01, 0.012, 0.16, (heavy ? 1800 : 3200) * (0.8 + Math.random() * 0.4), 1500, sfxBus, 'bandpass', 8);
    noise(t + 0.05, kind === 'attack' ? 0.3 : 0.18, 0.06, 5000, 2000, sfxBus, 'highpass');
  } else if (faction === 'keepers') {
    // a slow harmonic hum, rising for a question
    const root = heavy ? 110 : 165;
    for (const m of [1, 1.5, 2]) osc('sine', root * m, root * m * (up ? 1.06 : 0.97), t, 0.45, 0.05, sfxBus);
    noise(t, 0.4, 0.03, 6000, 9000, sfxBus, 'bandpass', 2);
  } else {
    // the Hollow: crystal chimes over a breath
    const root = heavy ? 520 : 780;
    for (let k = 0; k < n; k++) for (const [m, a] of [[1, 0.06], [2.76, 0.03], [5.4, 0.015]]) osc('sine', root * m * (1 + k * 0.12), root * m * (1 + k * 0.12) * (up ? 1.03 : 0.99), t + k * 0.08, 0.3, a, sfxBus);
    noise(t, 0.25, 0.04, 1200, 600, sfxBus, 'bandpass', 1.5);
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
