// The Vey brood: crystal grown through flesh. Everything here is soft, curved
// and lit from inside — no rivets or straight edges — so it reads as alive
// next to the machined human factions. Bodies are built on the creature rig
// (rig.ts): overlapping chitin shell segments over wet flesh, jointed legs
// that walk in a tripod gait, crystal pushing out through the back. Same
// conventions as art.ts; this module adds itself to art.ts's registries.

import { VEHICLE_ART, BUILDING_ART } from './art';
import { rotP, glowAt, shadow, drawRig, stride } from './rig';
import type { Ctx, Tone, V3, Part } from './rig';

const FLESH: Tone = { dk: '#4a1430', mid: '#8a2e5c', lt: '#c85a8e', hi: '#f6b0d2' };
const CHITIN: Tone = { dk: '#2c1e3a', mid: '#5a4474', lt: '#9478b8', hi: '#e0ccff' };   // kept bright: the bake darkens it
const SAC: Tone = { dk: '#1a5a66', mid: '#2fa6b0', lt: '#9af8f2', hi: '#ffffff' };    // crystal acid behind thin skin
const HEART: Tone = { dk: '#3a1850', mid: '#7a3aa8', lt: '#d8a0ff', hi: '#ffffff' };
const BONE: Tone = { dk: '#7a6a58', mid: '#bcae98', lt: '#e8dcc8', hi: '#fffaf0' };
const BLADE: Tone = { dk: '#16707c', mid: '#46c4c8', lt: '#9af6f1', hi: '#effffd' };

// ---------------- body kit ----------------

interface LegSpec { x: number; reach: number; up: number }
// jointed legs on both sides, alternating in a tripod gait: hip, a knee raised
// high and out, a crystal-tipped foot splayed forward or back like an insect's
function legs(P: Part[], phase: number, spec: LegSpec[], z: number, w: number, len: number, lift: number, t: Tone = CHITIN, hw = 1.6) {
  spec.forEach((l, i) => {
    for (const sd of [-1, 1]) {
      const [sw, lf] = stride(phase, (i + (sd > 0 ? 0 : 1)) % 2 ? 1 : -1, len, lift);
      const hip: V3 = [l.x, sd * hw, z], knee: V3 = [l.x * 1.25 + sw * 0.4, sd * l.reach * 0.7, z + l.up + lf], foot: V3 = [l.x * 1.9 + sw, sd * l.reach, lf];
      P.push({ k: 'limb', a: hip, b: knee, w, w2: w * 0.8, t }, { k: 'limb', a: knee, b: foot, w: w * 0.8, w2: w * 0.35, t });
      P.push({ k: 'glow', c: [foot[0], foot[1], foot[2] + 0.2], r: w * 0.9, col: 'rgba(140,255,250,0.55)' });
    }
  });
}
// a pair of hooked mandibles in front of the head
function mandibles(P: Part[], x: number, z: number, spread: number, len: number, w: number) {
  for (const sd of [-1, 1]) {
    const m0: V3 = [x, sd * spread, z], m1: V3 = [x + len * 0.6, sd * spread * 1.2, z - 0.3], m2: V3 = [x + len, sd * spread * 0.3, z - 0.8];
    P.push({ k: 'limb', a: m0, b: m1, w, w2: w * 0.8, t: BONE }, { k: 'limb', a: m1, b: m2, w: w * 0.8, w2: w * 0.25, t: BONE });
  }
}
function eyes(P: Part[], x: number, z: number, spread: number, team: string, r = 1.6) {
  for (const sd of [-1, 1]) P.push({ k: 'glow', c: [x, sd * spread, z], r, col: team + 'd0' });
}

// ---------------- units ----------------

function drawSkitter(g: Ctx, a: number, team: string, phase = 0) {
  const z = 4 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.6, P: Part[] = [];
  shadow(g, 1, 1.5, 8, 4);
  legs(P, phase, [{ x: 2.4, reach: 6.5, up: 2.6 }, { x: 0, reach: 7, up: 3 }, { x: -2.4, reach: 6.5, up: 2.6 }], z, 0.9, 1.8, 1.1);
  P.push({ k: 'plate', c: [-3.4, 0, z - 0.4], rx: 3.6, ry: 2.8, h: 2.4, t: FLESH, veins: 3 });
  P.push({ k: 'plate', c: [0.2, 0, z], rx: 2.4, ry: 2.2, h: 2.2, t: CHITIN, ridge: CHITIN.dk });
  P.push({ k: 'plate', c: [3.1, 0, z - 0.2], rx: 1.8, ry: 1.6, h: 1.6, t: CHITIN });
  for (const [x, h, lean] of [[-4, 4.6, -0.35], [-2.4, 5.4, -0.25], [-0.6, 3.6, -0.15]]) P.push({ k: 'shard', c: [x, 0, z + 2], h, w: 1.1, lean });
  mandibles(P, 4.2, z + 0.4, 0.9, 2.4, 0.7);
  eyes(P, 4.1, z + 1.6, 0.8, team, 1.4);
  drawRig(g, a, P);
}

function drawSpitter(g: Ctx, a: number, team: string, phase = 0) {
  const z = 6 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.6, P: Part[] = [];
  shadow(g, 1, 1.5, 9, 4.6);
  legs(P, phase, [{ x: 2, reach: 7.5, up: 3.4 }, { x: -2.6, reach: 8, up: 3.4 }], z, 1.2, 1.5, 1.2);
  P.push({ k: 'plate', c: [-4, 0, z - 0.6], rx: 4.6, ry: 3.6, h: 3.4, t: FLESH, veins: 5 });
  P.push({ k: 'plate', c: [0.4, 0, z], rx: 2.8, ry: 2.4, h: 2.6, t: CHITIN, ridge: CHITIN.dk });
  for (const [x, y, h] of [[-5.2, -1, 5], [-3.6, 1, 6], [-2.2, 0, 4.4]]) P.push({ k: 'shard', c: [x, y, z + 2.6], h, w: 1.4, lean: -0.25 });
  // the neck rears up to a throat sac of glowing crystal acid
  P.push({ k: 'limb', a: [1.6, 0, z + 1.6], b: [3.8, 0, z + 5], w: 2.2, w2: 1.7, t: FLESH });
  P.push({ k: 'blob', c: [4.3, 0, z + 5.2], rx: 2.8, ry: 2.5, t: SAC, veins: 3 });
  P.push({ k: 'glow', c: [4.3, 0, z + 5.2], r: 6, col: 'rgba(120,250,240,0.55)' });
  P.push({ k: 'plate', c: [5.6, 0, z + 5.4], rx: 1.8, ry: 1.6, h: 1.2, t: CHITIN });
  eyes(P, 6.4, z + 6.6, 0.9, team, 1.4);
  drawRig(g, a, P);
}

function drawLurker(g: Ctx, a: number, team: string, phase = 0) {
  // squat and armoured, its back a quiver of crystal spines cocked to throw
  const z = 3.6 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.4, P: Part[] = [];
  shadow(g, 1, 1.5, 10, 5.5);
  legs(P, phase, [{ x: 3, reach: 6.8, up: 2.2 }, { x: -0.6, reach: 7.2, up: 2.4 }, { x: -4.2, reach: 6.8, up: 2.2 }], z, 1.1, 1.2, 0.9);
  P.push({ k: 'plate', c: [-5.4, 0, z - 0.2], rx: 3.8, ry: 3.2, h: 2.4, t: FLESH, veins: 4 });
  P.push({ k: 'plate', c: [-1.6, 0, z + 0.2], rx: 3.6, ry: 3.6, h: 3, t: CHITIN, ridge: CHITIN.dk });
  P.push({ k: 'plate', c: [2.4, 0, z], rx: 3, ry: 3.2, h: 2.6, t: CHITIN, ridge: CHITIN.dk });
  for (const [x, y, h, lean] of [[-4, -1.6, 9, -0.45], [-3, 1.6, 10, -0.4], [-1.5, -0.5, 12, -0.3], [-2, 0.8, 11, -0.35], [-5.5, 0, 7, -0.55], [0, -1.4, 8, -0.2]]) {
    P.push({ k: 'shard', c: [x, y, z + 2.4], h, w: 1.3, lean });
    P.push({ k: 'glow', c: [x + lean * h * 0.9, y, z + 2.4 + h * 0.95], r: 2.2, col: 'rgba(150,255,245,0.7)' });
  }
  P.push({ k: 'plate', c: [5.2, 0, z - 0.2], rx: 2, ry: 1.9, h: 1.4, t: FLESH });
  mandibles(P, 6, z + 0.2, 1.2, 2.6, 0.9);
  P.push({ k: 'glow', c: [6.8, 0, z + 0.4], r: 2.6, col: 'rgba(140,255,240,0.6)' });
  eyes(P, 5.6, z + 1.8, 1, team, 1.4);
  drawRig(g, a, P);
}

function drawNurse(g: Ctx, a: number, team: string, phase = 0) {
  // a bloated translucent sac on short legs; veins of light pulse in it, sap drips from it
  const pulse = Math.sin(phase * Math.PI * 2), z = 4.5 + Math.abs(pulse) * 0.6, r = 7 + pulse * 0.35, P: Part[] = [];
  shadow(g, 1, 1.5, 10, 6);
  legs(P, phase, [{ x: 3.2, reach: 6.6, up: 2 }, { x: 0, reach: 7, up: 2.2 }, { x: -3.2, reach: 6.6, up: 2 }], z, 0.9, 0.9, 0.8);
  P.push({ k: 'plate', c: [0, 0, z - 1], rx: 5, ry: 4, h: 1.6, t: CHITIN });
  P.push({ k: 'blob', c: [-0.6, 0, z + r * 0.7], rx: r, ry: r * 0.86, t: { dk: '#5a1a48', mid: '#b05a90', lt: '#f2b6dc', hi: '#ffffff' }, veins: 7 });
  P.push({ k: 'glow', c: [-0.6, 0, z + r * 0.7 + 0.1], r: r * 1.3, col: 'rgba(140,255,240,0.45)' });
  for (const k of [-2, -1, 0, 1, 2]) P.push({ k: 'shard', c: [-0.8 + Math.abs(k) * 0.4, k * 1.7, z + r * 1.4], h: 3 + (2 - Math.abs(k)), w: 0.9, lean: k * 0.15 });
  // feeding tendrils at the front
  for (const sd of [-1, 0, 1]) P.push({ k: 'limb', a: [4.6, sd * 1.4, z + 2], b: [8, sd * 2.4, z - 1 + pulse], w: 0.9, w2: 0.4, t: FLESH });
  // glowing sap dripping from the underside
  for (const [x, y] of [[-3.6, 1.6], [-0.6, -1.8], [2, 1]]) P.push({ k: 'glow', c: [x, y, z - 2.4 - Math.abs(pulse)], r: 1.2, col: 'rgba(160,255,250,0.9)' });
  eyes(P, 5, z + 2.4, 1, team, 1.3);
  drawRig(g, a, P);
}

function drawStalker(g: Ctx, a: number, team: string, phase = 0) {
  // long-legged and lean, high off the ground; barbs at the knees, a crystal blade for a head
  const z = 11 + Math.abs(Math.sin(phase * Math.PI * 2)) * 1.3, P: Part[] = [];
  shadow(g, 1, 1.5, 13, 6.5);
  const spec = [{ x: 4.5, reach: 11, up: 6 }, { x: -5, reach: 12, up: 6 }];
  legs(P, phase, spec, z, 1.8, 3.4, 2);
  spec.forEach((l, i) => { for (const sd of [-1, 1]) { const [sw, lf] = stride(phase, (i + (sd > 0 ? 0 : 1)) % 2 ? 1 : -1, 3.4, 2); P.push({ k: 'shard', c: [l.x * 1.25 + sw * 0.4, sd * l.reach * 0.7, z + l.up + lf + 0.6], h: 3.6, w: 0.8, lean: -0.2 }); } });
  P.push({ k: 'plate', c: [-9.5, 0, z - 0.6], rx: 4.2, ry: 2.6, h: 2.2, t: FLESH, veins: 3 });
  P.push({ k: 'plate', c: [-3, 0, z], rx: 5.2, ry: 3.2, h: 2.8, t: CHITIN, ridge: CHITIN.dk, veins: 3 });
  P.push({ k: 'plate', c: [3.4, 0, z + 0.6], rx: 3.4, ry: 2.4, h: 2, t: CHITIN, ridge: CHITIN.dk });
  for (const x of [-7, -4.5, -2, 0.5]) P.push({ k: 'shard', c: [x, 0, z + 2.6], h: 3 + (x + 7) * 0.25, w: 0.9, lean: -0.35 });
  P.push({ k: 'limb', a: [5.6, 0, z + 1.2], b: [15, 0, z + 0.4], w: 2.8, w2: 0.3, t: BLADE });
  mandibles(P, 6.6, z + 0.4, 1.8, 3.6, 1);
  eyes(P, 6.4, z + 2.2, 1.2, team, 1.5);
  drawRig(g, a, P);
}

function drawCarapace(g: Ctx, a: number, team: string, phase = 0) {
  // a great beetle: three overlapping shell segments ridged with crystal plates, heavy mandibles
  const z = 7 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.5, P: Part[] = [];
  shadow(g, 1, 1.5, 16, 9.5);
  legs(P, phase, [{ x: 6, reach: 13, up: 5 }, { x: 0, reach: 14, up: 5.5 }, { x: -6, reach: 13, up: 5 }], z, 2.4, 2.2, 1.6, CHITIN, 4);
  P.push({ k: 'plate', c: [-1, 0, z - 2], rx: 12, ry: 7.5, h: 2.4, t: FLESH, veins: 4 });
  P.push({ k: 'plate', c: [-7, 0, z + 0.4], rx: 6, ry: 6.6, h: 4.6, t: CHITIN, ridge: CHITIN.dk });
  P.push({ k: 'plate', c: [-0.6, 0, z + 1], rx: 6.4, ry: 7.4, h: 5.4, t: CHITIN, ridge: CHITIN.dk, veins: 4 });
  P.push({ k: 'plate', c: [5.4, 0, z + 0.6], rx: 4.8, ry: 5.8, h: 4.2, t: CHITIN, ridge: CHITIN.dk });
  P.push({ k: 'plate', c: [10, 0, z - 0.4], rx: 3, ry: 3.6, h: 2.4, t: CHITIN });
  for (const [x, y, h] of [[-8, -1.6, 6], [-4, 1.8, 8], [0, -1.8, 9], [4, 1.6, 7], [-2, 0, 11]]) P.push({ k: 'shard', c: [x, y, z + 5.4], h, w: 2.2, lean: y * 0.06 - 0.1 });
  mandibles(P, 11.6, z + 0.2, 2.4, 5, 2);
  eyes(P, 11.6, z + 2.2, 1.8, team, 2);
  drawRig(g, a, P);
}

function drawMoth(g: Ctx, a: number, team: string, phase = 0) {
  const flap = Math.sin(phase * Math.PI * 2) * 0.25 + 0.85;     // wing spread
  // translucent membranes veined with light, back pair under the front pair
  for (const [x, span, len] of [[-3, 12, 9], [2, 15, 11]]) {
    for (const s of [-1, 1]) {
      const root = rotP(x, s * 1.5, a), tip = rotP(x - len * 0.4, s * span * flap, a), trail = rotP(x - len, s * span * 0.55 * flap, a), lead = rotP(x + 3, s * span * 0.7 * flap, a);
      const gr = g.createLinearGradient(root[0], root[1], tip[0], tip[1]);
      gr.addColorStop(0, team + 'b0'); gr.addColorStop(0.6, 'rgba(160,240,250,0.45)'); gr.addColorStop(1, 'rgba(220,255,255,0.25)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(root[0], root[1]); g.quadraticCurveTo(lead[0], lead[1], tip[0], tip[1]); g.quadraticCurveTo(trail[0], trail[1], root[0], root[1]); g.fill();
      g.strokeStyle = 'rgba(30,10,30,0.5)'; g.lineWidth = 0.5; g.stroke();
      g.strokeStyle = 'rgba(230,255,255,0.6)'; g.lineWidth = 0.5;
      const m1 = [(tip[0] + trail[0]) / 2, (tip[1] + trail[1]) / 2];
      g.beginPath(); g.moveTo(root[0], root[1]); g.lineTo(tip[0], tip[1]); g.moveTo(root[0], root[1]); g.lineTo(m1[0], m1[1]); g.stroke();
      // an eye-spot on each front wing
      if (x > 0) { const [ex, ey] = rotP(x - len * 0.45, s * span * 0.6 * flap, a); glowAt(g, ex, ey, 2.6, team + 'c0'); g.fillStyle = '#1a0a1a'; g.beginPath(); g.arc(ex, ey, 0.8, 0, Math.PI * 2); g.fill(); }
    }
  }
  const P: Part[] = [
    { k: 'plate', c: [-2, 0, 0], rx: 4.6, ry: 2.2, h: 1.6, t: FLESH, veins: 3 },
    { k: 'plate', c: [2.2, 0, 0.2], rx: 2.4, ry: 2, h: 1.6, t: CHITIN, ridge: CHITIN.dk },
    { k: 'plate', c: [4.8, 0, 0.2], rx: 1.6, ry: 1.5, h: 1.2, t: CHITIN },
    { k: 'glow', c: [-4.6, 0, 0.6], r: 6, col: team + '90' },
  ];
  eyes(P, 5.6, 1, 0.8, team, 1.3);
  for (const sd of [-1, 1]) P.push({ k: 'limb', a: [5.6, sd * 0.6, 1.2], b: [8.6, sd * 2.6, 2.4], w: 0.5, w2: 0.3, t: CHITIN });   // antennae
  drawRig(g, a, P);
}

function drawBehemoth(g: Ctx, a: number, team: string, phase = 0) {
  // a walking hill: pillar legs with plated knees, a back of shell segments carrying a forest of crystal mortar-spires, tusks
  const z = 16 + Math.abs(Math.sin(phase * Math.PI * 2)) * 1, P: Part[] = [];
  shadow(g, 1, 1.5, 25, 14);
  for (const [i, x] of [9, -9].entries()) for (const sd of [-1, 1]) {
    const [sw, lf] = stride(phase, (i + (sd > 0 ? 0 : 1)) % 2 ? 1 : -1, 2.6, 1.8);
    const hip: V3 = [x, sd * 6, z], knee: V3 = [x + sw * 0.4 + 1.5, sd * 9.5, z * 0.5 + lf], foot: V3 = [x + sw, sd * 10.5, lf];
    P.push({ k: 'limb', a: hip, b: knee, w: 6.5, w2: 5, t: FLESH }, { k: 'limb', a: knee, b: foot, w: 5, w2: 4.4, t: CHITIN });
    P.push({ k: 'plate', c: [knee[0] + 0.8, knee[1], knee[2] - 1.6], rx: 3, ry: 2.6, h: 2.2, t: CHITIN });
    P.push({ k: 'plate', c: [foot[0], foot[1], foot[2] - 0.6], rx: 3.6, ry: 2.6, h: 1.4, t: CHITIN });
  }
  P.push({ k: 'plate', c: [-1, 0, z - 4], rx: 20, ry: 11.5, h: 4, t: FLESH, veins: 6 });
  P.push({ k: 'plate', c: [-10, 0, z], rx: 9, ry: 10, h: 7, t: CHITIN, ridge: CHITIN.dk });
  P.push({ k: 'plate', c: [0, 0, z + 0.6], rx: 9.6, ry: 11, h: 8.4, t: CHITIN, ridge: CHITIN.dk, veins: 5 });
  P.push({ k: 'plate', c: [9.4, 0, z], rx: 6.6, ry: 8.4, h: 5.6, t: CHITIN, ridge: CHITIN.dk });
  for (const [x, y, h, w] of [[-10, -4, 12, 2.6], [-6, 4, 16, 3], [-2, -4, 20, 3.4], [2, 4, 15, 2.8], [6, -4, 11, 2.4], [-4, 0, 26, 4]]) P.push({ k: 'shard', c: [x, y, z + 8], h, w, lean: y * 0.03 });
  P.push({ k: 'glow', c: [-4, 0, z + 30], r: 9, col: 'rgba(140,255,250,0.6)' });
  P.push({ k: 'plate', c: [17.6, 0, z - 1.6], rx: 5.4, ry: 5.4, h: 3.6, t: CHITIN, ridge: CHITIN.dk });
  for (const sd of [-1, 1]) {
    const t0: V3 = [20, sd * 3, z - 2.4], t1: V3 = [25, sd * 5.4, z - 4.6], t2: V3 = [28.5, sd * 4, z - 1];
    P.push({ k: 'limb', a: t0, b: t1, w: 2.4, w2: 2, t: BONE }, { k: 'limb', a: t1, b: t2, w: 2, w2: 0.6, t: BONE });
  }
  eyes(P, 21, z + 0.6, 2.4, team, 2.4);
  drawRig(g, a, P);
}

Object.assign(VEHICLE_ART, {
  skitter:  { hull: drawSkitter,  reach: 10, height: 14, frames: 4, turn: 12 },
  spitter:  { hull: drawSpitter,  reach: 11, height: 18, frames: 4, turn: 9 },
  carapace: { hull: drawCarapace, reach: 18, height: 26, frames: 4, turn: 5 },
  moth:     { hull: drawMoth,     reach: 17, height: 8, frames: 4, turn: 6 },
  lurker:   { hull: drawLurker,   reach: 11, height: 18, frames: 4, turn: 8 },
  nurse:    { hull: drawNurse,    reach: 10, height: 20, frames: 4, turn: 8 },
  stalker:  { hull: drawStalker,  reach: 18, height: 24, frames: 4, turn: 9 },
  behemoth: { hull: drawBehemoth, reach: 30, height: 52, frames: 4, turn: 2.5 },
});

// ---------------- structures ----------------
// Grown, not built: each is a rig of flesh, chitin and crystal stood on its
// footprint, sorted back to front like a unit seen from the south.

function roots(g: Ctx, cx: number, cy: number, n: number, len: number, seed: number) {
  let r = seed * 7919 + 104729;
  const rnd = () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rnd() * 0.5, l = len * (0.6 + rnd() * 0.5);
    const ex = cx + Math.cos(ang) * l, ey = cy + Math.sin(ang) * l * 0.62;
    g.strokeStyle = FLESH.dk; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(ang + 0.4) * l * 0.5, cy + Math.sin(ang + 0.4) * l * 0.35, ex, ey); g.stroke();
    g.strokeStyle = FLESH.mid; g.lineWidth = 1.4; g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(200,140,255,0.35)'; g.lineWidth = 0.5; g.stroke(); g.restore();
  }
}
// a chitin rib arching from the ground at (r, ang) up and in toward the middle
function rib(P: Part[], ang: number, r: number, ry: number, top: number, w: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts: V3[] = [[c * r, s * r * ry, 0], [c * r * 0.96, s * r * ry * 0.96, top * 0.5], [c * r * 0.62, s * r * ry * 0.62, top * 0.88], [c * r * 0.2, s * r * ry * 0.2, top]];
  for (let k = 0; k < 3; k++) P.push({ k: 'limb', a: pts[k], b: pts[k + 1], w: w * (1 - k * 0.25), w2: w * (0.8 - k * 0.25), t: CHITIN });
}
// a stand-alone rig on a building footprint: origin at (x, y) on the ground
function grow(g: Ctx, x: number, y: number, P: Part[]) { g.save(); g.translate(x, y); drawRig(g, 0, P); g.restore(); }

function drawHeart(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  roots(g, 48, 66, 12, 48, 5);
  shadow(g, 50, 70, 44, 24);
  const P: Part[] = [{ k: 'plate', c: [0, 0, 0], rx: 34, ry: 22, h: 8, t: FLESH, veins: 8 }];
  // a cage of chitin ribs arching over the heart
  for (let k = 0; k < 7; k++) rib(P, k / 7 * Math.PI * 2 + 0.2, 30, 0.7, 40, 4.4);
  P.push({ k: 'blob', c: [0, 0, 20], rx: 13, ry: 12, t: HEART, veins: 8 });
  P.push({ k: 'glow', c: [0, 0.2, 20], r: 26, col: team + 'a0' });
  P.push({ k: 'glow', c: [0, 0.3, 20], r: 8, col: 'rgba(255,240,255,0.85)' });
  // pustules round the base, each lit from inside
  for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + 0.5; P.push({ k: 'blob', c: [Math.cos(t) * 24, Math.sin(t) * 15, 6], rx: 4, ry: 3.4, t: FLESH }, { k: 'glow', c: [Math.cos(t) * 24, Math.sin(t) * 15 + 0.1, 6], r: 5, col: team + '80' }); }
  // a crown of crystal through the top of the cage
  P.push({ k: 'shard', c: [0, 0, 38], h: 26 + level * 4, w: 6, lean: 0 });
  for (const [ang, h] of [[0.4, 16], [1.6, 20], [2.8, 15], [4, 18], [5.2, 14]]) P.push({ k: 'shard', c: [Math.cos(ang) * 12, Math.sin(ang) * 8, 32], h, w: 3.6, lean: Math.cos(ang) * 0.25 });
  grow(g, 48, 62, P);
  g.restore();
}

function drawBroodPod(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  roots(g, 32, 46, 8, 28, 2);
  const P: Part[] = [{ k: 'plate', c: [0, 0, 0], rx: 24, ry: 14, h: 5, t: FLESH, veins: 5 }];
  // egg sacs: thin skin over something glowing, held in two chitin claws
  for (const [x, y, z, r] of [[-12, -6, 9, 8], [12, -7, 10, 8.6], [0, -10, 13, 9.4], [-8, 6, 8, 6.6], [9, 6, 8, 7]]) {
    P.push({ k: 'blob', c: [x, y, z], rx: r * 0.85, ry: r, t: { dk: '#5a1a48', mid: '#a04a80', lt: '#f0b0d8', hi: '#ffffff' }, veins: 3 });
    P.push({ k: 'glow', c: [x, y + 0.1, z], r: r * 1.05, col: team + '90' });
  }
  rib(P, Math.PI * 0.85, 22, 0.6, 26, 3.4); rib(P, Math.PI * 0.15, 22, 0.6, 26, 3.4);
  for (const [x, y, h] of [[-21, 4, 10], [21, 2, 12], [0, -14, 9]]) P.push({ k: 'shard', c: [x, y, 2], h, w: 2.5, lean: x * 0.01 });
  grow(g, 32, 44, P);
  g.restore();
}

function drawVeinWell(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  roots(g, 32, 44, 10, 30, 9);
  const P: Part[] = [{ k: 'plate', c: [0, 4, 0], rx: 12, ry: 7, h: 4, t: FLESH, veins: 6 }];   // the pumping bulb
  for (const [x, y, h, w2, lean] of [[-8, -2, 18, 5, -0.2], [0, -6, 26, 6, 0], [8, -2, 20, 5, 0.2], [-4, 4, 12, 4, -0.1], [6, 5, 13, 4, 0.1]]) P.push({ k: 'shard', c: [x, y, 2], h, w: w2, lean });
  P.push({ k: 'glow', c: [0, -2, 16], r: 16, col: 'rgba(140,255,250,0.45)' });
  // four claw-roots gripping the cluster
  for (const ang of [0.5, 2.6, 3.7, 5.8]) rib(P, ang, 22, 0.6, 22, 3.6);
  P.push({ k: 'glow', c: [0, 4.2, 4], r: 8, col: team + '90' });
  grow(g, 32, 44, P);
  g.restore();
}

function drawBloomNode(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  roots(g, 16, 26, 6, 15, 3);
  const P: Part[] = [
    { k: 'plate', c: [0, 0, 0], rx: 6, ry: 4, h: 2.4, t: FLESH, veins: 2 },
    { k: 'limb', a: [0, 0, 1], b: [-2, 0, 10], w: 3, w2: 2.4, t: FLESH },
    { k: 'limb', a: [-2, 0, 10], b: [0, 0, 18], w: 2.4, w2: 1.8, t: FLESH },
    { k: 'blob', c: [0, 0, 21], rx: 5.4, ry: 5, t: HEART, veins: 3 },
    { k: 'glow', c: [0, 0.1, 21], r: 11, col: team + 'b0' },
    { k: 'shard', c: [4, 2, 0], h: 6, w: 1.6, lean: 0.2 },
  ];
  for (const sd of [-1, 1]) P.push({ k: 'plate', c: [sd * 3.4, 0, 16], rx: 3, ry: 1.6, h: 1, t: CHITIN });   // leaves of chitin cupping the bloom
  grow(g, 16, 26, P);
  g.restore();
}

function drawSpineSpire(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  roots(g, 16, 27, 6, 15, 8);
  const P: Part[] = [{ k: 'plate', c: [0, 0, 0], rx: 9, ry: 5, h: 3, t: FLESH, veins: 3 }];
  // a twisted stalk of flesh banded with chitin, ending in a crown of crystal
  for (let k = 0; k < 6; k++) P.push({ k: 'plate', c: [Math.sin(k * 0.9) * 1.4, 0, 3 + k * 4.2], rx: 4.2 - k * 0.35, ry: 3.2 - k * 0.25, h: 2.4, t: k % 2 ? CHITIN : FLESH });
  for (const [x, h, lean] of [[-3, 10, -0.3], [0, 14, 0], [3, 10, 0.3]]) P.push({ k: 'shard', c: [x, 0, 27], h, w: 2.4, lean });
  P.push({ k: 'glow', c: [0, 0, 32], r: 9, col: team + '90' });
  grow(g, 16, 27, P);
  g.restore();
}

function drawEvoPit(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  roots(g, 32, 40, 10, 30, 17);
  // a churning pit, half-formed shapes rising in the glow, ringed by lips of flesh and chitin
  g.fillStyle = '#12030e'; g.beginPath(); g.ellipse(32, 40, 23, 12, 0, 0, Math.PI * 2); g.fill();
  const pg = g.createRadialGradient(32, 42, 2, 32, 40, 22);
  pg.addColorStop(0, 'rgba(255,170,230,0.75)'); pg.addColorStop(0.45, team + '90'); pg.addColorStop(1, 'rgba(20,0,16,0)');
  g.fillStyle = pg; g.beginPath(); g.ellipse(32, 40, 22, 11, 0, 0, Math.PI * 2); g.fill();
  const P: Part[] = [
    { k: 'blob', c: [-7, -1, 1], rx: 4.2, ry: 2.8, t: { dk: '#5a1a48', mid: '#a04a80', lt: '#f0b0d8', hi: '#fff' }, rot: 0.4 },
    { k: 'plate', c: [5, 2, 0.5], rx: 5, ry: 3.2, h: 2, t: CHITIN, ridge: CHITIN.dk },
    { k: 'shard', c: [5, 1.5, 2], h: 5, w: 1.2, lean: 0.2 },
    { k: 'blob', c: [-1, 5, 1], rx: 3, ry: 2.2, t: FLESH },
  ];
  for (const sd of [-1, 1]) P.push({ k: 'limb', a: [sd * 6, 1, 1], b: [sd * 9, 0, 9], w: 1.4, w2: 1, t: FLESH }, { k: 'limb', a: [sd * 9, 0, 9], b: [sd * 7, -1, 16], w: 1, w2: 0.5, t: FLESH }, { k: 'glow', c: [sd * 7, -1, 16.4], r: 2.6, col: team + 'c0' });
  for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2; P.push({ k: 'plate', c: [Math.cos(t) * 23, Math.sin(t) * 12, 0], rx: 5, ry: 3.4, h: 3, t: k % 2 ? FLESH : CHITIN, ridge: k % 2 ? undefined : CHITIN.dk }); }
  for (const [x, y, h, lean] of [[-21, -4, 13, -0.25], [21, -6, 15, 0.25], [0, -12, 11, 0], [-12, -10, 8, -0.4], [12, -11, 9, 0.35]]) P.push({ k: 'shard', c: [x, y, 2], h, w: 2.6, lean });
  grow(g, 32, 40, P);
  glowAt(g, 32, 38, 26, team + '40');
  g.restore();
}

Object.assign(BUILDING_ART, {
  heart: drawHeart, broodpod: drawBroodPod, evopit: drawEvoPit, veinwell: drawVeinWell, bloomnode: drawBloomNode, spinespire: drawSpineSpire,
});
