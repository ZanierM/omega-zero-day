// The creature rig, shared by the Hollow and the Vey brood: a body is a
// handful of parts placed in 3D (x forward, y to the side, z up), projected
// for the unit's heading and drawn back to front, so limbs pass in front of
// and behind the body the right way as it turns and walks. Also the faceted
// stone and crystal both factions grow.

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];
export interface Tone { dk: string; mid: string; lt: string; hi: string }

export const STONE: Tone = { dk: '#242128', mid: '#3e3a44', lt: '#625c69', hi: '#8c8592' };
export const CRY = { hi: '#effffd', lt: '#9af6f1', mid: '#46c4c8', dk: '#16707c', deep: '#0b3a42' };

export const rotP = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
export function rng(seed: number) { let r = seed * 9301 + 49297; return () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647; }

export function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
export function poly(g: Ctx, pts: Pt[], fill: string | CanvasGradient, edge: string | null = 'rgba(8,10,14,0.6)', lw = 0.7) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath(); g.fillStyle = fill; g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}
export function shadow(g: Ctx, x: number, y: number, rx: number, ry: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, 'rgba(6,8,12,0.45)'); gr.addColorStop(1, 'rgba(6,8,12,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

// a faceted stone: a ring of points lifted into a low-poly lump, lit from the north-west
export function stone(g: Ctx, cx: number, cy: number, rx: number, ry: number, h: number, seed: number, t: Tone = STONE) {
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
export function shard(g: Ctx, x: number, y: number, h: number, w: number, lean = 0) {
  const tx = x + lean * h, ty = y - h, mx = x + lean * h * 0.35;
  poly(g, [[x - w, y], [tx, ty], [mx, y - h * 0.3], [x - w * 0.2, y + w * 0.3]], CRY.dk, 'rgba(4,30,36,0.7)', 0.5);
  poly(g, [[x - w * 0.2, y + w * 0.3], [mx, y - h * 0.3], [tx, ty], [x + w, y]], CRY.mid, 'rgba(4,30,36,0.7)', 0.5);
  const ig = g.createLinearGradient(x, y, tx, ty);
  ig.addColorStop(0, 'rgba(160,255,250,0)'); ig.addColorStop(1, 'rgba(220,255,252,0.65)');
  poly(g, [[mx, y - h * 0.3], [tx, ty], [x + w * 0.45, y - h * 0.1]], ig, null);
  g.strokeStyle = CRY.hi; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x + w * 0.1, y - h * 0.05); g.lineTo(tx, ty); g.stroke();
}
// ---------------- the rig ----------------

export type V3 = [number, number, number];
export type Part =
  | { k: 'limb'; a: V3; b: V3; w: number; w2?: number; t: Tone }    // a tapered capsule: thigh, forearm, neck
  | { k: 'blob'; c: V3; rx: number; ry: number; t: Tone; rot?: number; veins?: number }   // a rounded mass: torso, head, shoulder
  | { k: 'cloth'; c: V3; r0: number; z1: number; r1: number; t: Tone; trim: string }   // a draped skirt or robe, from a waist ring down to a ragged hem
  | { k: 'shard'; c: V3; h: number; w: number; lean: number }       // a crystal growing out of the body
  | { k: 'glow'; c: V3; r: number; col: string }
  | { k: 'rock'; c: V3; rx: number; ry: number; h: number; seed: number }   // a faceted stone: the Cairn is made of these
  | { k: 'band'; a: V3; b: V3; w: number; col: string }             // cloth, a strap, a sash
  | { k: 'plate'; c: V3; rx: number; ry: number; h: number; t: Tone; ridge?: string; veins?: number };   // a domed chitin shell segment, long along the body

export function proj(p: V3, a: number): Pt { const [x, y] = rotP(p[0], p[1], a); return [x, y - p[2]]; }
export const depthOf = (p: V3, a: number) => rotP(p[0], p[1], a)[1] + p[2] * 0.002;
// glowing crystal veins under the skin of a rounded part
function skinVeins(g: Ctx, rx: number, ry: number, n: number) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(120,250,240,0.55)'; g.lineWidth = 0.45; g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const t0 = k * 2.39, x0 = Math.cos(t0) * rx * 0.2, y0 = Math.sin(t0) * ry * 0.2;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(Math.cos(t0 + 0.6) * rx * 0.6, Math.sin(t0 + 0.6) * ry * 0.5, Math.cos(t0 + 1) * rx * 0.85, Math.sin(t0 + 1) * ry * 0.85); g.stroke();
  }
  g.restore();
}

export function drawRig(g: Ctx, a: number, parts: Part[]) {
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
    } else if (q.k === 'plate') {
      // a shell segment: the dark lip on the ground side, then the dome stacked up
      // in lightening rings, a lit rim on the sun side and a ridge down its spine
      const [x, y] = proj(q.c, a);
      g.save(); g.translate(x, y);
      const ring = (dz: number, s: number, fill: string | CanvasGradient) => {
        g.save(); g.translate(0, -dz); g.rotate(a); g.fillStyle = fill;
        g.beginPath(); g.ellipse(0, 0, q.rx * s, q.ry * s, 0, 0, Math.PI * 2); g.fill(); g.restore();
      };
      ring(0, 1, 'rgba(8,4,10,0.75)');
      ring(q.h * 0.15, 0.98, q.t.dk);
      const dg = g.createRadialGradient(-q.rx * 0.3, -q.h - q.ry * 0.4, 0.3, 0, -q.h * 0.6, Math.max(q.rx, q.ry) * 1.1);
      dg.addColorStop(0, q.t.hi); dg.addColorStop(0.25, q.t.lt); dg.addColorStop(0.65, q.t.mid); dg.addColorStop(1, q.t.dk);
      ring(q.h * 0.55, 0.9, q.t.mid);
      ring(q.h, 0.78, dg);
      g.save(); g.translate(0, -q.h); g.rotate(a);
      g.strokeStyle = 'rgba(255,240,255,0.35)'; g.lineWidth = 0.6;
      g.beginPath(); g.ellipse(0, 0, q.rx * 0.78, q.ry * 0.78, 0, Math.PI * 0.9 - a, Math.PI * 1.6 - a); g.stroke();
      if (q.ridge) { g.strokeStyle = q.ridge; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-q.rx * 0.7, 0); g.lineTo(q.rx * 0.7, 0); g.stroke(); }
      if (q.veins) skinVeins(g, q.rx * 0.7, q.ry * 0.7, q.veins);
      g.restore();
      g.restore();
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
export function stride(phase: number, side: number, len: number, lift: number): [number, number] {
  const t = phase * Math.PI * 2 + (side > 0 ? 0 : Math.PI);
  return [Math.sin(t) * len, Math.max(0, Math.cos(t)) * lift];
}
