// The Hollow, as a faction: the Meridian's grandchildren, grown through with
// the Vey's crystal. Pale quartz and cyan light, faceted dark stone, and scraps
// of the old colony ship (hull plate, rivets, cable, a faded stencil) built into
// everything. Same conventions as art.ts; this module adds itself to art.ts's
// registries.

import { VEHICLE_ART, BUILDING_ART, TURRET_ART } from './art';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
interface Tone { dk: string; mid: string; lt: string; hi: string }

const QUARTZ: Tone = { dk: '#5f7c84', mid: '#9fb8bd', lt: '#d8eceb', hi: '#ffffff' };
const STONE: Tone = { dk: '#242128', mid: '#3e3a44', lt: '#625c69', hi: '#8c8592' };
const CRY = { hi: '#effffd', lt: '#9af6f1', mid: '#46c4c8', dk: '#16707c', deep: '#0b3a42' };
const HULL: Tone = { dk: '#4e4b45', mid: '#7a766c', lt: '#a29d91', hi: '#cfcabc' };

const rotP = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
function rng(seed: number) { let r = seed * 9301 + 49297; return () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647; }

function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
function poly(g: Ctx, pts: Pt[], fill: string | CanvasGradient, edge: string | null = 'rgba(8,10,14,0.6)', lw = 0.7) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath(); g.fillStyle = fill; g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}
function shadow(g: Ctx, x: number, y: number, rx: number, ry: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, 'rgba(6,8,12,0.45)'); gr.addColorStop(1, 'rgba(6,8,12,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

// a faceted stone: a ring of points lifted into a low-poly lump, lit from the north-west
function stone(g: Ctx, cx: number, cy: number, rx: number, ry: number, h: number, seed: number, t: Tone = STONE) {
  const r = rng(seed), n = 7, base: Pt[] = [], top: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4, j = 0.82 + r() * 0.3;
    base.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
    top.push([cx + Math.cos(a) * rx * j * 0.62 - rx * 0.06, cy + Math.sin(a) * ry * j * 0.62 - h]);
  }
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n, mid = (Math.atan2(base[k][1] + base[k2][1] - 2 * cy, base[k][0] + base[k2][0] - 2 * cx));
    if (Math.sin(mid) < -0.15) continue;                                   // faces turned away from us
    const lit = Math.cos(mid - 2.4);                                        // light from up-left
    poly(g, [base[k], base[k2], top[k2], top[k]], lit > 0.3 ? t.lt : lit > -0.3 ? t.mid : t.dk);
  }
  const tg = g.createLinearGradient(cx - rx, cy - h - ry, cx + rx, cy - h + ry);
  tg.addColorStop(0, t.hi); tg.addColorStop(0.5, t.lt); tg.addColorStop(1, t.mid);
  poly(g, top, tg);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.6;                    // a crack across the top
  g.beginPath(); g.moveTo(top[1][0], top[1][1]); g.lineTo((top[3][0] + top[4][0]) / 2, (top[3][1] + top[4][1]) / 2); g.stroke();
}
// a crystal: three faces, an inner glow, a hard glint on the lit edge
function shard(g: Ctx, x: number, y: number, h: number, w: number, lean = 0) {
  const tx = x + lean * h, ty = y - h, mx = x + lean * h * 0.35;
  poly(g, [[x - w, y], [tx, ty], [mx, y - h * 0.3], [x - w * 0.2, y + w * 0.3]], CRY.dk, 'rgba(4,30,36,0.7)', 0.5);
  poly(g, [[x - w * 0.2, y + w * 0.3], [mx, y - h * 0.3], [tx, ty], [x + w, y]], CRY.mid, 'rgba(4,30,36,0.7)', 0.5);
  const ig = g.createLinearGradient(x, y, tx, ty);
  ig.addColorStop(0, 'rgba(160,255,250,0)'); ig.addColorStop(1, 'rgba(220,255,252,0.65)');
  poly(g, [[mx, y - h * 0.3], [tx, ty], [x + w * 0.45, y - h * 0.1]], ig, null);
  g.strokeStyle = CRY.hi; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x + w * 0.1, y - h * 0.05); g.lineTo(tx, ty); g.stroke();
}
function cluster(g: Ctx, x: number, y: number, s: number, seed: number, n = 5) {
  const r = rng(seed), list: [number, number, number, number, number][] = [];
  for (let k = 0; k < n; k++) list.push([x + (r() - 0.5) * s * 1.6, y + (r() - 0.5) * s * 0.5, s * (0.6 + r() * 0.9), s * (0.16 + r() * 0.1), (r() - 0.5) * 0.7]);
  list.sort((p, q) => p[1] - q[1]);
  for (const [cx, cy, h, w, lean] of list) shard(g, cx, cy, h, w, lean);
  glowAt(g, x, y - s * 0.5, s * 1.4, 'rgba(120,250,240,0.32)');
}
// a riveted plate of the old ship's hull
function hullPlate(g: Ctx, pts: Pt[], stencil?: string) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const hg = g.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  hg.addColorStop(0, HULL.lt); hg.addColorStop(0.5, HULL.mid); hg.addColorStop(1, HULL.dk);
  poly(g, pts, hg);
  g.fillStyle = 'rgba(30,28,24,0.75)';
  for (let k = 0; k < pts.length; k++) { const [x, y] = pts[k], [cx, cy] = [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length]; g.beginPath(); g.arc(x + (cx - x) * 0.15, y + (cy - y) * 0.15, 0.7, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(140,60,30,0.35)'; g.fillRect(Math.min(...xs) + 1, Math.max(...ys) - 2.2, (Math.max(...xs) - Math.min(...xs)) * 0.4, 1.2);   // a rust streak
  if (stencil) { g.fillStyle = 'rgba(30,44,70,0.55)'; g.font = '700 3.4px system-ui, sans-serif'; g.fillText(stencil, Math.min(...xs) + 2, (Math.min(...ys) + Math.max(...ys)) / 2 + 1.2); }
}

// ---------------- units ----------------

function drawCairn(g: Ctx, a: number, team: string, phase = 0) {
  // stones the Hollow sang into walking: stacked faceted rock with light in the seams, a slab of the Meridian's hull for a shield
  rigShadow(g, 15, 7);
  const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 1, P: Part[] = [];
  for (const sd of [-1, 1]) {
    const [sw, lift] = stride(phase, sd, 2.6, 1.6);
    P.push({ k: 'rock', c: [-0.6 + sw, sd * 4.6, lift], rx: 3.4, ry: 2.4, h: 3.6, seed: 11 + sd });          // feet
    P.push({ k: 'rock', c: [-0.4 + sw * 0.5, sd * 4.4, 4.4 + lift * 0.5], rx: 3, ry: 2.2, h: 3.4, seed: 13 + sd });   // shins
    P.push({ k: 'glow', c: [-0.4 + sw * 0.5, sd * 4.4, 4.2 + lift * 0.5], r: 1.6, col: 'rgba(120,250,240,0.5)' });   // the knee's seam of light
  }
  P.push({ k: 'rock', c: [-0.6, 0, 8 + bob], rx: 6.4, ry: 4.2, h: 5, seed: 3 });           // hips
  P.push({ k: 'rock', c: [-0.2, 0, 13 + bob], rx: 7.6, ry: 4.8, h: 6, seed: 5 });          // the great chest
  P.push({ k: 'glow', c: [1.4, 0, 16 + bob], r: 5, col: 'rgba(120,250,240,0.5)' });         // the light in its heart
  P.push({ k: 'rock', c: [0.6, 0, 19.6 + bob], rx: 3.4, ry: 2.6, h: 3.4, seed: 9 });       // the head-stone
  P.push({ k: 'glow', c: [2.6, 0, 21.4 + bob], r: 1.8, col: 'rgba(200,255,250,0.95)' });   // its one eye
  for (const sd of [-1, 1]) {
    const [sw] = stride(phase, -sd, 1.6, 0);
    P.push({ k: 'rock', c: [0.6, sd * 7.4, 15 + bob], rx: 3.2, ry: 2.4, h: 3.6, seed: 17 + sd });           // shoulders
    P.push({ k: 'rock', c: [1.6 + sw * 0.3, sd * 8.4, 9.4 + bob], rx: 2.6, ry: 2, h: 3.6, seed: 19 + sd });  // fists
  }
  for (const [x, y, z, h, w, lean] of [[-2.6, -3, 18, 8, 1.8, -0.35], [-1.6, 2.8, 18.6, 10, 2.1, -0.15], [-3.4, 0, 16, 6, 1.5, -0.5], [1.6, 0, 22.6, 5, 1.2, 0]] as number[][])
    P.push({ k: 'shard', c: [x, y, z + bob], h, w, lean });
  // the shield: held out in front, a slab of hull plate banded in clan colour; behind the body when it faces away
  const sp: V3 = [6.6, -3.6, 14 + bob], [px, py] = proj(sp, a);
  const shield = () => { hullPlate(g, [[px - 5, py - 7], [px + 4, py - 9], [px + 5, py + 6], [px - 4, py + 8]], 'MER'); g.fillStyle = team; g.fillRect(px - 4.4, py - 1.2, 9, 1.8); };
  const behind = depthOf(sp, a) < depthOf([-0.2, 0, 13 + bob], a);
  if (behind) shield();
  drawRig(g, a, P);
  if (!behind) shield();
}

// ---------------- structures ----------------

function drawHearthstone(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  shadow(g, 48, 70, 46, 16);
  // a mound of faceted stone around a cave mouth, the Meridian's hull for a lintel
  for (const [x, y, rx, ry, h, sd] of [[18, 62, 14, 9, 14, 1], [78, 62, 14, 9, 16, 2], [30, 44, 16, 10, 22, 3], [66, 44, 16, 10, 24, 4], [48, 36, 20, 11, 30, 5]] as number[][]) stone(g, x, y, rx, ry, h, sd);
  // the mouth: deep, lit from inside
  g.fillStyle = '#071012'; g.beginPath(); g.moveTo(32, 74); g.quadraticCurveTo(34, 50, 48, 48); g.quadraticCurveTo(62, 50, 64, 74); g.closePath(); g.fill();
  const mg = g.createRadialGradient(48, 70, 1, 48, 66, 18);
  mg.addColorStop(0, 'rgba(180,255,248,0.9)'); mg.addColorStop(0.4, 'rgba(70,196,200,0.5)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mg; g.beginPath(); g.moveTo(32, 74); g.quadraticCurveTo(34, 50, 48, 48); g.quadraticCurveTo(62, 50, 64, 74); g.closePath(); g.fill();
  // steps worn into the rock, and figures' lamps further down
  for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(60,90,96,${0.5 - k * 0.12})`; g.fillRect(38 + k * 2, 70 - k * 4, 20 - k * 4, 2); }
  for (const [x, y] of [[44, 60], [53, 57]] as Pt[]) glowAt(g, x, y, 3, 'rgba(255,214,150,0.8)');
  hullPlate(g, [[28, 44], [68, 41], [69, 49], [27, 52]], 'MERIDIAN');
  g.fillStyle = team; g.fillRect(30, 50, 38, 1.6);
  // crystal grown up through the mound
  cluster(g, 20, 52, 13, 21, 4); cluster(g, 78, 50, 14, 22, 5); cluster(g, 48, 22, 18, 23, 5);
  if (level >= 2) cluster(g, 12, 72, 9, 24, 3);
  if (level >= 3) cluster(g, 86, 72, 10, 25, 3);
  // a salvaged cable strung with lamps over the entrance
  g.strokeStyle = '#2a2c32'; g.lineWidth = 1; g.beginPath(); g.moveTo(26, 40); g.quadraticCurveTo(48, 50, 70, 38); g.stroke();
  for (const x of [34, 42, 54, 62]) glowAt(g, x, 40 + (x - 48) * (x - 48) * -0.008 + 6, 2.2, 'rgba(255,220,160,0.9)');
  g.restore();
}

function drawTunnelMouth(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  shadow(g, 32, 46, 30, 12);
  for (const [x, y, rx, ry, h, sd] of [[14, 40, 10, 7, 9, 31], [50, 40, 10, 7, 10, 32], [32, 28, 14, 7, 10, 33]] as number[][]) stone(g, x, y, rx, ry, h, sd);
  // the shaft going down, ringed with crystal, a rope ladder over the lip
  g.fillStyle = '#05090b'; g.beginPath(); g.ellipse(32, 44, 15, 8, 0, 0, Math.PI * 2); g.fill();
  const sg = g.createRadialGradient(32, 46, 1, 32, 44, 15);
  sg.addColorStop(0, 'rgba(150,255,245,0.65)'); sg.addColorStop(0.6, 'rgba(40,140,150,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sg; g.beginPath(); g.ellipse(32, 44, 15, 8, 0, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; if (Math.sin(t) < -0.2) continue; shard(g, 32 + Math.cos(t) * 16, 44 + Math.sin(t) * 8.5, 5 + (k % 3) * 2.2, 1.6, Math.cos(t) * 0.35); }
  g.strokeStyle = '#8a7a5a'; g.lineWidth = 0.8;
  for (const x of [28, 34]) { g.beginPath(); g.moveTo(x, 36); g.lineTo(x + 1, 50); g.stroke(); }
  for (let y = 38; y < 50; y += 2.6) { g.beginPath(); g.moveTo(28, y); g.lineTo(34.5, y + 0.4); g.stroke(); }
  hullPlate(g, [[22, 22], [42, 21], [42, 26], [22, 27]]);
  g.fillStyle = team; g.fillRect(24, 25, 16, 1.4);
  g.restore();
}

function drawGeode(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  shadow(g, 32, 48, 28, 10);
  // a great stone split down the middle, its two halves fallen apart, the cavity full of crystal
  stone(g, 17, 44, 13, 9, 15, 41);
  stone(g, 47, 44, 13, 9, 16, 42);
  g.fillStyle = CRY.deep; g.beginPath(); g.ellipse(32, 40, 10, 11, 0, 0, Math.PI * 2); g.fill();
  const cg = g.createRadialGradient(32, 34, 1, 32, 38, 12);
  cg.addColorStop(0, 'rgba(220,255,252,0.9)'); cg.addColorStop(1, 'rgba(40,150,160,0.1)');
  g.fillStyle = cg; g.beginPath(); g.ellipse(32, 40, 10, 11, 0, 0, Math.PI * 2); g.fill();
  cluster(g, 32, 48, 14, 43, 6);
  // the Hollow sing to it: offerings of cloth and wire tied round the stones
  g.strokeStyle = team; g.lineWidth = 1.2; g.beginPath(); g.moveTo(8, 40); g.quadraticCurveTo(14, 44, 22, 38); g.stroke();
  g.strokeStyle = '#a89878'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(42, 36); g.quadraticCurveTo(50, 42, 57, 37); g.stroke();
  glowAt(g, 32, 32, 26, team + '40');
  g.restore();
}

function drawGrotto(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  shadow(g, 32, 50, 30, 11);
  // a low arch of stone over a lamplit hollow: the elders' library of colony data-slates
  stone(g, 14, 46, 11, 8, 18, 51); stone(g, 50, 46, 11, 8, 19, 52);
  stone(g, 32, 30, 19, 8, 9, 53, { ...STONE, lt: '#6a6470' });
  g.fillStyle = '#0a0c0e'; g.beginPath(); g.moveTo(21, 54); g.quadraticCurveTo(22, 34, 32, 33); g.quadraticCurveTo(42, 34, 43, 54); g.closePath(); g.fill();
  glowAt(g, 32, 48, 15, 'rgba(255,214,150,0.55)');
  // shelves of slates and a reading lamp
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) { g.fillStyle = (k + row) % 2 ? HULL.mid : HULL.lt; g.fillRect(25 + k * 3.4, 39 + row * 4.4, 2.6, 3.6); }
  glowAt(g, 39, 50, 4, 'rgba(255,230,170,0.95)');
  cluster(g, 8, 40, 9, 54, 3); cluster(g, 56, 38, 10, 55, 3);
  hullPlate(g, [[22, 22], [42, 20], [43, 25], [21, 27]], 'ARCHIVE');
  g.fillStyle = team; g.fillRect(24, 26, 17, 1.3);
  g.restore();
}

function drawEcho(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  shadow(g, 16, 26, 12, 4.5);
  stone(g, 16, 25, 9, 5, 5, 61);
  // a tall crystal pillar on the stone, strung with salvaged wire
  shard(g, 16, 22, 15, 3.4, 0);
  shard(g, 12.5, 22, 8, 1.8, -0.3); shard(g, 19.5, 22, 9, 1.8, 0.3);
  g.strokeStyle = '#3a3c44'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(10, 21); g.lineTo(16, 12); g.lineTo(22, 21); g.stroke();
  g.fillStyle = team; g.fillRect(13, 20, 6, 1.2);
  glowAt(g, 16, 12, 9, team + '50');
  g.restore();
}
function drawEchoHead(g: Ctx, a: number, _team: string) {
  // a ring of crystal tines around a singing point of light, turned toward its target
  const z = 18;
  for (let k = 0; k < 5; k++) {
    const ang = a + (k - 2) * 0.45, [x, y] = rotP(4, 0, ang);
    shard(g, x, y - z + 2, 6, 1.1, Math.cos(ang) * 0.4);
  }
  glowAt(g, 0, -z - 2, 7, 'rgba(170,255,250,0.85)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(170,255,250,0.5)'; g.lineWidth = 0.6;
  for (const r of [3.5, 5.5]) { g.beginPath(); g.ellipse(0, -z - 2, r, r * 0.45, 0, 0, Math.PI * 2); g.stroke(); }   // the note it sings, as rings
  g.restore();
  g.fillStyle = CRY.hi; g.beginPath(); g.arc(0, -z - 2, 1.4, 0, Math.PI * 2); g.fill();
}

// ---------------- the creature rig ----------------
// A Hollow body is a handful of parts placed in 3D (x forward, y to the side, z up),
// projected for the unit's heading and drawn back to front, so limbs pass in
// front of and behind the body the right way as it turns and walks.

type V3 = [number, number, number];
type Part =
  | { k: 'limb'; a: V3; b: V3; w: number; w2?: number; t: Tone }    // a tapered capsule: thigh, forearm, neck
  | { k: 'blob'; c: V3; rx: number; ry: number; t: Tone; rot?: number; veins?: number }   // a rounded mass: torso, head, shoulder
  | { k: 'cloth'; c: V3; r0: number; z1: number; r1: number; t: Tone; trim: string }   // a draped skirt or robe, from a waist ring down to a ragged hem
  | { k: 'shard'; c: V3; h: number; w: number; lean: number }       // a crystal growing out of the body
  | { k: 'glow'; c: V3; r: number; col: string }
  | { k: 'rock'; c: V3; rx: number; ry: number; h: number; seed: number }   // a faceted stone: the Cairn is made of these
  | { k: 'band'; a: V3; b: V3; w: number; col: string };            // cloth, a strap, a sash

function proj(p: V3, a: number): Pt { const [x, y] = rotP(p[0], p[1], a); return [x, y - p[2]]; }
const depthOf = (p: V3, a: number) => rotP(p[0], p[1], a)[1] + p[2] * 0.002;
// glowing crystal veins under the skin of a rounded part
function skinVeins(g: Ctx, rx: number, ry: number, n: number) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(120,250,240,0.55)'; g.lineWidth = 0.45; g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const t0 = k * 2.39, x0 = Math.cos(t0) * rx * 0.2, y0 = Math.sin(t0) * ry * 0.2;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(Math.cos(t0 + 0.6) * rx * 0.6, Math.sin(t0 + 0.6) * ry * 0.5, Math.cos(t0 + 1) * rx * 0.85, Math.sin(t0 + 1) * ry * 0.85); g.stroke();
  }
  g.restore();
}

function drawRig(g: Ctx, a: number, parts: Part[]) {
  const key = (q: Part) => q.k === 'limb' || q.k === 'band' ? (depthOf(q.a, a) + depthOf(q.b, a)) / 2 : depthOf(q.c, a);   // cloth sorts by its waist
  for (const q of [...parts].sort((p1, p2) => key(p1) - key(p2) || (p1.k === 'glow' ? 1 : 0) - (p2.k === 'glow' ? 1 : 0))) {
    if (q.k === 'limb') {
      // a tapered limb: a quad between two widths, round at both ends, shaded across its width
      const [x0, y0] = proj(q.a, a), [x1, y1] = proj(q.b, a), w0 = q.w / 2, w1 = (q.w2 ?? q.w * 0.7) / 2;
      const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      // solid pieces (no self-crossing outline): a dark underlay a little wider, then the shaded body
      const body = (grow: number, fill: string | CanvasGradient) => {
        g.fillStyle = fill;
        g.beginPath(); g.moveTo(x0 + nx * (w0 + grow), y0 + ny * (w0 + grow)); g.lineTo(x1 + nx * (w1 + grow), y1 + ny * (w1 + grow));
        g.lineTo(x1 - nx * (w1 + grow), y1 - ny * (w1 + grow)); g.lineTo(x0 - nx * (w0 + grow), y0 - ny * (w0 + grow)); g.closePath(); g.fill();
        g.beginPath(); g.arc(x0, y0, w0 + grow, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x1, y1, w1 + grow, 0, Math.PI * 2); g.fill();
      };
      const litSide = nx < 0 || ny < 0;   // the side facing up-left catches the light
      const lg = g.createLinearGradient(x0 + nx * w0, y0 + ny * w0, x0 - nx * w0, y0 - ny * w0);
      lg.addColorStop(0, litSide ? q.t.lt : q.t.dk); lg.addColorStop(0.5, q.t.mid); lg.addColorStop(1, litSide ? q.t.dk : q.t.lt);
      body(0.7, 'rgba(8,14,18,0.7)');
      body(0, lg);
    } else if (q.k === 'blob') {
      const [x, y] = proj(q.c, a);
      g.save(); g.translate(x, y); g.rotate(q.rot ?? 0);
      const gr = g.createRadialGradient(-q.rx * 0.35, -q.ry * 0.45, Math.min(q.rx, q.ry) * 0.15, 0, 0, Math.max(q.rx, q.ry) * 1.05);
      gr.addColorStop(0, q.t.hi); gr.addColorStop(0.3, q.t.lt); gr.addColorStop(0.7, q.t.mid); gr.addColorStop(1, q.t.dk);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, q.rx, q.ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(8,14,18,0.65)'; g.lineWidth = 0.7; g.stroke();
      if (q.veins) skinVeins(g, q.rx, q.ry, q.veins);
      g.restore();
    } else if (q.k === 'cloth') {
      // horizontal rings project to circles here, so a drape is the hull of its waist and hem circles
      const [cx, cy0] = proj(q.c, a), cy1 = cy0 + (q.c[2] - q.z1);
      const cg = g.createLinearGradient(cx - q.r1, 0, cx + q.r1, 0);
      cg.addColorStop(0, q.t.lt); cg.addColorStop(0.45, q.t.mid); cg.addColorStop(1, q.t.dk);
      g.fillStyle = cg; g.beginPath();
      g.moveTo(cx - q.r0, cy0); g.lineTo(cx + q.r0, cy0); g.lineTo(cx + q.r1, cy1);
      for (let k = 0; k <= 8; k++) { const t = k / 8, x = cx + q.r1 - t * q.r1 * 2; g.lineTo(x, cy1 + (k % 2 ? 1.6 : -0.2) + Math.sin(k * 1.7) * 0.5); }   // a ragged hem
      g.closePath(); g.fill(); g.strokeStyle = 'rgba(8,14,18,0.6)'; g.lineWidth = 0.7; g.stroke();
      g.strokeStyle = 'rgba(30,24,16,0.35)'; g.lineWidth = 0.5;
      for (const f of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(cx + q.r0 * f, cy0 + 1); g.lineTo(cx + q.r1 * f * 1.1, cy1 - 1); g.stroke(); }   // fold lines
      g.fillStyle = q.trim; g.fillRect(cx - q.r1 * 0.95, cy1 - 2.4, q.r1 * 1.9, 1.2);   // a band of team colour near the hem
    } else if (q.k === 'shard') {
      const [x, y] = proj(q.c, a); shard(g, x, y, q.h, q.w, q.lean);
    } else if (q.k === 'rock') {
      const [x, y] = proj(q.c, a); stone(g, x, y, q.rx, q.ry, q.h, q.seed);
    } else if (q.k === 'glow') {
      const [x, y] = proj(q.c, a); glowAt(g, x, y, q.r, q.col);
      g.fillStyle = 'rgba(240,255,255,0.95)'; g.beginPath(); g.arc(x, y, Math.max(0.4, q.r * 0.18), 0, Math.PI * 2); g.fill();
    } else {
      const [x0, y0] = proj(q.a, a), [x1, y1] = proj(q.b, a);
      g.lineCap = 'butt'; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = q.w + 0.8; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = q.col; g.lineWidth = q.w; g.stroke();
    }
  }
}
// a walk cycle: the swing and lift of one foot for a gait phase (side flips the half-cycle)
function stride(phase: number, side: number, len: number, lift: number): [number, number] {
  const t = phase * Math.PI * 2 + (side > 0 ? 0 : Math.PI);
  return [Math.sin(t) * len, Math.max(0, Math.cos(t)) * lift];
}
const SKIN: Tone = { dk: '#3a525a', mid: '#7a969c', lt: '#b6cfcf', hi: '#ecffff' };     // the Hollow's pale, quartz-veined skin
const RAG: Tone = { dk: '#4a4238', mid: '#7a6e5c', lt: '#a89a80', hi: '#d0c4aa' };      // colony cloth, two hundred years mended

function rigShadow(g: Ctx, rx: number, ry: number) { shadow(g, 1, 1.5, rx, ry); }

function drawShardkin(g: Ctx, a: number, team: string, phase = 0) {
  // lean and hunched on bent-back legs; its forearms end in crystal blades; shards run down its spine
  rigShadow(g, 8, 3.8);
  const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.6, P: Part[] = [];
  for (const sd of [-1, 1]) {
    const [sw, lift] = stride(phase, sd, 2.2, 1.1);
    const hip: V3 = [-0.6, sd * 1.5, 7 + bob], knee: V3 = [1.6 + sw * 0.4, sd * 1.8, 4.4 + lift], ankle: V3 = [-0.6 + sw, sd * 1.7, 1.6 + lift], toe: V3 = [0.8 + sw, sd * 1.7, lift];
    P.push({ k: 'limb', a: hip, b: knee, w: 2.4, w2: 1.6, t: SKIN }, { k: 'limb', a: knee, b: ankle, w: 1.6, w2: 1.1, t: SKIN }, { k: 'limb', a: ankle, b: toe, w: 1.1, w2: 0.9, t: SKIN });
    // arms swing against the legs; the forearm is a blade of crystal
    const arm = -sw * 0.6;
    const sh: V3 = [1.2, sd * 2.5, 11.4 + bob], el: V3 = [2.4 + arm, sd * 3, 8.4 + bob];
    P.push({ k: 'limb', a: sh, b: el, w: 1.8, w2: 1.3, t: SKIN });
    P.push({ k: 'shard', c: el, h: 5.4, w: 1.9, lean: 0.95 + arm * 0.1 });
    P.push({ k: 'glow', c: [el[0] + 1.6, el[1], el[2] + 1.2], r: 1.8, col: 'rgba(140,255,245,0.55)' });
  }
  P.push({ k: 'blob', c: [-0.4, 0, 8 + bob], rx: 2.6, ry: 2.4, t: SKIN });               // hips
  P.push({ k: 'blob', c: [0.8, 0, 11 + bob], rx: 3.2, ry: 3, t: SKIN, veins: 4 });      // chest, hunched forward
  P.push({ k: 'cloth', c: [-0.4, 0, 8.6 + bob], r0: 2.4, z1: 5 + bob, r1: 3.2, t: RAG, trim: team });   // a kilt of colony cloth
  P.push({ k: 'blob', c: [2.6, 0, 13.4 + bob], rx: 1.8, ry: 1.9, t: SKIN });            // head, thrust forward
  for (const [y, h, lean] of [[-0.8, 2.2, -0.4], [0, 2.8, -0.2], [0.8, 2.2, -0.4]] as number[][]) P.push({ k: 'shard', c: [2.2, y, 14.8 + bob], h, w: 0.55, lean });   // crystal grown out of the skull
  for (const sd of [-0.6, 0.6]) P.push({ k: 'glow', c: [4, sd, 13.6 + bob], r: 1.6, col: 'rgba(160,255,245,0.9)' });
  for (const [x, z, h] of [[-0.8, 12.6, 5.5], [-1.4, 10.6, 4.5], [-1.6, 8.8, 3.2]] as number[][]) P.push({ k: 'shard', c: [x, 0, z + bob], h, w: 1.1, lean: -0.35 });
  drawRig(g, a, P);
}

function drawBurrower(g: Ctx, a: number, team: string, phase = 0) {
  // a knuckle-walking brute: short hind legs, huge forelimbs with digging claws, great crystal plates over the shoulders
  rigShadow(g, 12, 5.5);
  const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.8, P: Part[] = [];
  for (const sd of [-1, 1]) {
    const [sw, lift] = stride(phase, sd, 1.8, 0.9), [fsw, flift] = stride(phase, -sd, 2.4, 1.2);
    P.push({ k: 'limb', a: [-3.6, sd * 2.4, 7 + bob], b: [-2.4 + sw, sd * 2.6, 3.6 + lift], w: 3, t: SKIN }, { k: 'limb', a: [-2.4 + sw, sd * 2.6, 3.6 + lift], b: [-3.4 + sw, sd * 2.6, lift], w: 2.2, t: SKIN });
    const sh: V3 = [2, sd * 4.2, 11 + bob], el: V3 = [4 + fsw * 0.5, sd * 5, 6.4 + flift], fist: V3 = [4.6 + fsw, sd * 4.6, 1 + flift];
    P.push({ k: 'limb', a: sh, b: el, w: 4, w2: 3, t: SKIN }, { k: 'limb', a: el, b: fist, w: 3.2, w2: 2.6, t: SKIN });
    P.push({ k: 'blob', c: fist, rx: 2.2, ry: 1.6, t: SKIN });
    for (const k of [-1, 0, 1]) P.push({ k: 'shard', c: [fist[0] + 1.6, fist[1] + k * 0.9, fist[2] + 0.6], h: 2.4, w: 0.5, lean: 1.1 });   // digging claws
  }
  P.push({ k: 'blob', c: [-2.6, 0, 7.6 + bob], rx: 3.6, ry: 3, t: SKIN });               // haunches
  P.push({ k: 'blob', c: [1.2, 0, 10.6 + bob], rx: 5.4, ry: 4.4, t: SKIN, veins: 6 });    // the great hunched back
  P.push({ k: 'cloth', c: [-2.6, 0, 8.6 + bob], r0: 3, z1: 5.4 + bob, r1: 3.6, t: RAG, trim: team });   // a ragged loincloth
  P.push({ k: 'blob', c: [4.6, 0, 9.4 + bob], rx: 2.2, ry: 2, t: SKIN });                // a small low head
  for (const sd of [-0.7, 0.7]) P.push({ k: 'glow', c: [6.4, sd, 9.8 + bob], r: 1.5, col: 'rgba(160,255,245,0.85)' });
  P.push({ k: 'band', a: [-1, -4.4, 12.6 + bob], b: [2.6, 4.4, 12 + bob], w: 1.4, col: team });   // a harness strap
  for (const [x, y, h, lean] of [[1.4, -2.6, 7, -0.35], [1.8, 2.6, 7.5, -0.25], [-0.6, -1.2, 6, -0.45], [-0.4, 1.4, 6.5, -0.4], [2.8, 0, 5, -0.1], [-2.4, 0, 4.5, -0.55]] as number[][])
    P.push({ k: 'shard', c: [x, y, 14 + bob], h, w: 1.8, lean });
  drawRig(g, a, P);
}

function drawChoir(g: Ctx, a: number, team: string, phase = 0) {
  // tall and gliding: a body that tapers into a skirt of crystal, a long neck, a crown of singing crystals, a glowing throat
  rigShadow(g, 6.5, 3.2);
  const sway = Math.sin(phase * Math.PI * 2) * 0.5, P: Part[] = [];
  for (const [x, y, h, lean] of [[-2.4, -1.2, 3.6, -0.35], [2, -1.6, 3, 0.3], [-1.8, 2, 3.4, -0.3], [2.2, 1.4, 3, 0.35]] as number[][])
    P.push({ k: 'shard', c: [x, y, 0.6], h, w: 1, lean });                                // crystal grown up round its hem
  P.push({ k: 'cloth', c: [0, 0, 12.6 + sway * 0.3], r0: 2.4, z1: 1.2, r1: 4.2, t: RAG, trim: team });   // a long mended robe, to the ground
  P.push({ k: 'blob', c: [0.2, 0, 12.4 + sway * 0.3], rx: 2.8, ry: 2.2, t: SKIN, veins: 3 });   // shoulders
  P.push({ k: 'limb', a: [0.4, 0, 13.2], b: [1.4 + sway, 0, 17.6], w: 1.5, t: SKIN });   // the long neck
  P.push({ k: 'glow', c: [1, 0, 15.2], r: 3.2, col: 'rgba(150,255,245,0.85)' });         // the singing throat
  P.push({ k: 'blob', c: [1.8 + sway, 0, 18.8], rx: 1.6, ry: 1.9, t: SKIN });
  for (const [y, h, lean] of [[-1.1, 3.6, -0.3], [0, 4.6, 0], [1.1, 3.6, 0.3]] as number[][]) P.push({ k: 'shard', c: [1.6 + sway, y, 20], h, w: 0.7, lean });
  for (const sd of [-1, 1]) {                                                             // arms raised, hands open to the song
    const sh: V3 = [0.4, sd * 2.4, 12.2], hand: V3 = [1.6, sd * 4.2, 15.8 + sway * sd];
    P.push({ k: 'limb', a: sh, b: hand, w: 1.2, t: SKIN });
    P.push({ k: 'glow', c: hand, r: 1.4, col: 'rgba(170,255,250,0.8)' });
  }
  drawRig(g, a, P);
}

function drawDelverRig(g: Ctx, a: number, team: string, phase = 0) {
  // a long, low tunnel-runner on four bent legs: a quartz-plated back, a ridge of crystal, a wedge head with crystal teeth
  rigShadow(g, 12, 5);
  const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.7, P: Part[] = [];
  for (const [x, sd, ph] of [[4.5, -1, 0], [4.5, 1, 0.5], [-4.5, -1, 0.5], [-4.5, 1, 0]] as number[][]) {
    const [sw, lift] = stride((phase + ph) % 1, 1, 2.4, 1.2);
    const hip: V3 = [x, sd * 2.4, 6.4 + bob], knee: V3 = [x + (x > 0 ? 1.6 : -1.4) + sw * 0.4, sd * 3.4, 3.6 + lift], foot: V3 = [x + sw, sd * 3.2, lift];
    P.push({ k: 'limb', a: hip, b: knee, w: 2.4, w2: 1.6, t: SKIN }, { k: 'limb', a: knee, b: foot, w: 1.5, w2: 1, t: SKIN });
    P.push({ k: 'shard', c: foot, h: 1.6, w: 0.6, lean: 0.9 });                         // crystal claws
  }
  P.push({ k: 'blob', c: [-4.4, 0, 7 + bob], rx: 4, ry: 3, t: SKIN, veins: 3 });       // haunches
  P.push({ k: 'blob', c: [1, 0, 7.6 + bob], rx: 5.4, ry: 3.4, t: QUARTZ, veins: 4 });  // the plated back
  P.push({ k: 'blob', c: [6.4, 0, 7.4 + bob], rx: 2.6, ry: 2.2, t: SKIN });            // shoulders
  P.push({ k: 'limb', a: [7.6, 0, 7.8 + bob], b: [11.6, 0, 7 + bob], w: 3, w2: 1.6, t: QUARTZ });   // the wedge of its head
  for (const sd of [-0.8, 0.8]) P.push({ k: 'glow', c: [10.4, sd, 8.2 + bob], r: 1.6, col: 'rgba(160,255,245,0.9)' });
  for (const k of [-0.6, 0, 0.6]) P.push({ k: 'shard', c: [12, k, 6.6 + bob], h: 1.4, w: 0.4, lean: 1.2 });
  P.push({ k: 'band', a: [-1.8, -3.4, 9.4 + bob], b: [-1.8, 3.4, 9.4 + bob], w: 1.8, col: team });   // a strip of colony cloth across its back
  for (const [x, h] of [[-6, 2.6], [-3.6, 3.8], [-1.2, 5], [1.2, 5.6], [3.6, 4.4], [5.8, 3]] as Pt[]) P.push({ k: 'shard', c: [x, 0, 10 + bob], h, w: 1.1, lean: -0.3 });
  drawRig(g, a, P);
}

Object.assign(VEHICLE_ART, {
  shardkin: { hull: drawShardkin, reach: 11, height: 26, frames: 4, turn: 10 },
  burrower: { hull: drawBurrower, reach: 14, height: 30, frames: 4, turn: 8 },
  choir:    { hull: drawChoir,    reach: 10, height: 34, frames: 4, turn: 9 },
  delver: { hull: drawDelverRig, reach: 15, height: 18, frames: 4, turn: 8 },
  cairn:  { hull: drawCairn,  reach: 18, height: 34, frames: 4, turn: 2.5 },
});
Object.assign(BUILDING_ART, {
  hearthstone: drawHearthstone, tunnelmouth: drawTunnelMouth, geode: drawGeode, grotto: drawGrotto, echo: drawEcho,
});
Object.assign(TURRET_ART, {
  echo: { head: drawEchoHead, pivot: [16, 14], reach: 8, height: 24 },
});
