// The Keepers: the race that planted the Vey. Their things are the opposite of
// the brood's: still, precise and lit — polished gold and ivory over a dark
// violet enamel, crystal set into them like jewels, long tapering figures and
// stepped daises, nothing touching the ground that doesn't have to. Same
// conventions as art.ts (units around their ground point with heading `a`,
// screen y minus height; structures on their footprint), and registered into
// its tables the same way kessler-art.ts is.

import { VEHICLE_ART, BUILDING_ART, prism, chamfer, cylinder } from './art';
import type { Pt, Ctx } from './art';

interface Tone { dk: string; mid: string; lt: string; hi: string }

const GOLD: Tone = { dk: '#7a5820', mid: '#c49a4a', lt: '#f0d48a', hi: '#fff6dc' };
const IVORY: Tone = { dk: '#8c8678', mid: '#cdc6b4', lt: '#f2ecdf', hi: '#ffffff' };
// the dark lacquer under the gold, so the metal has something to shine against
const VOID: Tone = { dk: '#1c1626', mid: '#2e2540', lt: '#4a3d64', hi: '#6c5a8e' };
const CRY = { lt: '#a8fbf6', mid: '#4fd2d6', dk: '#1c7c88' };

const rotP = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
// a polished surface: a sheen from dark base to bright top
function sheen(g: Ctx, x0: number, y0: number, x1: number, y1: number, t: Tone) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, t.dk); gr.addColorStop(0.45, t.mid); gr.addColorStop(0.8, t.lt); gr.addColorStop(1, t.hi);
  return gr;
}
function poly(g: Ctx, pts: Pt[], fill: string | CanvasGradient, edge = 'rgba(40,28,8,0.55)') {
  g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath(); g.fill();
  g.strokeStyle = edge; g.lineWidth = 0.6; g.stroke();
}
function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, col: string | CanvasGradient, w: number) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
// an inset crystal: a small faceted lozenge with a glow
function jewel(g: Ctx, x: number, y: number, r: number) {
  poly(g, [[x, y - r * 1.3], [x + r, y], [x, y + r * 0.8], [x - r, y]], CRY.mid, 'rgba(8,40,44,0.6)');
  g.fillStyle = CRY.lt; g.beginPath(); g.moveTo(x, y - r * 1.3); g.lineTo(x + r * 0.5, y - r * 0.2); g.lineTo(x, y); g.closePath(); g.fill();
  glowAt(g, x, y - r * 0.3, r * 3, 'rgba(140,255,250,0.45)');
}
// a blade or vane in two halves, lit on the sun side and shaded on the other
function blade(g: Ctx, base: Pt, tip: Pt, half: number, t: Tone) {
  const dx = tip[0] - base[0], dy = tip[1] - base[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * half, ny = dx / l * half;
  const mid: Pt = [base[0] + dx * 0.35, base[1] + dy * 0.35];
  poly(g, [base, [mid[0] - nx, mid[1] - ny], tip], sheen(g, base[0], base[1], tip[0], tip[1], t));
  poly(g, [base, [mid[0] + nx, mid[1] + ny], tip], t.dk);
  line(g, base[0], base[1], tip[0], tip[1], t.hi, 0.4);
}
// a ring floating in the air: its back half (drawn before what it circles) or its front
function ring(g: Ctx, x: number, y: number, rx: number, ry: number, front: boolean, w = 1.6) {
  g.strokeStyle = front ? GOLD.lt : GOLD.dk; g.lineWidth = w;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
  if (front) { g.strokeStyle = GOLD.hi; g.lineWidth = w * 0.3; g.stroke(); }
}
// the hover glow every Keeper unit floats on
function hoverPool(g: Ctx, rx: number, ry: number, team: string) {
  g.fillStyle = 'rgba(10,8,4,0.3)'; g.beginPath(); g.ellipse(2, 2, rx, ry, 0, 0, Math.PI * 2); g.fill();
  glowAt(g, 0, 0, rx * 1.1, team + '66');
  g.strokeStyle = team + '88'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(0, 0, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); g.stroke();
}

// --------------------------------------------------------------------------
// the robed figure (Acolyte, Seraph, Oracle): tall and narrow, a dark enamel
// under-robe between ivory panels, a gold sash and mantle with layered
// pauldrons, two cloth tails trailing behind it, and a long crested head
// whose lit eye-slit looks where it's facing

interface RobeOpts { hood?: boolean; tails?: string }
function robed(g: Ctx, a: number, z: number, wide: number, tall: number, team: string, phase: number, o: RobeOpts = {}) {
  const sway = Math.sin(phase * Math.PI * 2) * 1.2, cx = 0, base = -z;
  const sh = base - tall;                                       // shoulder line
  // two cloth tails streaming back from the waist, behind the body when it faces the viewer
  const tails = () => {
    for (const sd of [-1, 1]) {
      const [rx, ry] = rotP(-1, sd * wide * 0.5, a), [ex, ey] = rotP(-8 - sway * sd, sd * (wide * 0.7 + 1), a);
      const y0 = base - tall * 0.5;
      poly(g, [[cx + rx - 0.8, y0 + ry], [cx + rx + 0.8, y0 + ry], [cx + ex + 0.6, ey + base + 4 + sway], [cx + ex - 1.2, ey + base + 3 + sway]], o.tails ?? IVORY.mid, 'rgba(60,50,30,0.5)');
      line(g, cx + ex - 1.2, ey + base + 3 + sway, cx + ex + 0.6, ey + base + 4 + sway, team, 0.8);
    }
  };
  const behind = Math.sin(a) > -0.25;
  if (behind) tails();
  // under-robe in dark enamel, flaring at the hem
  poly(g, [[cx - wide - 1.2, base + 1], [cx + wide + 1.2, base + 1], [cx + wide * 0.62, sh], [cx - wide * 0.62, sh]], sheen(g, cx, base, cx, sh, VOID), 'rgba(10,6,16,0.7)');
  // the ivory outer panels, open at the front, with a fold line each
  for (const sd of [-1, 1]) {
    poly(g, [[cx + sd * (wide + 1.2), base + 1], [cx + sd * wide * 0.3, base + 1], [cx + sd * wide * 0.22, sh + 1], [cx + sd * wide * 0.62, sh]], sheen(g, cx, base, cx, sh, IVORY), 'rgba(80,70,50,0.55)');
    line(g, cx + sd * wide * 0.75, base, cx + sd * wide * 0.45, sh + tall * 0.35, 'rgba(90,80,60,0.4)', 0.5);
  }
  // a seam of team light down the open front, and filigree beads on it
  line(g, cx, base, cx, sh + 2, team, 0.7);
  for (let k = 1; k < 4; k++) { g.fillStyle = GOLD.hi; g.beginPath(); g.arc(cx, base - tall * k / 4.5, 0.45, 0, Math.PI * 2); g.fill(); }
  // gold sash at the waist with a jewel buckle
  const wy = base - tall * 0.45;
  poly(g, [[cx - wide * 0.9, wy + 1], [cx + wide * 0.9, wy + 1], [cx + wide * 0.82, wy - 0.8], [cx - wide * 0.82, wy - 0.8]], sheen(g, cx, wy + 1, cx, wy - 1, GOLD));
  jewel(g, cx, wy + 0.2, 0.7);
  // mantle and two layered pauldrons, each with a crystal stud
  poly(g, [[cx - wide - 1.4, sh + 2], [cx + wide + 1.4, sh + 2], [cx + wide * 0.75, sh - 2.2], [cx - wide * 0.75, sh - 2.2]], sheen(g, cx, sh + 2, cx, sh - 2, GOLD));
  for (const sd of [-1, 1]) {
    const px = cx + sd * (wide + 0.6), py = sh + 0.5;
    for (const [dy, r, t] of [[1.4, 2.3, GOLD.dk], [0, 2.1, GOLD.mid]] as [number, number, string][]) {
      g.fillStyle = t; g.beginPath(); g.ellipse(px + sd * 0.3, py + dy, r, r * 0.75, sd * 0.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(60,40,10,0.55)'; g.lineWidth = 0.5; g.stroke();
    }
    g.fillStyle = GOLD.hi; g.beginPath(); g.ellipse(px - sd * 0.4, py - 0.6, 1, 0.5, sd * 0.4, 0, Math.PI * 2); g.fill();
    jewel(g, px, py - 0.4, 0.6);
  }
  // neck and the long head
  const hy = sh - 5;
  poly(g, [[cx - 1, sh - 1.5], [cx + 1, sh - 1.5], [cx + 0.8, sh - 3.5], [cx - 0.8, sh - 3.5]], GOLD.mid);
  const [fx] = rotP(1, 0, a);                                    // which way the face turns
  if (o.hood) {
    poly(g, [[cx - 3.4, hy + 3.6], [cx - 2.6, hy - 2.6], [cx, hy - 5], [cx + 2.6, hy - 2.6], [cx + 3.4, hy + 3.6]], sheen(g, cx, hy + 3, cx, hy - 5, IVORY));
    line(g, cx - 3.4, hy + 3.6, cx + 3.4, hy + 3.6, GOLD.mid, 0.8);
    g.fillStyle = '#120e18'; g.beginPath(); g.ellipse(cx + fx * 0.5, hy + 0.6, 1.8, 2.4, 0, 0, Math.PI * 2); g.fill();
    glowAt(g, cx + fx * 0.8, hy, 2.4, 'rgba(160,255,250,0.95)');
  } else {
    // a crest sweeping back from the crown, then the ivory head and a dark face plate
    const [bx, by] = rotP(-4.5, 0, a);
    poly(g, [[cx - 0.8, hy - 2.8], [cx + 0.8, hy - 2.8], [cx + bx, hy + by * 0.4 - 5.5]], sheen(g, cx, hy, cx + bx, hy - 5, GOLD));
    g.fillStyle = sheen(g, cx, hy + 3, cx, hy - 3.5, IVORY);
    g.beginPath(); g.ellipse(cx, hy, 2.3, 3.6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90,80,60,0.5)'; g.lineWidth = 0.5; g.stroke();
    if (Math.cos(a) > -0.6 || Math.sin(a) > 0) {
      poly(g, [[cx + fx * 0.9 - 1.6, hy - 0.6], [cx + fx * 0.9 + 1.6, hy - 0.6], [cx + fx * 0.9 + 1.1, hy + 2.4], [cx + fx * 0.9 - 1.1, hy + 2.4]], VOID.mid, 'rgba(10,6,16,0.6)');
      g.fillStyle = '#c4fffb'; g.fillRect(cx + fx * 1.1 - 1.2, hy + 0.1, 2.4, 0.7);
      glowAt(g, cx + fx * 1.1, hy + 0.4, 2.2, 'rgba(160,255,250,0.8)');
    }
    jewel(g, cx, hy - 3.3, 0.9);
  }
  if (!behind) tails();
  return { hy, sh, wy };
}

// --------------------------------------------------------------------------
// units

function drawAcolyte(g: Ctx, a: number, team: string, phase = 0) {
  const z = 5 + Math.sin(phase * Math.PI * 2) * 0.8;
  hoverPool(g, 6, 3.5, team);
  const { sh } = robed(g, a, z, 3.6, 13, team, phase);
  // the rifle: a long gold rod threaded through three floating rings, a light at the muzzle
  const ry = sh + 4, [r0x, r0y] = rotP(-1, 3, a), [r1x, r1y] = rotP(12, 3, a);
  line(g, r0x, r0y + ry, r1x, r1y + ry, VOID.dk, 2.2);
  line(g, r0x, r0y + ry, r1x, r1y + ry, GOLD.mid, 1.3);
  line(g, r0x, r0y + ry - 0.4, r1x, r1y + ry - 0.4, GOLD.hi, 0.4);
  for (const t of [0.45, 0.65, 0.85]) {
    const x = r0x + (r1x - r0x) * t, y = r0y + (r1y - r0y) * t + ry;
    g.strokeStyle = GOLD.lt; g.lineWidth = 0.7; g.beginPath(); g.ellipse(x, y, 1, 1.9, a, 0, Math.PI * 2); g.stroke();
  }
  const [mx, my] = rotP(4, 3, a); jewel(g, mx, my + ry - 0.6, 0.8);
  glowAt(g, r1x, r1y + ry, 3.5, 'rgba(255,240,190,0.85)');
}

function drawSeraph(g: Ctx, a: number, team: string, phase = 0) {
  const t = phase * Math.PI * 2, z = 5 + Math.sin(t) * 0.8, hz = -z - 13;
  hoverPool(g, 8, 4.5, team);
  // four wing-vanes of gold fanned out behind the shoulders, their edges lit
  const flap = Math.sin(t) * 0.08;
  for (const sd of [-1, 1]) for (const [ang, len] of [[0.55, 13], [0.95, 11]] as [number, number][]) {
    const aa = ang + flap * sd, tip: Pt = [sd * Math.sin(aa) * len, hz - Math.cos(aa) * len + 2];
    blade(g, [sd * 2, hz + 1], tip, 1.5, GOLD);
    glowAt(g, tip[0], tip[1], 2, 'rgba(255,235,170,0.7)');
  }
  // its shield: a shell of hexagonal light around the whole figure
  g.save(); g.globalCompositeOperation = 'lighter';
  const sg = g.createRadialGradient(0, -z - 10, 4, 0, -z - 10, 13);
  sg.addColorStop(0, 'rgba(255,230,160,0)'); sg.addColorStop(0.85, 'rgba(255,230,160,0.1)'); sg.addColorStop(1, 'rgba(255,240,190,0.32)');
  g.fillStyle = sg; g.beginPath(); g.ellipse(0, -z - 10, 10, 13.5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,235,180,0.2)'; g.lineWidth = 0.5;
  for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + t * 0.2; g.beginPath(); g.moveTo(Math.cos(ang) * 4, -z - 10 + Math.sin(ang) * 6); g.lineTo(Math.cos(ang) * 9.5, -z - 10 + Math.sin(ang) * 13); g.stroke(); }
  g.restore();
  // a halo behind the head
  g.strokeStyle = 'rgba(255,225,150,0.85)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(0, -z - 20, 4.4, 1.7, 0, 0, Math.PI * 2); g.stroke();
  glowAt(g, 0, -z - 20, 5, 'rgba(255,225,150,0.35)');
  robed(g, a, z, 4.2, 13, team, phase, { tails: GOLD.mid });
  // two long blades of light, held low and outward
  for (const sd of [-1, 1]) {
    const [h0x, h0y] = rotP(2, sd * 4.8, a), [h1x, h1y] = rotP(9.5, sd * 6.6, a);
    const bg = g.createLinearGradient(h0x, h0y - z - 8, h1x, h1y - z - 3);
    bg.addColorStop(0, 'rgba(255,248,215,1)'); bg.addColorStop(1, 'rgba(255,220,140,0.25)');
    g.strokeStyle = bg; g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(h0x, h0y - z - 8); g.lineTo(h1x, h1y - z - 3.5); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,140,0.25)'; g.lineWidth = 3; g.stroke(); g.restore();
    poly(g, [[h0x - 1.4, h0y - z - 8.6], [h0x + 1.4, h0y - z - 8.6], [h0x + 0.5, h0y - z - 7], [h0x - 0.5, h0y - z - 7]], GOLD.lt);   // the guard
  }
  for (let k = 0; k < 3; k++) { const ang = t + k * 2.1; glowAt(g, Math.cos(ang) * 8, -z - 6 + Math.sin(ang) * 3, 1.6, 'rgba(255,240,190,0.8)'); }
}

function drawOracle(g: Ctx, a: number, team: string, phase = 0) {
  const t = phase * Math.PI * 2, z = 6 + Math.sin(t) * 0.6;
  hoverPool(g, 6.5, 3.8, team);
  // a slowly turning ring of glyphs at its feet
  g.strokeStyle = 'rgba(160,255,250,0.5)'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(0, -z + 1, 7.5, 2.6, 0, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) { const ang = t * 0.4 + k * Math.PI / 4; g.fillStyle = 'rgba(190,255,250,0.85)'; g.fillRect(Math.cos(ang) * 7.5 - 0.4, -z + 1 + Math.sin(ang) * 2.6 - 0.4, 0.9, 0.9); }
  const { hy } = robed(g, a, z, 3.4, 15, team, phase, { hood: true });
  // a tall staff ending in a crescent that cradles the seeing-crystal
  const [s0x, s0y] = rotP(3.2, 2.8, a), top = s0y - z - 30;
  line(g, s0x, s0y - z + 1, s0x, top + 3, VOID.dk, 2);
  line(g, s0x, s0y - z + 1, s0x, top + 3, GOLD.mid, 1.2);
  line(g, s0x - 0.3, s0y - z + 1, s0x - 0.3, top + 3, GOLD.hi, 0.35);
  for (const k of [0.3, 0.6]) jewel(g, s0x, s0y - z + 1 + (top + 3 - s0y + z - 1) * k, 0.5);
  g.strokeStyle = sheen(g, s0x, top + 4, s0x, top - 4, GOLD); g.lineWidth = 1.6;
  g.beginPath(); g.arc(s0x, top, 3.8, 0.2, Math.PI - 0.2, true); g.stroke();
  jewel(g, s0x, top - 0.5, 2.5);
  g.strokeStyle = 'rgba(160,255,250,0.6)'; g.lineWidth = 0.6;
  g.beginPath(); g.ellipse(s0x, top - 0.6, 5.8, 1.9, t * 0.5, 0, Math.PI * 2); g.stroke();
  glowAt(g, s0x, top - 0.6, 10, 'rgba(160,255,250,0.55)');
  // three glyph-shards turning about the head
  for (let k = 0; k < 3; k++) {
    const ang = t * 0.7 + k * 2.09, gx = Math.cos(ang) * 7, gy = hy - 2 + Math.sin(ang) * 2.4;
    poly(g, [[gx, gy - 2], [gx + 1.1, gy], [gx, gy + 1.4], [gx - 1.1, gy]], sheen(g, gx, gy + 1.4, gx, gy - 2, GOLD), 'rgba(60,40,10,0.5)');
  }
}

function drawLancer(g: Ctx, a: number, team: string) {
  const z = 6;
  hoverPool(g, 14, 7.5, team);
  const P = (pts: Pt[], s: number, dz: number) => pts.map(([x, y]) => { const p = rotP(x * s, y * s, a); return [p[0], p[1] - z - dz] as Pt; });
  // a long blade-like skimmer: an enamel keel, a gold shell over it, an ivory spine
  const hull: Pt[] = [[18, 0], [7, -5], [-9, -7], [-14, -3], [-14, 3], [-9, 7], [7, 5]];
  poly(g, P(hull, 1, -1), VOID.dk, 'rgba(10,6,16,0.7)');
  // the underside glow and the keel lights
  for (const x of [-6, 0, 6]) { const [lx, ly] = rotP(x, 0, a); glowAt(g, lx, ly - z + 2, 3.5, 'rgba(140,255,250,0.55)'); }
  const shell = P(hull, 0.94, 2);
  poly(g, shell, sheen(g, shell[3][0], shell[3][1], shell[0][0], shell[0][1], GOLD));
  // the plates of the shell, picked out with panel lines
  for (const [x0, y0, x1, y1] of [[6, -4.4, -8, -6], [6, 4.4, -8, 6], [-3, -6.2, -3, 6.2], [10, -2.6, 10, 2.6]]) {
    const [p0x, p0y] = rotP(x0, y0, a), [p1x, p1y] = rotP(x1, y1, a);
    line(g, p0x, p0y - z - 2.4, p1x, p1y - z - 2.4, 'rgba(70,46,10,0.6)', 0.5);
  }
  // enamel inlays along the flanks, edged in team light
  for (const sd of [-1, 1]) {
    const inl = P([[4, sd * 3.6], [-8, sd * 5.4], [-11, sd * 3], [2, sd * 2.4]], 1, 2.6);
    poly(g, inl, VOID.mid, 'rgba(10,6,16,0.6)');
    line(g, inl[0][0], inl[0][1], inl[1][0], inl[1][1], team, 0.8);
  }
  const ridge = P([[13, 0], [-10, 0]], 1, 4);
  line(g, ridge[0][0], ridge[0][1], ridge[1][0], ridge[1][1], IVORY.dk, 2.2);
  line(g, ridge[0][0], ridge[0][1] - 0.4, ridge[1][0], ridge[1][1] - 0.4, IVORY.lt, 1);
  const [jx, jy] = rotP(1, 0, a); jewel(g, jx, jy - z - 4.6, 1.8);
  // the lance: two prongs at the nose with a spear of light between them
  for (const sd of [-1, 1]) { const pr = P([[14, sd * 2.2], [21, sd * 1.2]], 1, 2); line(g, pr[0][0], pr[0][1], pr[1][0], pr[1][1], GOLD.lt, 1.1); }
  const [l0x, l0y] = rotP(14, 0, a), [l1x, l1y] = rotP(27, 0, a);
  line(g, l0x, l0y - z - 2, l1x, l1y - z - 2, 'rgba(255,245,210,0.95)', 1);
  glowAt(g, l1x, l1y - z - 2, 4.5, 'rgba(255,235,170,0.7)');
  // twin engines of cyan light at the tail, with a fading wake
  for (const sd of [-1, 1]) {
    const [ex, ey] = rotP(-14, sd * 3.5, a), [wx, wy] = rotP(-24, sd * 4.5, a);
    glowAt(g, ex, ey - z, 5.5, 'rgba(120,240,255,0.85)');
    const wg = g.createLinearGradient(ex, ey - z, wx, wy - z);
    wg.addColorStop(0, 'rgba(120,240,255,0.35)'); wg.addColorStop(1, 'rgba(120,240,255,0)');
    line(g, ex, ey - z, wx, wy - z, wg, 2.2);
  }
}

function drawLuminar(g: Ctx, a: number, team: string, phase = 0) {
  // a crystal core in a cage of three gold petals, inside slowly turning rings
  const spin = phase * Math.PI * 2, cy = -2;
  glowAt(g, 0, cy, 16, team + '70');
  ring(g, 0, cy, 12, 3.4, false, 1.5); ring(g, 0, cy, 9.5, 4.4, false, 1.2);
  for (let k = 0; k < 3; k++) {
    const ang = spin * 0.5 + a + k * 2.094, x = Math.cos(ang) * 6.5, y = Math.sin(ang) * 2.2;
    if (Math.sin(ang) < 0) blade(g, [x * 0.4, cy + 6 + y * 0.4], [x, cy - 8 + y], 1.8, GOLD);
  }
  const og = g.createRadialGradient(-1.5, cy - 1.5, 0.5, 0, cy, 5.5);
  og.addColorStop(0, '#ffffff'); og.addColorStop(0.4, '#bffaf6'); og.addColorStop(1, '#2a9aa6');
  g.fillStyle = og; g.beginPath(); g.moveTo(0, cy - 6.5); g.lineTo(4.4, cy); g.lineTo(0, cy + 5); g.lineTo(-4.4, cy); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(8,40,44,0.6)'; g.lineWidth = 0.6; g.stroke();
  glowAt(g, 0, cy, 8, 'rgba(160,255,250,0.6)');
  for (let k = 0; k < 3; k++) {
    const ang = spin * 0.5 + a + k * 2.094, x = Math.cos(ang) * 6.5, y = Math.sin(ang) * 2.2;
    if (Math.sin(ang) >= 0) blade(g, [x * 0.4, cy + 6 + y * 0.4], [x, cy - 8 + y], 1.8, GOLD);
  }
  ring(g, 0, cy, 12, 3.4, true, 1.5); ring(g, 0, cy, 9.5, 4.4, true, 1.2);
  for (let k = 0; k < 3; k++) { const ang = spin + k * 2.094 + a; jewel(g, Math.cos(ang) * 12, cy + Math.sin(ang) * 3.4, 1); }
}

function drawMonolith(g: Ctx, a: number, team: string, phase = 0) {
  const t = phase * Math.PI * 2, bob = Math.sin(t) * 1.2, z = 8 + bob;
  hoverPool(g, 16, 8.5, team);
  // a ring of gold at its foot
  ring(g, 0, -z + 2, 14, 5, false, 2);
  // floating segments of a great tapering obelisk: enamel faces with lit glyph lines, gold edges
  const segs: [number, number, number][] = [[0, 10, 9], [12, 22, 7.5], [24, 34, 6], [36, 44, 4]];
  for (const [z0, z1, half] of segs) {
    const lo = [rotP(-half, -half * 0.7, a), rotP(half, -half * 0.7, a), rotP(half, half * 0.7, a), rotP(-half, half * 0.7, a)];
    const top = (z1 - z0) * 0.12;
    for (let f = 0; f < 4; f++) {
      const p = lo[f], q = lo[(f + 1) % 4];
      if (p[1] + q[1] < -0.5) continue;                          // back faces hidden
      const face: Pt[] = [[p[0], p[1] - z - z0], [q[0], q[1] - z - z0], [q[0] * 0.9, q[1] * 0.9 - z - z1 + top], [p[0] * 0.9, p[1] * 0.9 - z - z1 + top]];
      const lit = (q[0] - p[0]) < 0;
      poly(g, face, sheen(g, 0, -z - z0, 0, -z - z1, lit ? VOID : { ...VOID, mid: VOID.dk, lt: VOID.mid }), 'rgba(10,6,16,0.7)');
      // gold edging along the face's top and bottom
      line(g, face[0][0], face[0][1], face[1][0], face[1][1], GOLD.mid, 1.1);
      line(g, face[3][0], face[3][1], face[2][0], face[2][1], GOLD.lt, 0.9);
      // a glyph line of light down the middle of the face
      const mx0 = (face[0][0] + face[1][0]) / 2, my0 = (face[0][1] + face[1][1]) / 2, mx1 = (face[3][0] + face[2][0]) / 2, my1 = (face[3][1] + face[2][1]) / 2;
      line(g, mx0, my0 - 1.5, mx1, my1 + 1.5, 'rgba(160,255,250,0.85)', 0.6);
      for (let k = 1; k < 3; k++) { const yy = my0 + (my1 - my0) * k / 3, xx = mx0 + (mx1 - mx0) * k / 3; line(g, xx - 1.2, yy, xx + 1.2, yy, 'rgba(160,255,250,0.7)', 0.5); }
    }
    jewel(g, 0, -z - z1 + top - 1, 1.2);
  }
  ring(g, 0, -z + 2, 14, 5, true, 2);
  // shards circling the column
  for (let k = 0; k < 4; k++) {
    const ang = t * 0.5 + k * Math.PI / 2, sx = Math.cos(ang) * 13, sy = -z - 22 + Math.sin(ang) * 4;
    poly(g, [[sx, sy - 3.5], [sx + 1.4, sy], [sx, sy + 2.4], [sx - 1.4, sy]], sheen(g, sx, sy + 2, sx, sy - 3, GOLD));
  }
  glowAt(g, 0, -z - 22, 12, team + '60');
  jewel(g, 0, -z - 48, 2.8);
  glowAt(g, 0, -z - 48, 8, 'rgba(160,255,250,0.5)');
}

function drawHerald(g: Ctx, a: number, team: string) {
  // a slim gold dart: layered swept wings with ivory leading edges and enamel inlays, a lit canopy, twin engines
  const P = (pts: Pt[]) => pts.map(([x, y]) => rotP(x, y, a));
  for (const sd of [-1, 1]) {
    const wing = P([[3, sd * 2], [-3, sd * 11], [-7.5, sd * 10.5], [-5, sd * 2.5]]);
    poly(g, wing, sheen(g, wing[0][0], wing[0][1], wing[2][0], wing[2][1], GOLD));
    const inl = P([[0, sd * 3.5], [-3.5, sd * 8.5], [-5.5, sd * 8.2], [-3.5, sd * 3.2]]);
    poly(g, inl, VOID.mid, 'rgba(10,6,16,0.6)');
    const edge = P([[3, sd * 2], [-3, sd * 11]]);
    line(g, edge[0][0], edge[0][1], edge[1][0], edge[1][1], IVORY.lt, 1.1);
    const [tx, ty] = rotP(-4.5, sd * 10.8, a); g.fillStyle = team; g.beginPath(); g.arc(tx, ty, 1.2, 0, Math.PI * 2); g.fill(); glowAt(g, tx, ty, 3.2, team + 'a0');
  }
  const hull = P([[14, 0], [6, -2.4], [-6, -2.6], [-9, -1.4], [-9, 1.4], [-6, 2.6], [6, 2.4]]);
  poly(g, hull, sheen(g, hull[3][0], hull[3][1], hull[0][0], hull[0][1], IVORY));
  const spine = P([[12, 0], [-8, 0]]);
  line(g, spine[0][0], spine[0][1], spine[1][0], spine[1][1], GOLD.mid, 0.9);
  const canopy = P([[8, 0], [4.5, -1.3], [2, 0], [4.5, 1.3]]);
  poly(g, canopy, 'rgba(120,240,245,0.9)', 'rgba(10,40,44,0.6)');
  glowAt(g, (canopy[0][0] + canopy[2][0]) / 2, (canopy[0][1] + canopy[2][1]) / 2, 3.5, 'rgba(160,255,250,0.6)');
  for (const sd of [-1, 1]) {
    const [ex, ey] = rotP(-9.5, sd * 1.4, a); glowAt(g, ex, ey, 4.5, 'rgba(120,240,255,0.85)');
    const [rx, ry] = rotP(-16, sd * 1.4, a); line(g, ex, ey, rx, ry, 'rgba(120,240,255,0.25)', 1.4);
  }
}

function drawArbiter(g: Ctx, a: number, team: string, phase = 0) {
  // a floating lens array: gold ring segments around a lens of gathered sunlight, three enamel-and-ivory vanes threaded to it
  const t = phase * Math.PI * 2, bob = Math.sin(t) * 1.4, z = 13 + bob, cy = -z - 12;
  hoverPool(g, 14, 7.5, team);
  for (let k = 0; k < 3; k++) {
    const ang = a + k * 2.094, [vx, vy] = rotP(10, 0, ang), [ix, iy] = rotP(3, 0, ang);
    poly(g, [[ix, iy - z + 3], [vx, vy - z + 7], [vx * 0.85, vy * 0.85 - z - 2], [ix * 1.2, iy * 1.2 - z - 1]], sheen(g, vx, vy - z + 7, vx, vy - z - 2, VOID), 'rgba(10,6,16,0.6)');
    line(g, vx, vy - z + 7, vx * 0.85, vy * 0.85 - z - 2, IVORY.lt, 1);
    jewel(g, vx * 0.92, vy * 0.92 - z + 2.5, 0.7);
    g.save(); g.globalCompositeOperation = 'lighter';
    line(g, vx * 0.9, vy * 0.9 - z, 0, cy, 'rgba(255,235,170,0.45)', 0.6); g.restore();
  }
  // the emitter beneath the lens, where the judgment comes out
  poly(g, [[-2.8, -z - 1], [2.8, -z - 1], [0, -z + 4.5]], sheen(g, 0, -z + 4, 0, -z - 1, GOLD));
  glowAt(g, 0, -z + 3.5, 4, 'rgba(255,220,140,0.75)');
  const lg = g.createRadialGradient(-2, cy - 2, 0.5, 0, cy, 9);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.35, 'rgba(255,244,205,0.95)'); lg.addColorStop(0.75, 'rgba(255,212,130,0.6)'); lg.addColorStop(1, 'rgba(255,190,90,0.2)');
  g.fillStyle = lg; g.beginPath(); g.ellipse(0, cy, 8.5, 9.5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.5;
  for (const r of [3, 5.8]) { g.beginPath(); g.ellipse(0, cy, r, r * 1.1, 0, 0, Math.PI * 2); g.stroke(); }
  for (let k = 0; k < 4; k++) {
    const a0 = t * 0.3 + k * Math.PI / 2 + 0.18, a1 = a0 + Math.PI / 2 - 0.36;
    g.strokeStyle = VOID.dk; g.lineWidth = 4; g.beginPath(); g.ellipse(0, cy, 11, 12, 0, a0, a1); g.stroke();
    g.strokeStyle = sheen(g, 0, cy + 11, 0, cy - 11, GOLD); g.lineWidth = 2.6; g.stroke();
    g.strokeStyle = GOLD.hi; g.lineWidth = 0.5; g.beginPath(); g.ellipse(0, cy, 11, 12, 0, a0 + 0.1, a1 - 0.1); g.stroke();
    jewel(g, Math.cos((a0 + a1) / 2) * 11, cy + Math.sin((a0 + a1) / 2) * 12, 0.9);
  }
  glowAt(g, 0, cy, 20, team + '50');
}

// --------------------------------------------------------------------------
// structures: stepped daises of ivory over enamel, gold trim, and light

// a stepped tier: an octagonal block with a gold rim along its top edge
function tier(g: Ctx, x0: number, y0: number, x1: number, y1: number, c: number, z0: number, z1: number, t: Tone) {
  const pts = chamfer(x0, y0, x1, y1, c);
  prism(g, pts, z0, z1, t.lt, t.mid);
  g.strokeStyle = GOLD.lt; g.lineWidth = 1; g.lineJoin = 'round';
  g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y - z1) : g.moveTo(x, y - z1)); g.closePath(); g.stroke();
}
// lights set into the front face of a tier
function frontLights(g: Ctx, x0: number, x1: number, y: number, z: number, n: number, col: string) {
  for (let k = 0; k < n; k++) { const x = x0 + (x1 - x0) * (k + 0.5) / n; g.fillStyle = col; g.fillRect(x - 0.9, y - z - 0.6, 1.8, 1.2); glowAt(g, x, y - z, 2.6, col); }
}
// a slim gold pylon with a crystal tip
function pylon(g: Ctx, x: number, y: number, z0: number, z1: number, team: string) {
  cylinder(g, x, y, 2.6, z0, z1, GOLD.lt, GOLD.mid);
  jewel(g, x, y - z1 - 2, 1.6);
  glowAt(g, x, y - z1 - 2, 5, team + '70');
}
// a crystal shard standing up out of something
function shard(g: Ctx, x: number, y: number, h: number, w: number, lean = 0) {
  const tip: Pt = [x + lean, y - h];
  poly(g, [[x - w, y], [x, y + w * 0.4], [x + w, y], tip], CRY.mid, 'rgba(8,40,44,0.6)');
  poly(g, [[x - w, y], [x, y + w * 0.4], tip], CRY.dk, 'rgba(8,40,44,0.5)');
  line(g, x + w * 0.4, y - h * 0.2, tip[0], tip[1] + 1, CRY.lt, 0.6);
}

function drawBeacon(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  pylon(g, 14, 24, 7, 24, team); pylon(g, 82, 24, 7, 24, team);
  tier(g, 4, 12, 92, 92, 22, 0, 7, IVORY);
  tier(g, 16, 24, 80, 82, 16, 7, 14, VOID);
  frontLights(g, 30, 66, 82, 10.5, 6, 'rgba(160,255,250,0.9)');
  tier(g, 28, 36, 68, 72, 10, 14, 20, IVORY);
  const cx = 48, by = 54 - 20;
  // rings hanging round the spire: back halves first
  const rings: [number, number][] = [[by - 18, 22], [by - 40, 15], [by - 60, 10]];
  for (const [y, r] of rings) ring(g, cx, y, r, r * 0.32, false, 2.2);
  // the spire: three tapering blades leaning into one another, a crystal heart between them
  const tall = 86 + level * 6;
  blade(g, [cx - 13, by], [cx - 2, by - 68], 5, GOLD);
  blade(g, [cx + 13, by], [cx + 2, by - 68], 5, GOLD);
  blade(g, [cx, by + 2], [cx, by - tall], 6, IVORY);
  for (const y of [by - 12, by - 30, by - 50]) line(g, cx - 4, y, cx + 4, y, GOLD.mid, 1);
  jewel(g, cx, by - 26, 4.5); jewel(g, cx, by - 52, 3);
  for (const [y, r] of rings) ring(g, cx, y, r, r * 0.32, true, 2.2);
  pylon(g, 14, 86, 7, 24, team); pylon(g, 82, 86, 7, 24, team);
  // its light going up into the sky
  const lg = g.createLinearGradient(cx, by - tall, cx, by - tall - 50);
  lg.addColorStop(0, 'rgba(255,240,190,0.7)'); lg.addColorStop(1, 'rgba(255,240,190,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = lg; g.fillRect(cx - 4, by - tall - 50, 8, 50); g.restore();
  glowAt(g, cx, by - tall, 16, team + 'a0');
  g.restore();
}

function drawSanctum(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  tier(g, 3, 10, 61, 61, 14, 0, 5, IVORY);
  tier(g, 9, 16, 55, 56, 10, 5, 8, VOID);
  const cx = 32, cy = 36, top = 30, R = 17;
  // a circle of team light on the floor where the summoned arrive
  g.strokeStyle = team; g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy - 8, 12, 9, 0, 0, Math.PI * 2); g.stroke();
  glowAt(g, cx, cy - 8, 14, team + '60');
  const posts = [0, 1, 2, 3, 4, 5].map(k => { const ang = k / 6 * Math.PI * 2 + Math.PI / 6; return [cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * 0.8, Math.sin(ang)] as [number, number, number]; });
  const apex: Pt = [cx, cy - top - 16];
  const rib = (x: number, y: number) => {
    g.strokeStyle = GOLD.dk; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y - top); g.quadraticCurveTo(x + (x - cx) * 0.15, apex[1] + 4, apex[0], apex[1]); g.stroke();
    g.strokeStyle = GOLD.lt; g.lineWidth = 0.9; g.stroke();
  };
  for (const [x, y, sn] of posts) if (sn < 0) { cylinder(g, x, y, 2.2, 8, top, GOLD.lt, GOLD.mid); rib(x, y); }
  // the held breath of light inside the cage
  glowAt(g, cx, cy - 26, 20, 'rgba(255,245,210,0.7)');
  const og = g.createRadialGradient(cx - 2, cy - 28, 1, cx, cy - 26, 8);
  og.addColorStop(0, '#ffffff'); og.addColorStop(0.5, '#fff0c8'); og.addColorStop(1, 'rgba(255,220,150,0.25)');
  g.fillStyle = og; g.beginPath(); g.arc(cx, cy - 26, 7, 0, Math.PI * 2); g.fill();
  // the ring the ribs spring from
  g.strokeStyle = GOLD.mid; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy - top, R, R * 0.8, 0, 0, Math.PI * 2); g.stroke();
  for (const [x, y, sn] of posts) if (sn >= 0) { cylinder(g, x, y, 2.2, 8, top, GOLD.lt, GOLD.mid); rib(x, y); jewel(g, x, y - top - 1, 1); }
  g.strokeStyle = GOLD.hi; g.lineWidth = 0.6; g.beginPath(); g.ellipse(cx, cy - top, R, R * 0.8, 0, 0, Math.PI); g.stroke();
  jewel(g, apex[0], apex[1] - 1, 2.6);
  glowAt(g, apex[0], apex[1], 8, team + '90');
  // the gateway at the front: an arch of gold with light pooling in it
  g.save(); g.globalCompositeOperation = 'lighter';
  const ag = g.createLinearGradient(0, 56, 0, 40); ag.addColorStop(0, team + 'a0'); ag.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ag; g.beginPath(); g.moveTo(25, 57); g.quadraticCurveTo(25, 40, 32, 39); g.quadraticCurveTo(39, 40, 39, 57); g.closePath(); g.fill(); g.restore();
  g.strokeStyle = GOLD.dk; g.lineWidth = 3; g.beginPath(); g.moveTo(25, 58); g.quadraticCurveTo(25, 39, 32, 38); g.quadraticCurveTo(39, 39, 39, 58); g.stroke();
  g.strokeStyle = GOLD.lt; g.lineWidth = 1.2; g.stroke();
  jewel(g, 32, 39, 1.4);
  g.restore();
}

function drawShrine(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  tier(g, 5, 14, 59, 59, 12, 0, 5, IVORY);
  // a basin of dark water with a cluster of crystal growing up out of it
  cylinder(g, 32, 40, 13, 5, 9, '#1c3a46', VOID.mid);
  g.strokeStyle = GOLD.lt; g.lineWidth = 1.2; g.beginPath(); g.arc(32, 31, 13, 0, Math.PI * 2); g.stroke();
  glowAt(g, 32, 31, 14, 'rgba(120,240,240,0.4)');
  // the arch's far foot, then the crystals, then its near foot so it frames them
  const arch = (col: string, wid: number) => { g.strokeStyle = col; g.lineWidth = wid; g.lineCap = 'round'; g.beginPath(); g.moveTo(11, 34); g.bezierCurveTo(10, -6, 54, -6, 53, 34); g.stroke(); };
  prism(g, chamfer(7, 30, 15, 38, 2), 5, 10, GOLD.lt, GOLD.mid);
  prism(g, chamfer(49, 30, 57, 38, 2), 5, 10, GOLD.lt, GOLD.mid);
  for (const [x, h, wd, ln] of [[26, 16, 3, -2], [38, 14, 2.6, 2], [32, 24, 3.6, 0], [29, 11, 2.2, -3], [35, 12, 2.2, 3]] as [number, number, number, number][]) shard(g, x, 31, h, wd, ln);
  arch(GOLD.dk, 5.5); arch(GOLD.mid, 3.5); arch(GOLD.hi, 0.9);
  // the crystal hanging from the arch, and threads of light down to the cluster
  line(g, 32, 4, 32, 9, GOLD.mid, 0.8);
  poly(g, [[32, 9], [36, 15], [32, 22], [28, 15]], CRY.mid, 'rgba(8,40,44,0.6)');
  g.fillStyle = CRY.lt; g.beginPath(); g.moveTo(32, 9); g.lineTo(34.5, 14.5); g.lineTo(32, 17); g.closePath(); g.fill();
  glowAt(g, 32, 15, 14, 'rgba(140,255,250,0.55)');
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const x of [27, 32, 37]) line(g, 32, 22, x, 30, 'rgba(160,255,250,0.5)', 0.7);
  g.restore();
  for (let k = 0; k < 5; k++) glowAt(g, 20 + k * 6, 24 - (k % 2) * 6, 1.6, 'rgba(255,240,190,0.85)');
  // two lantern posts at the front corners
  for (const x of [12, 52]) { cylinder(g, x, 54, 1.8, 5, 16, GOLD.lt, GOLD.mid); glowAt(g, x, 54 - 18, 5, team + 'b0'); g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(x, 54 - 18, 1.3, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

function drawArchive(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  tier(g, 3, 12, 61, 61, 14, 0, 6, IVORY);
  tier(g, 11, 20, 53, 54, 10, 6, 12, VOID);
  frontLights(g, 18, 46, 54, 9, 5, 'rgba(255,230,160,0.9)');
  tier(g, 19, 28, 45, 46, 7, 12, 17, GOLD);
  const cx = 32, cy = 37 - 17 - 20;
  // a pillar of light from the top tier up into the cube
  g.save(); g.globalCompositeOperation = 'lighter';
  const pg = g.createLinearGradient(cx, 37 - 17, cx, cy); pg.addColorStop(0, 'rgba(255,240,200,0.6)'); pg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = pg; g.fillRect(cx - 4, cy, 8, 37 - 17 - cy); g.restore();
  // tablets of gold orbiting the cube, each carved with a line of glyphs; the far ones first
  const tablets = [0, 1, 2, 3, 4].map(k => { const ang = k / 5 * Math.PI * 2 + 0.3; return [cx + Math.cos(ang) * 22, cy + 16 + Math.sin(ang) * 7, Math.sin(ang)] as [number, number, number]; });
  const tablet = (x: number, y: number) => {
    poly(g, [[x - 3, y - 9], [x + 3, y - 9], [x + 3, y], [x - 3, y]], sheen(g, x, y, x, y - 9, GOLD));
    for (const yy of [y - 7, y - 5, y - 3]) line(g, x - 2, yy, x + 2, yy, 'rgba(80,50,10,0.6)', 0.5);
  };
  for (const [x, y, sn] of tablets) if (sn < 0) tablet(x, y);
  // the cube of memory, turned on its point: three lit faces, an enamel core and a jewel at its heart
  poly(g, [[cx, cy - 15], [cx + 12, cy - 7], [cx, cy + 1], [cx - 12, cy - 7]], 'rgba(255,250,232,0.92)', 'rgba(200,160,80,0.85)');
  poly(g, [[cx - 12, cy - 7], [cx, cy + 1], [cx, cy + 15], [cx - 12, cy + 7]], 'rgba(236,222,190,0.85)', 'rgba(200,160,80,0.85)');
  poly(g, [[cx + 12, cy - 7], [cx, cy + 1], [cx, cy + 15], [cx + 12, cy + 7]], 'rgba(150,130,110,0.85)', 'rgba(200,160,80,0.85)');
  poly(g, [[cx, cy - 6], [cx + 5, cy - 3], [cx, cy], [cx - 5, cy - 3]], VOID.mid, 'rgba(10,6,16,0.6)');
  for (const k of [-1, 1]) line(g, cx + k * 6, cy - 11, cx + k * 6, cy + 11, 'rgba(160,120,50,0.6)', 0.5);
  jewel(g, cx, cy - 2, 3);
  glowAt(g, cx, cy, 24, 'rgba(255,240,200,0.45)');
  for (const [x, y, sn] of tablets) if (sn >= 0) tablet(x, y);
  glowAt(g, 32, 50, 30, team + '30');
  g.restore();
}

function drawObelisk(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  tier(g, 3, 8, 29, 30, 6, 0, 4, IVORY);
  tier(g, 8, 13, 24, 26, 4, 4, 8, VOID);
  const bob = 0, top = 19 - 8;
  // a floating blade of gold above the pedestal, inside a turning ring
  ring(g, 16, top - 10 + bob, 10, 3, false, 1.4);
  blade(g, [16, top + 2 + bob], [16, top - 34 + bob], 5, GOLD);
  line(g, 16, top - 30, 16, top - 2, 'rgba(255,248,220,0.9)', 0.7);
  poly(g, [[13, top - 12], [19, top - 12], [18, top - 8], [14, top - 8]], VOID.mid, 'rgba(10,6,16,0.6)');
  jewel(g, 16, top - 10, 2);
  ring(g, 16, top - 10 + bob, 10, 3, true, 1.4);
  glowAt(g, 16, top - 34, 6, 'rgba(255,240,190,0.7)');
  glowAt(g, 16, 19, 9, team + '70');
  g.restore();
}

Object.assign(VEHICLE_ART, {
  acolyte:  { hull: drawAcolyte,  reach: 11, height: 30, frames: 4, turn: 8 },
  lancer:   { hull: drawLancer,   reach: 27, height: 14, turn: 6 },
  luminar:  { hull: drawLuminar,  reach: 15, height: 12, frames: 4, turn: 4 },
  monolith: { hull: drawMonolith, reach: 18, height: 62, frames: 4, turn: 2 },
  seraph:   { hull: drawSeraph,   reach: 14, height: 34, frames: 4, turn: 8 },
  oracle:   { hull: drawOracle,   reach: 11, height: 38, frames: 4, turn: 8 },
  herald:   { hull: drawHerald,   reach: 16, height: 8, turn: 7 },
  arbiter:  { hull: drawArbiter,  reach: 14, height: 40, frames: 4, turn: 2.5 },
});
Object.assign(BUILDING_ART, {
  beacon: drawBeacon, sanctum: drawSanctum, archive: drawArchive, shrine: drawShrine, obelisk: drawObelisk,
});
