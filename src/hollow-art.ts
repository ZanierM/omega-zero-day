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

function drawDelver(g: Ctx, a: number, team: string, phase = 0) {
  // a long, low tunnel-runner on four legs: quartz hide in plates, a ridge of crystal down its spine
  const t = phase * Math.PI * 2, z = 5.5 + Math.abs(Math.sin(t)) * 0.9;
  shadow(g, 1, 2, 12, 5.5);
  const limb = (x: number, side: number, ph: number) => {
    const sw = Math.sin(t + ph) * 2.6, lift = Math.max(0, Math.cos(t + ph)) * 1.4;
    const [hx, hy] = rotP(x, side * 2.6, a), [kx, ky] = rotP(x + sw * 0.5 + 1, side * 4.4, a), [fx, fy] = rotP(x + sw, side * 5, a);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = QUARTZ.dk; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(hx, hy - z); g.lineTo(kx, ky - z * 0.55 - lift); g.lineTo(fx, fy - lift); g.stroke();
    g.strokeStyle = QUARTZ.lt; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(hx, hy - z - 0.6); g.lineTo(kx, ky - z * 0.55 - lift - 0.6); g.stroke();
    g.fillStyle = CRY.mid; g.beginPath(); g.arc(fx, fy - lift, 1, 0, Math.PI * 2); g.fill();   // crystal claws
  };
  const legs: [number, number, number][] = [[5, -1, 0], [5, 1, Math.PI], [-5, -1, Math.PI], [-5, 1, 0]];
  const near = (side: number) => rotP(0, side, a)[1] > 0;
  for (const [x, sd, ph] of legs) if (!near(sd)) limb(x, sd, ph);
  // the body: belly, then overlapping hide plates front to back
  const body: Pt[] = [[-10, 0], [-7, -3.4], [3, -3.8], [8, -2.6], [10, 0], [8, 2.6], [3, 3.8], [-7, 3.4]].map(([x, y]) => { const p = rotP(x, y, a); return [p[0], p[1] - z]; });
  const bg = g.createLinearGradient(0, -z - 4, 0, -z + 4);
  bg.addColorStop(0, QUARTZ.lt); bg.addColorStop(0.55, QUARTZ.mid); bg.addColorStop(1, QUARTZ.dk);
  poly(g, body, bg);
  for (const x of [-6, -2.5, 1, 4.5]) {
    const p1 = rotP(x + 1.5, -3.3, a), p2 = rotP(x + 1.5, 3.3, a);   // the edge of each hide plate
    g.strokeStyle = 'rgba(40,60,66,0.45)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(p1[0], p1[1] - z - 0.4); g.quadraticCurveTo((p1[0] + p2[0]) / 2 + 1, (p1[1] + p2[1]) / 2 - z - 1.6, p2[0], p2[1] - z - 0.4); g.stroke();
  }
  // a strip of colony cloth across the back, in clan colours
  const [s0x, s0y] = rotP(-3.5, -3.6, a), [s1x, s1y] = rotP(-3.5, 3.6, a), [s2x, s2y] = rotP(-1.8, 3.6, a), [s3x, s3y] = rotP(-1.8, -3.6, a);
  poly(g, [[s0x, s0y - z - 0.6], [s1x, s1y - z - 0.6], [s2x, s2y - z - 0.6], [s3x, s3y - z - 0.6]], team, 'rgba(0,0,0,0.4)', 0.5);
  // the spine ridge, tallest over the shoulders
  for (const [x, h] of [[-7, 3], [-4.5, 4.5], [-2, 5.6], [0.5, 6.4], [3, 5.2], [5.5, 3.6]] as Pt[]) { const [sx, sy] = rotP(x, 0, a); shard(g, sx, sy - z - 2.6, h, 1.15, -0.25 * Math.cos(a)); }
  // the head: a wedge of quartz, glowing eyes, a jaw of crystal teeth
  const head: Pt[] = [[8, -2.4], [13, -1.2], [14, 0], [13, 1.2], [8, 2.4]].map(([x, y]) => { const p = rotP(x, y, a); return [p[0], p[1] - z - 0.5]; });
  poly(g, head, QUARTZ.lt);
  for (const sd of [-1, 1]) { const [ex, ey] = rotP(11.5, sd * 1.1, a); glowAt(g, ex, ey - z - 1.2, 2.4, 'rgba(160,255,245,0.9)'); g.fillStyle = CRY.hi; g.fillRect(ex - 0.4, ey - z - 1.6, 0.8, 0.8); }
  for (const sd of [-0.6, 0, 0.6]) { const [tx, ty] = rotP(13.6, sd, a); g.fillStyle = CRY.lt; g.beginPath(); g.moveTo(tx - 0.4, ty - z); g.lineTo(tx + Math.cos(a), ty - z + 1.4); g.lineTo(tx + 0.4, ty - z); g.fill(); }
  for (const [x, sd, ph] of legs) if (near(sd)) limb(x, sd, ph);
}

function drawCairn(g: Ctx, a: number, team: string, phase = 0) {
  // stones the Hollow sang into walking: faceted rock bound by veins of light, a hull plate for a shield
  const t = phase * Math.PI * 2, bob = Math.abs(Math.sin(t)) * 1.2;
  shadow(g, 1, 2, 17, 8);
  // legs: two stacked stones each, stepping
  for (const sd of [-1, 1]) {
    const sw = Math.sin(t + (sd > 0 ? 0 : Math.PI)) * 3.2, lift = Math.max(0, Math.cos(t + (sd > 0 ? 0 : Math.PI))) * 2;
    const [fx, fy] = rotP(sw, sd * 7.5, a);
    if (rotP(0, sd, a)[1] > 0) continue;
    stone(g, fx, fy - lift, 4.6, 3, 5, 11 + sd);
  }
  const [bx, by] = rotP(-1, 0, a), z = 9 + bob;
  stone(g, bx, by - z + 4, 12, 7.5, 13, 3);                                    // the trunk
  stone(g, bx + 1, by - z - 10, 8.5, 5.5, 9, 7, { ...STONE, lt: '#6e6876' });    // the shoulders
  stone(g, bx - 0.5, by - z - 20, 5, 3.5, 6, 9);                                // the head-stone
  // veins of light in the seams, and the singing crystal set in its chest
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(120,250,240,0.75)'; g.lineWidth = 0.9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx - 7, by - z - 4); g.quadraticCurveTo(bx - 2, by - z - 9, bx + 6, by - z - 6);
  g.moveTo(bx - 3, by - z - 14); g.lineTo(bx + 2, by - z - 19); g.stroke(); g.restore();
  for (const [x, y, h, w, lean] of [[-6, -15, 12, 2.2, -0.35], [4, -17, 15, 2.6, 0.12], [0, -27, 9, 1.8, 0], [7, -11, 8, 1.8, 0.45]] as number[][]) shard(g, bx + x, by - z + y, h, w, lean);
  glowAt(g, bx, by - z - 8, 13, 'rgba(120,250,240,0.4)');
  const [ex, ey] = rotP(3, 0, a); glowAt(g, bx + ex * 0.4, by - z - 21 + ey * 0.4, 3, 'rgba(200,255,250,0.95)');   // its one eye
  // the shield: a slab of the Meridian's hull, held out front, banded in clan colour
  const [px, py] = rotP(8, -3, a);
  hullPlate(g, [[px - 5, py - z - 15], [px + 4, py - z - 17], [px + 5, py - z - 3], [px - 4, py - z - 1]], 'MER');
  g.fillStyle = team; g.fillRect(px - 4.4, py - z - 9.5, 9, 1.6);
  for (const sd of [-1, 1]) {
    const sw = Math.sin(t + (sd > 0 ? 0 : Math.PI)) * 3.2, lift = Math.max(0, Math.cos(t + (sd > 0 ? 0 : Math.PI))) * 2;
    const [fx, fy] = rotP(sw, sd * 7.5, a);
    if (rotP(0, sd, a)[1] <= 0) continue;
    stone(g, fx, fy - lift, 4.6, 3, 5, 11 + sd);
  }
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

Object.assign(VEHICLE_ART, {
  delver: { hull: drawDelver, reach: 15, height: 16, frames: 4, turn: 8 },
  cairn:  { hull: drawCairn,  reach: 18, height: 46, frames: 4, turn: 2.5 },
});
Object.assign(BUILDING_ART, {
  hearthstone: drawHearthstone, tunnelmouth: drawTunnelMouth, geode: drawGeode, grotto: drawGrotto, echo: drawEcho,
});
Object.assign(TURRET_ART, {
  echo: { head: drawEchoHead, pivot: [16, 14], reach: 8, height: 24 },
});
