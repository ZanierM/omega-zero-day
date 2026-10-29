// The Vey brood: crystal grown through flesh. Everything here is soft, curved
// and lit from inside — no plates, rivets or straight edges — so it reads as
// alive next to the machined human factions. Same conventions as art.ts:
// units are drawn around their ground point with heading `a` (screen y minus
// height z); structures are drawn on their footprint, `w` pixels wide.

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
interface Tone { dk: string; mid: string; lt: string; hi: string }

const FLESH: Tone = { dk: '#47182f', mid: '#86345a', lt: '#c4678f', hi: '#f0a8c6' };   // kept bright: the bake darkens it
const CHITIN: Tone = { dk: '#231a26', mid: '#463650', lt: '#76627e', hi: '#b09cba' };
const CRY = { hi: '#d8fffd', lt: '#8ef4f0', mid: '#46c4c8', dk: '#1d7682' };

const rotP = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}

// a shaded, wet-looking lobe: dark rim, lit top-left, a specular sheen
function lobe(g: Ctx, x: number, y: number, rx: number, ry: number, rotA: number, t: Tone) {
  g.save(); g.translate(x, y); g.rotate(rotA);
  const gr = g.createRadialGradient(-rx * 0.35, -ry * 0.45, Math.min(rx, ry) * 0.1, 0, 0, Math.max(rx, ry));
  gr.addColorStop(0, t.lt); gr.addColorStop(0.55, t.mid); gr.addColorStop(1, t.dk);
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(10,2,8,0.55)'; g.lineWidth = 0.7; g.stroke();
  g.fillStyle = 'rgba(255,230,240,0.28)';
  g.beginPath(); g.ellipse(-rx * 0.35, -ry * 0.45, rx * 0.28, ry * 0.18, -0.4, 0, Math.PI * 2); g.fill();
  g.restore();
}

// a crystal spike pushing out of the flesh: lit face, dark face, a glint
function spike(g: Ctx, x: number, y: number, h: number, w: number, lean = 0) {
  const tx = x + lean * h, ty = y - h;
  g.fillStyle = CRY.dk; g.beginPath(); g.moveTo(x - w, y); g.lineTo(tx, ty); g.lineTo(x, y + w * 0.35); g.closePath(); g.fill();
  g.fillStyle = CRY.mid; g.beginPath(); g.moveTo(x, y + w * 0.35); g.lineTo(tx, ty); g.lineTo(x + w, y); g.closePath(); g.fill();
  g.strokeStyle = CRY.hi; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + w * 0.2, y); g.lineTo(tx, ty); g.stroke();
  g.strokeStyle = 'rgba(8,30,36,0.6)'; g.lineWidth = 0.5;
  g.beginPath(); g.moveTo(x - w, y); g.lineTo(tx, ty); g.lineTo(x + w, y); g.stroke();
}

// glowing veins wandering across a lobe
function veins(g: Ctx, x: number, y: number, rx: number, ry: number, n: number, seed: number, col: string) {
  let r = seed * 9301 + 49297;
  const rnd = () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647;
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = col; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a0 = rnd() * Math.PI * 2, a1 = a0 + (rnd() - 0.5) * 2;
    g.lineWidth = 0.6 + rnd() * 0.6;
    g.beginPath();
    g.moveTo(x + Math.cos(a0) * rx * 0.2, y + Math.sin(a0) * ry * 0.2);
    g.quadraticCurveTo(x + Math.cos(a1) * rx * 0.7, y + Math.sin(a1) * ry * 0.5, x + Math.cos(a0 + 0.6) * rx * 0.92, y + Math.sin(a0 + 0.6) * ry * 0.85);
    g.stroke();
  }
  g.restore();
}

// a jointed chitin leg from a hip to a foot, knee raised
function leg(g: Ctx, hx: number, hy: number, fx: number, fy: number, lift: number, wdt: number) {
  const kx = (hx + fx) / 2, ky = (hy + fy) / 2 - lift;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = CHITIN.dk; g.lineWidth = wdt + 1;
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
  g.strokeStyle = CHITIN.lt; g.lineWidth = wdt * 0.45;
  g.beginPath(); g.moveTo(hx, hy - 0.3); g.lineTo(kx, ky - 0.3); g.stroke();
  g.fillStyle = CRY.mid; g.beginPath(); g.arc(fx, fy, wdt * 0.45, 0, Math.PI * 2); g.fill();     // crystal-tipped foot
}

// --------------------------------------------------------------------------
// units

interface LegSpec { x: number; side: number; reach: number }
// legs on both sides; the far side is drawn before the body, the near side after
function walkLegs(g: Ctx, a: number, phase: number, z: number, legs: LegSpec[], wdt: number, stride: number, near: boolean) {
  for (const [i, l] of legs.entries()) {
    const swing = Math.sin(phase * Math.PI * 2 + (i % 2 ? Math.PI : 0)) * stride;
    const hip = rotP(l.x, l.side * 2.2, a), foot = rotP(l.x + swing, l.side * l.reach, a);
    if ((hip[1] > 0) !== near) continue;
    const lift = Math.max(0, Math.cos(phase * Math.PI * 2 + (i % 2 ? Math.PI : 0))) * 1.6;
    leg(g, hip[0], hip[1] - z, foot[0], foot[1] - lift, z * 0.6 + 2, wdt);
  }
}
function eyes(g: Ctx, a: number, x: number, z: number, team: string, spread = 1.4) {
  for (const s of [-1, 1]) {
    const [ex, ey] = rotP(x, s * spread, a);
    glowAt(g, ex, ey - z, 2.6, team + 'c0');
    g.fillStyle = '#fff4ff'; g.fillRect(ex - 0.4, ey - z - 0.4, 0.8, 0.8);
  }
}
function shadow(g: Ctx, rx: number, ry: number) {
  g.fillStyle = 'rgba(12,4,10,0.32)'; g.beginPath(); g.ellipse(1.5, 1.5, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

function drawSkitter(g: Ctx, a: number, team: string, phase = 0) {
  const z = 4 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.6;
  const legs: LegSpec[] = [{ x: 3, side: -1, reach: 6.5 }, { x: 3, side: 1, reach: 6.5 }, { x: 0, side: -1, reach: 7 }, { x: 0, side: 1, reach: 7 }, { x: -3, side: -1, reach: 6.5 }, { x: -3, side: 1, reach: 6.5 }];
  shadow(g, 7, 4);
  walkLegs(g, a, phase, z, legs, 1, 1.8, false);
  const [bx, by] = rotP(-0.5, 0, a);
  lobe(g, bx, by - z, 6, 3.6, a, FLESH);
  for (const x of [-3, -1, 1]) { const [sx, sy] = rotP(x, 0, a); spike(g, sx, sy - z - 2, 4 + (x + 3) * 0.6, 1.2, -0.15); }
  const [hx, hy] = rotP(5, 0, a);
  lobe(g, hx, hy - z, 2.8, 2.2, a, CHITIN);
  eyes(g, a, 6, z + 0.6, team, 1.1);
  walkLegs(g, a, phase, z, legs, 1, 1.8, true);
}

function drawSpitter(g: Ctx, a: number, team: string, phase = 0) {
  const z = 6 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.6;
  const legs: LegSpec[] = [{ x: 2.5, side: -1, reach: 7 }, { x: 2.5, side: 1, reach: 7 }, { x: -3, side: -1, reach: 7.5 }, { x: -3, side: 1, reach: 7.5 }];
  shadow(g, 8, 4.5);
  walkLegs(g, a, phase, z, legs, 1.3, 1.4, false);
  const [bx, by] = rotP(-1.5, 0, a);
  lobe(g, bx, by - z, 7, 4.4, a, FLESH);
  veins(g, bx, by - z, 7, 4.4, 4, 3, team + '80');
  for (const x of [-4, -2]) { const [sx, sy] = rotP(x, 0, a); spike(g, sx, sy - z - 2.5, 5.5, 1.5, -0.2); }
  // the throat sac: glowing crystal acid behind a thin skin
  const [tx, ty] = rotP(4.5, 0, a);
  g.save(); g.globalAlpha = 0.9; lobe(g, tx, ty - z - 1, 3.6, 3, a, { dk: '#1a5a66', mid: '#2fa6b0', lt: '#9af8f2', hi: '#fff' }); g.restore();
  glowAt(g, tx, ty - z - 1, 6, 'rgba(120,250,240,0.55)');
  eyes(g, a, 6.5, z + 1.5, team, 1.2);
  walkLegs(g, a, phase, z, legs, 1.3, 1.4, true);
}

function drawCarapace(g: Ctx, a: number, team: string, phase = 0) {
  const z = 7 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.5;
  const legs: LegSpec[] = [{ x: 6, side: -1, reach: 13 }, { x: 6, side: 1, reach: 13 }, { x: 0, side: -1, reach: 14 }, { x: 0, side: 1, reach: 14 }, { x: -6, side: -1, reach: 13 }, { x: -6, side: 1, reach: 13 }];
  shadow(g, 15, 9);
  walkLegs(g, a, phase, z, legs, 2.4, 2.2, false);
  // soft underbelly, then the shell over it
  const [bx, by] = rotP(-1, 0, a);
  lobe(g, bx, by - z + 2, 13, 8, a, FLESH);
  lobe(g, bx, by - z - 1, 12, 7.2, a, CHITIN);
  veins(g, bx, by - z - 1, 12, 7.2, 5, 11, team + '70');
  // crystal plates growing out of the shell's ridge
  for (const [x, s, h] of [[-8, -1, 6], [-4, 1, 8], [0, -1, 9], [4, 1, 7], [-2, 0, 11]] as [number, number, number][]) {
    const [sx, sy] = rotP(x, s * 2.5, a); spike(g, sx, sy - z - 3, h, 2.2, s * 0.15);
  }
  // mandibles
  for (const s of [-1, 1]) {
    const [m0x, m0y] = rotP(9, s * 3, a), [m1x, m1y] = rotP(14, s * 1.2, a);
    g.strokeStyle = CHITIN.dk; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m0x, m0y - z); g.quadraticCurveTo((m0x + m1x) / 2, (m0y + m1y) / 2 - z - 2, m1x, m1y - z + 1); g.stroke();
  }
  eyes(g, a, 10, z + 1, team, 2.2);
  walkLegs(g, a, phase, z, legs, 2.4, 2.2, true);
}

function drawMoth(g: Ctx, a: number, team: string, phase = 0) {
  const flap = Math.sin(phase * Math.PI * 2) * 0.25 + 0.85;     // wing spread
  // translucent membranes veined with light, back pair under the front pair
  for (const [x, span, len] of [[-3, 12, 9], [2, 15, 11]] as [number, number, number][]) {
    for (const s of [-1, 1]) {
      const root = rotP(x, s * 1.5, a), tip = rotP(x - len * 0.4, s * span * flap, a), trail = rotP(x - len, s * span * 0.55 * flap, a), lead = rotP(x + 3, s * span * 0.7 * flap, a);
      const gr = g.createLinearGradient(root[0], root[1], tip[0], tip[1]);
      gr.addColorStop(0, team + 'b0'); gr.addColorStop(0.6, 'rgba(160,240,250,0.45)'); gr.addColorStop(1, 'rgba(220,255,255,0.25)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(root[0], root[1]); g.quadraticCurveTo(lead[0], lead[1], tip[0], tip[1]); g.quadraticCurveTo(trail[0], trail[1], root[0], root[1]); g.fill();
      g.strokeStyle = 'rgba(230,255,255,0.55)'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(root[0], root[1]); g.lineTo(tip[0], tip[1]); g.moveTo(root[0], root[1]); g.lineTo((tip[0] + trail[0]) / 2, (tip[1] + trail[1]) / 2); g.stroke();
    }
  }
  const [bx, by] = rotP(0, 0, a);
  lobe(g, bx, by, 6.5, 2.4, a, FLESH);
  const [hx, hy] = rotP(5.5, 0, a);
  lobe(g, hx, hy, 2.4, 2, a, CHITIN);
  glowAt(g, bx - Math.cos(a) * 4, by - Math.sin(a) * 4, 6, team + '90');   // glowing abdomen
  eyes(g, a, 6.5, 0.4, team, 1);
}

function drawBehemoth(g: Ctx, a: number, team: string, phase = 0) {
  const z = 16 + Math.abs(Math.sin(phase * Math.PI * 2)) * 1;
  shadow(g, 24, 14);
  // four pillar legs, far pair first
  const legs: LegSpec[] = [{ x: 9, side: -1, reach: 11 }, { x: 9, side: 1, reach: 11 }, { x: -9, side: -1, reach: 11 }, { x: -9, side: 1, reach: 11 }];
  const pillar = (near: boolean) => legs.forEach((l, i) => {
    const swing = Math.sin(phase * Math.PI * 2 + (i === 0 || i === 3 ? 0 : Math.PI)) * 2.5;
    const hip = rotP(l.x, l.side * 6, a), foot = rotP(l.x + swing, l.side * l.reach, a);
    if ((hip[1] > 0) !== near) return;
    g.strokeStyle = FLESH.dk; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hip[0], hip[1] - z + 2); g.lineTo(foot[0], foot[1]); g.stroke();
    g.strokeStyle = FLESH.mid; g.lineWidth = 3.5; g.beginPath(); g.moveTo(hip[0] - 1, hip[1] - z + 2); g.lineTo(foot[0] - 1, foot[1] - 1); g.stroke();
    g.fillStyle = CHITIN.mid; g.beginPath(); g.ellipse(foot[0], foot[1], 3.5, 2, 0, 0, Math.PI * 2); g.fill();
  });
  pillar(false);
  const [bx, by] = rotP(-1, 0, a);
  lobe(g, bx, by - z + 3, 21, 12, a, FLESH);
  lobe(g, bx, by - z - 2, 18, 10, a, { dk: '#2a1020', mid: '#4e1e36', lt: '#7e3a5a', hi: '#c07898' });
  veins(g, bx, by - z - 2, 18, 10, 8, 23, team + '90');
  // the mortar: a forest of crystal spires on its back, the tallest one glowing
  for (const [x, s, h, w] of [[-10, -1, 12, 2.6], [-6, 1, 16, 3], [-2, -1, 20, 3.4], [2, 1, 15, 2.8], [6, -1, 11, 2.4], [-4, 0, 26, 4]] as [number, number, number, number][]) {
    const [sx, sy] = rotP(x, s * 4, a); spike(g, sx, sy - z - 6, h, w, s * 0.12);
  }
  const [cx, cy] = rotP(-4, 0, a);
  glowAt(g, cx, cy - z - 22, 9, 'rgba(140,255,250,0.6)');
  // head and tusks
  const [hx, hy] = rotP(18, 0, a);
  lobe(g, hx, hy - z + 1, 6, 5, a, CHITIN);
  for (const s of [-1, 1]) {
    const [t0x, t0y] = rotP(20, s * 3, a), [t1x, t1y] = rotP(27, s * 5, a);
    g.strokeStyle = '#e8dcc8'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(t0x, t0y - z + 2); g.quadraticCurveTo(t1x, t1y - z + 4, t1x + Math.cos(a) * 2, t1y - z - 2); g.stroke();
  }
  eyes(g, a, 22, z, team, 2.5);
  pillar(true);
}

export interface BroodUnitArt { hull: (g: Ctx, a: number, team: string, phase?: number) => void; reach: number; height: number; frames?: number; turn?: number }
export const BROOD_UNIT_ART: Record<string, BroodUnitArt> = {
  skitter:  { hull: drawSkitter,  reach: 10, height: 14, frames: 4, turn: 12 },
  spitter:  { hull: drawSpitter,  reach: 11, height: 16, frames: 4, turn: 9 },
  carapace: { hull: drawCarapace, reach: 18, height: 26, frames: 4, turn: 5 },
  moth:     { hull: drawMoth,     reach: 17, height: 8, frames: 4, turn: 6 },
  behemoth: { hull: drawBehemoth, reach: 30, height: 48, frames: 4, turn: 2.5 },
};

// --------------------------------------------------------------------------
// structures (footprint coordinates; things grow upward, screen y minus height)

function roots(g: Ctx, cx: number, cy: number, n: number, len: number, seed: number) {
  let r = seed * 7919 + 104729;
  const rnd = () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rnd() * 0.5, l = len * (0.6 + rnd() * 0.5);
    const ex = cx + Math.cos(ang) * l, ey = cy + Math.sin(ang) * l * 0.62;
    g.strokeStyle = FLESH.dk; g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(ang + 0.4) * l * 0.5, cy + Math.sin(ang + 0.4) * l * 0.35, ex, ey); g.stroke();
    g.strokeStyle = FLESH.mid; g.lineWidth = 1.3; g.stroke();
  }
}

function drawHeart(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  roots(g, 48, 66, 11, 46, 5);
  g.fillStyle = 'rgba(14,4,12,0.4)'; g.beginPath(); g.ellipse(50, 70, 44, 24, 0, 0, Math.PI * 2); g.fill();
  // the mound: lobes stacked back to front
  for (const [x, y, rx, ry] of [[30, 54, 18, 13], [66, 52, 19, 14], [48, 44, 26, 20], [34, 68, 17, 11], [64, 68, 18, 11]] as number[][]) lobe(g, x, y, rx, ry, 0, FLESH);
  veins(g, 48, 50, 38, 24, 12, 7, team + '90');
  // a crown of crystal round the core
  for (const [x, y, hh, ww, lean] of [[24, 46, 18, 4, -0.25], [36, 36, 26, 5, -0.12], [48, 30, 34 + level * 4, 6, 0], [60, 36, 24, 5, 0.12], [72, 46, 18, 4, 0.25], [42, 58, 14, 3.5, -0.1], [56, 58, 15, 3.5, 0.1]] as number[][]) spike(g, x, y, hh, ww, lean);
  // the beating core, seen through a split in the flesh
  lobe(g, 48, 56, 9, 6, 0, { dk: '#3a1850', mid: '#7a3aa8', lt: '#d8a0ff', hi: '#fff' });
  glowAt(g, 48, 56, 22, team + 'a0');
  glowAt(g, 48, 56, 8, 'rgba(255,240,255,0.8)');
  g.restore();
}

function drawBroodPod(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  roots(g, 32, 46, 7, 28, 2);
  lobe(g, 32, 48, 24, 10, 0, FLESH);
  // egg sacs: thin skin over something glowing
  for (const [x, y, r] of [[18, 36, 9], [44, 34, 10], [31, 26, 11], [22, 46, 7], [42, 46, 8]] as number[][]) {
    g.save(); g.globalAlpha = 0.92;
    lobe(g, x, y, r * 0.85, r, 0, { dk: '#3a1430', mid: '#8a3a68', lt: '#e6a0c8', hi: '#fff' });
    g.restore();
    glowAt(g, x, y + 1, r * 0.9, team + '90');
    g.fillStyle = 'rgba(20,4,16,0.5)'; g.beginPath(); g.ellipse(x + 1, y + 1, r * 0.25, r * 0.4, 0.3, 0, Math.PI * 2); g.fill();   // the thing inside
  }
  for (const [x, y, hh] of [[10, 44, 10], [54, 42, 12], [30, 14, 9]] as number[][]) spike(g, x, y, hh, 2.5, 0);
  g.restore();
}

function drawVeinWell(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  // claw-roots gripping a crystal cluster, drinking from it
  roots(g, 32, 44, 9, 30, 9);
  for (const [x, y, hh, ww, lean] of [[24, 42, 18, 5, -0.2], [32, 38, 26, 6, 0], [40, 42, 20, 5, 0.2], [28, 48, 12, 4, -0.1], [38, 49, 13, 4, 0.1]] as number[][]) spike(g, x, y, hh, ww, lean);
  for (const sd of [-1, 1]) {
    g.strokeStyle = CHITIN.dk; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32 + sd * 22, 50); g.quadraticCurveTo(32 + sd * 20, 20, 32 + sd * 6, 18); g.stroke();
    g.strokeStyle = CHITIN.lt; g.lineWidth = 1.4; g.stroke();
  }
  lobe(g, 32, 52, 12, 7, 0, FLESH);                    // the pumping bulb at the base
  veins(g, 32, 52, 12, 7, 5, 4, team + 'a0');
  glowAt(g, 32, 30, 16, 'rgba(140,255,250,0.45)');
  g.restore();
}

function drawBloomNode(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  roots(g, 16, 26, 6, 15, 3);
  g.strokeStyle = FLESH.mid; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(16, 26); g.quadraticCurveTo(12, 16, 16, 8); g.stroke();
  g.strokeStyle = FLESH.lt; g.lineWidth = 1; g.stroke();
  lobe(g, 16, 6, 6, 5.5, 0, { dk: '#3a1850', mid: '#7a3aa8', lt: '#d8a0ff', hi: '#fff' });
  glowAt(g, 16, 6, 11, team + 'b0');
  spike(g, 20, 24, 6, 1.6, 0.2);
  g.restore();
}

function drawSpineSpire(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  roots(g, 16, 27, 6, 15, 8);
  lobe(g, 16, 26, 9, 5, 0, FLESH);
  // a twisted stalk of flesh banded with chitin, ending in a crystal head
  for (let k = 0; k < 6; k++) {
    const y = 24 - k * 4.4, x = 16 + Math.sin(k * 0.9) * 1.6;
    lobe(g, x, y, 4.2 - k * 0.35, 2.6, 0, k % 2 ? CHITIN : FLESH);
  }
  for (const [x, hh, lean] of [[13, 10, -0.3], [16, 14, 0], [19, 10, 0.3]] as number[][]) spike(g, x, -1, hh, 2.4, lean);
  glowAt(g, 16, -6, 9, team + '90');
  g.restore();
}

export const BROOD_BUILDING_ART: Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void> = {
  heart: drawHeart, broodpod: drawBroodPod, veinwell: drawVeinWell, bloomnode: drawBloomNode, spinespire: drawSpineSpire,
};
