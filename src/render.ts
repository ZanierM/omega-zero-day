import { TILE, TEAM_COLORS, BUILDINGS, UNITS, PLAYER } from './config';
import { MAP_W, MAP_H, terrain, crystal, idx } from './map';
import { units, buildings, beams, booms, shells, explored, visible, tileOf, Unit, Building, canPlace, byId } from './game';
import { camera, selection, selectBox, placement } from './input';

// Renderer v4 — Kenney sprite assets on a pre-rendered noise terrain.
//  * terrain painted once into a big offscreen texture (per-pixel noise, craters, boulders)
//  * units use the pack's team-colored sets (blue/orange/green/grey), baked to size
//  * neutral structure sprites get a team-color tint wash
//  * fog of war is a tiny canvas scaled up with smoothing = soft edges

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let T = 0;

export function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
export function viewSize() {
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}

// ---------------- value noise ----------------

let nseed = 1234567;
function nrand() { nseed = (nseed * 16807) % 2147483647; return (nseed % 10000) / 10000; }
const NG = 128;
const ngrid = new Float32Array(NG * NG);
for (let i = 0; i < ngrid.length; i++) ngrid[i] = nrand();
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const g = (a: number, b: number) => ngrid[((b % NG + NG) % NG) * NG + ((a % NG + NG) % NG)];
  const v00 = g(xi, yi), v10 = g(xi + 1, yi), v01 = g(xi, yi + 1), v11 = g(xi + 1, yi + 1);
  return (v00 + (v10 - v00) * sx) + ((v01 + (v11 - v01) * sx) - (v00 + (v10 - v00) * sx)) * sy;
}
function fbm(x: number, y: number): number {
  return noise(x, y) * 0.55 + noise(x * 2.7, y * 2.7) * 0.3 + noise(x * 7.1, y * 7.1) * 0.15;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return [c, c.getContext('2d')!];
}

// ---------------- sprite images ----------------

const images = new Map<string, HTMLImageElement>();

const ROCK_SPRITES = ['env_09', 'env_10', 'env_11', 'env_12', 'env_13', 'env_03', 'env_04'];
const FLORA_SPRITES = ['env_16', 'env_17', 'env_18', 'env_19', 'env_14', 'env_15'];

// compass directions, indexed by round(facing / 45°): 0 = east, going clockwise
export const DIR8 = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;

export function dirIndex(facing: number): number {
  return ((Math.round(facing / (Math.PI / 4)) % 8) + 8) % 8;
}

function neededFiles(): string[] {
  const files = new Set<string>([...ROCK_SPRITES, ...FLORA_SPRITES, 'env_05']);
  for (const def of Object.values(BUILDINGS)) {
    if (!def.sprite) continue;
    for (const lvl of [1, 2, 3]) files.add(`${def.sprite}_${lvl}`);
  }
  for (const def of Object.values(UNITS))
    for (const d of DIR8) {
      files.add(`u_${def.model}${def.mstep}_${d}`);
      if (def.model !== 'car' && def.model !== 'drone') { // walkers have walk cycles
        files.add(`u_${def.model}${def.mstep}_${d}_w1`);
        files.add(`u_${def.model}${def.mstep}_${d}_w2`);
      }
    }
  return [...files];
}

export function loadSprites(): Promise<void> {
  const jobs = neededFiles().map(f => new Promise<void>(res => {
    const img = new Image();
    img.onload = () => { images.set(f, img); res(); };
    img.onerror = () => res(); // missing file → procedural fallback
    img.src = `sprites/${f}.png`;
  }));
  return Promise.all(jobs).then(() => {});
}

// ---------------- terrain texture ----------------

let terrainTex: HTMLCanvasElement;

function paintTerrain() {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const [tex, g] = makeCanvas(W, H);

  const img = g.createImageData(W, H);
  const d = img.data;
  // slope lighting: compare each pixel's height with its NW neighbours so the
  // noise reads as actual relief lit from the north-west
  const prevRow = new Float32Array(W);
  let left = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 90, y / 90);              // large dunes
      const detail = fbm(x / 34 + 300, y / 34);   // small bumps
      const hgt = n * 0.78 + detail * 0.22;
      const grain = noise(x / 3.1, y / 3.1);
      const m = hgt * 0.8 + grain * 0.2;

      // scorched world under a dying sun: rust dust, ash flats, charred scrub
      let r = 66 + m * 42, gg = 42 + m * 26, b = 32 + m * 18;
      const ashMix = Math.max(0, (noise(x / 140 + 40, y / 140) - 0.55) * 2.2);
      r = r * (1 - ashMix) + (56 + m * 26) * ashMix;
      gg = gg * (1 - ashMix) + (50 + m * 24) * ashMix;
      b = b * (1 - ashMix) + (48 + m * 22) * ashMix;
      const veg = Math.max(0, (noise(x / 60 + 200, y / 60 + 90) - 0.62) * 2.6) * (0.5 + grain);
      r = r * (1 - veg) + (38 + m * 16) * veg;
      gg = gg * (1 - veg) + (28 + m * 12) * veg;
      b = b * (1 - veg) + (20 + m * 8) * veg;

      // relief shading from height difference vs W and N neighbours
      if (x > 0 && y > 0) {
        const slope = (hgt - left) + (hgt - prevRow[x]);
        const lit = Math.max(-15, Math.min(18, slope * 1100));
        r += lit; gg += lit; b += lit * 0.9;
      }
      left = hgt;
      prevRow[x] = hgt;

      const i = (y * W + x) * 4;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // impact craters
  const craters = Math.floor(MAP_W * MAP_H / 90);
  for (let n = 0; n < craters; n++) {
    const cx = nrand() * W, cy = nrand() * H, r = 8 + nrand() * 26;
    const grd = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    grd.addColorStop(0, 'rgba(10,8,18,0.5)');
    grd.addColorStop(0.7, 'rgba(10,8,18,0.18)');
    grd.addColorStop(1, 'rgba(10,8,18,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(180,170,210,0.10)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, r * 0.75, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  }

  // hairline cracks
  g.strokeStyle = 'rgba(8,6,14,0.35)';
  g.lineWidth = 1;
  const cracks = Math.floor(MAP_W * MAP_H / 40);
  for (let n = 0; n < cracks; n++) {
    let x = nrand() * W, y = nrand() * H;
    let a = nrand() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      a += (nrand() - 0.5) * 1.2;
      x += Math.cos(a) * (6 + nrand() * 10);
      y += Math.sin(a) * (6 + nrand() * 10);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // helper: stamp a prop sprite with a soft cast shadow
  const stamp = (file: string, cx: number, cy: number, size: number) => {
    const im = images.get(file);
    if (!im) return;
    const s = size / Math.max(im.width, im.height);
    const dw = im.width * s, dh = im.height * s;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(cx + 3, cy + dh * 0.36, dw * 0.42, dh * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.imageSmoothingEnabled = true;
    g.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
  };

  // rock formations: darkened base + Kenney rock sprites
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      if (terrain[idx(tx, ty)] !== 1) continue;
      const px = tx * TILE, py = ty * TILE;
      const grd = g.createRadialGradient(px + 16, py + 16, 4, px + 16, py + 16, 26);
      grd.addColorStop(0, 'rgba(12,10,20,0.75)');
      grd.addColorStop(1, 'rgba(12,10,20,0.2)');
      g.fillStyle = grd;
      g.fillRect(px - 6, py - 6, TILE + 12, TILE + 12);
    }
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      if (terrain[idx(tx, ty)] !== 1) continue;
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
      stamp(ROCK_SPRITES[Math.floor(nrand() * ROCK_SPRITES.length)],
        px + (nrand() - 0.5) * 8, py + (nrand() - 0.5) * 8, 34 + nrand() * 14);
    }

  // scattered alien flora on open ground (purely decorative)
  const props = Math.floor(MAP_W * MAP_H / 60);
  for (let n = 0; n < props; n++) {
    const tx = 1 + Math.floor(nrand() * (MAP_W - 2));
    const ty = 1 + Math.floor(nrand() * (MAP_H - 2));
    const i = idx(tx, ty);
    if (terrain[i] !== 0 || crystal[i] > 0) continue;
    const file = FLORA_SPRITES[Math.floor(nrand() * FLORA_SPRITES.length)];
    const tall = file === 'env_17' || file === 'env_19';
    stamp(file, tx * TILE + TILE / 2 + (nrand() - 0.5) * 14, ty * TILE + TILE / 2 + (nrand() - 0.5) * 14,
      tall ? 30 + nrand() * 16 : 18 + nrand() * 10);
  }

  terrainTex = tex;
}

// ---------------- baked sprites ----------------

const sprites = new Map<string, HTMLCanvasElement>();

// ---- realism post-processing (runs once per sprite at bake time) ----

// directional relight: NW highlight fading to SE shade, masked to the sprite's alpha
function relight(c: HTMLCanvasElement, strength: number) {
  const g = c.getContext('2d')!;
  const [tmp, tg] = makeCanvas(c.width, c.height);
  tg.drawImage(c, 0, 0);
  tg.globalCompositeOperation = 'source-in';
  const grd = tg.createLinearGradient(0, 0, c.width * 0.85, c.height);
  grd.addColorStop(0, `rgba(255,250,235,${strength})`);
  grd.addColorStop(0.45, 'rgba(255,255,255,0)');
  grd.addColorStop(1, `rgba(8,8,30,${strength * 1.1})`);
  tg.fillStyle = grd;
  tg.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'overlay';
  g.drawImage(tmp, 0, 0);
  g.globalCompositeOperation = 'source-over';
}

// weathering: fine grime specks and streaks, masked to the sprite
function weather(c: HTMLCanvasElement, amount: number) {
  const g = c.getContext('2d')!;
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < amount; i++) {
    const dark = nrand() < 0.72;
    g.fillStyle = dark ? `rgba(10,10,18,${0.05 + nrand() * 0.10})` : `rgba(255,255,255,${0.04 + nrand() * 0.06})`;
    const s = 1 + nrand() * 2;
    g.fillRect(nrand() * c.width, nrand() * c.height, s, s * (0.5 + nrand() * 1.6));
  }
  g.globalCompositeOperation = 'source-over';
}

// black silhouette of a canvas, for extrusion shadows
function silhouetteOf(c: HTMLCanvasElement): HTMLCanvasElement {
  const [sil, sg] = makeCanvas(c.width, c.height);
  sg.drawImage(c, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#000';
  sg.fillRect(0, 0, c.width, c.height);
  return sil;
}

// weathered concrete foundation slab that buildings sit on
function drawApron(g: CanvasRenderingContext2D, w: number, h: number) {
  const grd = g.createLinearGradient(0, 0, w * 0.7, h);
  grd.addColorStop(0, '#3e414c'); grd.addColorStop(0.5, '#33363f'); grd.addColorStop(1, '#25272f');
  g.fillStyle = grd;
  rr(g, 1, 1, w - 2, h - 2, 4);
  g.fill();
  // concrete speckle
  for (let i = 0; i < w * h / 26; i++) {
    g.fillStyle = nrand() < 0.6 ? `rgba(0,0,0,${0.06 + nrand() * 0.10})` : `rgba(255,255,255,${0.03 + nrand() * 0.05})`;
    g.fillRect(2 + nrand() * (w - 4), 2 + nrand() * (h - 4), 1 + nrand() * 1.6, 1 + nrand() * 1.6);
  }
  // panel seams
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 1;
  for (let x = 32; x < w - 4; x += 32) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x, h - 3); g.stroke(); }
  for (let y = 32; y < h - 4; y += 32) { g.beginPath(); g.moveTo(3, y); g.lineTo(w - 3, y); g.stroke(); }
  // cracks
  for (let n = 0; n < Math.max(1, w * h / 3000); n++) {
    let x = nrand() * w, y = nrand() * h, a = nrand() * Math.PI * 2;
    g.strokeStyle = 'rgba(0,0,0,0.30)';
    g.beginPath(); g.moveTo(x, y);
    for (let s2 = 0; s2 < 4; s2++) {
      a += (nrand() - 0.5) * 1.3;
      x += Math.cos(a) * (3 + nrand() * 6); y += Math.sin(a) * (3 + nrand() * 6);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // lit top-left edge, shaded bottom-right edge
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.beginPath(); g.moveTo(2, h - 3); g.lineTo(2, 2); g.lineTo(w - 3, 2); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.moveTo(w - 2, 2); g.lineTo(w - 2, h - 2); g.lineTo(2, h - 2); g.stroke();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// paint translucent light/shade only where the canvas already has pixels
function bakeLighting(g: CanvasRenderingContext2D, w: number, h: number, strength = 1) {
  g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, 0, w, h); // sun from the NW
  lg.addColorStop(0, `rgba(255,246,220,${0.22 * strength})`);
  lg.addColorStop(0.45, 'rgba(255,255,255,0)');
  lg.addColorStop(1, `rgba(8,6,20,${0.34 * strength})`);
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

// weathering: sparse dark grime + rust speckles, clipped to existing pixels
function bakeGrime(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < n; i++) {
    const rust = nrand() < 0.3;
    g.fillStyle = rust ? `rgba(140,80,40,${0.10 + nrand() * 0.15})` : `rgba(8,8,14,${0.08 + nrand() * 0.14})`;
    const s = 1 + nrand() * 2.5;
    g.fillRect(nrand() * w, nrand() * h, s, s * (0.5 + nrand()));
  }
  g.globalCompositeOperation = 'source-over';
}

// bake one compass direction of an isometric unit, team-tinted.
// frame 0 = idle pose, frames 1/2 = walk cycle (falls back to idle art)
function bakeUnitSprite(defId: string, owner: number, variant: number): HTMLCanvasElement {
  const dir = Math.floor(variant / 3), frame = variant % 3;
  const def = UNITS[defId];
  const base = `u_${def.model}${def.mstep}_${DIR8[dir]}`;
  const img = (frame > 0 ? images.get(`${base}_w${frame}`) : undefined) ?? images.get(base);
  if (!img) {
    const [c, g] = makeCanvas(def.radius * 2, def.radius * 2);
    g.fillStyle = TEAM_COLORS[owner];
    g.beginPath(); g.arc(def.radius, def.radius, def.radius, 0, Math.PI * 2); g.fill();
    return c;
  }
  const scale = def.spriteH / img.height;
  const dw = Math.ceil(img.width * scale), dh = Math.ceil(img.height * scale);
  const [c, g] = makeCanvas(dw, dh);
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, dw, dh);
  // team identity wash (subtle on the player's own units)
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = TEAM_COLORS[owner];
  g.globalAlpha = owner === PLAYER ? 0.14 : 0.30;
  g.fillRect(0, 0, dw, dh);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // match the structures: NW sunlight + a light contrast/saturation lift
  bakeLighting(g, dw, dh, 0.55);
  punch(g, c, 0.22);
  return c;
}

// irregular disturbed-ground patch: scorch, dust and tracks — no hard edges
function bakeGroundPatch(g: CanvasRenderingContext2D, w: number, h: number) {
  for (let i = 0; i < 6; i++) {
    const cx = w * (0.25 + nrand() * 0.5), cy = h * (0.3 + nrand() * 0.5);
    const r = Math.min(w, h) * (0.3 + nrand() * 0.35);
    const grd = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    grd.addColorStop(0, `rgba(16,14,22,${0.28 + nrand() * 0.18})`);
    grd.addColorStop(1, 'rgba(16,14,22,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  // faint vehicle tracks leading south
  g.strokeStyle = 'rgba(12,10,18,0.30)'; g.lineWidth = 2.5;
  for (const off of [-5, 5]) {
    g.beginPath();
    g.moveTo(w / 2 + off, h * 0.6);
    g.quadraticCurveTo(w / 2 + off * 2, h * 0.85, w / 2 + off * 2.4, h);
    g.stroke();
  }
}

// cheap 2.5D: stack a darkened silhouette downwards, then the sprite on top —
// reads as the structure having real height
function extrude(g: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number, height: number) {
  const [sc, sg] = makeCanvas(Math.ceil(dw), Math.ceil(dh));
  sg.imageSmoothingEnabled = true;
  sg.drawImage(img, 0, 0, dw, dh);
  sg.globalCompositeOperation = 'source-atop';
  sg.fillStyle = 'rgba(10,10,20,0.88)';
  sg.fillRect(0, 0, dw, dh);
  for (let k = height; k >= 1; k--) {
    g.globalAlpha = 0.75;
    g.drawImage(sc, dx, dy + k);
  }
  g.globalAlpha = 1;
  g.imageSmoothingEnabled = true;
  g.drawImage(img, dx, dy, dw, dh);
}

// self-overlay blend: boosts contrast and saturation (works in every browser,
// unlike ctx.filter)
function punch(g: CanvasRenderingContext2D, c: HTMLCanvasElement, amount: number) {
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = amount;
  g.drawImage(c, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

// baked building canvases carry the offset of the footprint's top-left corner
export interface BldSprite extends HTMLCanvasElement { ox: number; oy: number }

function bakeBuildingSprite(defId: string, owner: number, level: number): BldSprite {
  const def = BUILDINGS[defId];
  const w = def.w * TILE, h = def.h * TILE;

  // isometric pack sprite: bake into a canvas that overflows the plot upward
  const img = def.sprite ? images.get(`${def.sprite}_${level}`) : undefined;
  if (img && !def.isWall) {
    const scale = Math.min((w * 1.3) / img.width, (h * 2.6) / img.height, 1);
    const dw = Math.ceil(img.width * scale), dh = Math.ceil(img.height * scale);
    const cw = Math.max(w, dw) + 14;
    const ch = h + Math.max(0, dh - h) + 12;
    const [c, g] = makeCanvas(cw, ch);
    const ox = (cw - w) / 2;            // footprint offset inside the canvas
    const oy = ch - h - 4;
    // disturbed ground within the footprint
    g.save(); g.translate(ox, oy);
    bakeGroundPatch(g, w, h);
    g.restore();
    // grounding shadow: a soft skewed quad cast to the south-east, hugging the
    // base of the structure (no floating-disc look)
    const bx = cw / 2, by = oy + h - 1;
    const grd = g.createLinearGradient(bx, by - dh * 0.3, bx + dw * 0.3, by + 6);
    grd.addColorStop(0, 'rgba(0,0,0,0.0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(bx - dw * 0.48, by - dh * 0.30);
    g.lineTo(bx + dw * 0.52, by - dh * 0.30);
    g.lineTo(bx + dw * 0.60, by + 4);
    g.lineTo(bx - dw * 0.38, by + 4);
    g.closePath(); g.fill();
    // sprite planted on the plot's south edge
    g.imageSmoothingEnabled = true;
    g.drawImage(img, bx - dw / 2, by - dh, dw, dh);
    // faction tint wash, then a gentle contrast/saturation lift
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = TEAM_COLORS[owner];
    g.globalAlpha = owner === PLAYER ? 0.08 : 0.20;
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    punch(g, c, 0.22);
    const s = c as BldSprite; s.ox = ox; s.oy = oy;
    return s;
  }
  return bakeProceduralBuilding(defId, owner);
}

// walls, the pulse turret, and any missing art
function bakeProceduralBuilding(defId: string, owner: number): BldSprite {
  const def = BUILDINGS[defId];
  const w = def.w * TILE, h = def.h * TILE;
  const [c, g] = makeCanvas(w, h);

  if (def.isWall) {
    // procedural plasteel wall segment (bulwark variant is darker composite armor)
    const heavy = defId === 'heavywall';
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (heavy) { grd.addColorStop(0, '#6d747f'); grd.addColorStop(0.45, '#3d434e'); grd.addColorStop(1, '#181c26'); }
    else { grd.addColorStop(0, '#8a90a2'); grd.addColorStop(0.45, '#5a6072'); grd.addColorStop(1, '#2c3040'); }
    g.fillStyle = grd;
    g.fillRect(2, 2, w - 4, h - 4);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(4, 4, w - 8, 3);
    g.fillStyle = TEAM_COLORS[owner]; g.globalAlpha = 0.6;
    g.fillRect(4, h - 8, w - 8, 3); g.globalAlpha = 1;
    if (defId === 'heavywall') {
      // extra armor ribs + amber hazard corners
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(10, 3, 3, h - 6); g.fillRect(w - 13, 3, 3, h - 6);
      g.fillStyle = '#ffb02e';
      g.fillRect(3, 3, 5, 2); g.fillRect(w - 8, 3, 5, 2);
    }
    // rivet studs
    g.fillStyle = '#b9c0d0';
    for (const [rx, ry] of [[7, 8], [w - 7, 8], [7, h - 12], [w - 7, h - 12]]) {
      g.beginPath(); g.arc(rx, ry, 1.5, 0, Math.PI * 2); g.fill();
    }
    bakeLighting(g, w, h, 0.8);
    bakeGrime(g, w, h, 6);
  } else if (defId === 'sensor') {
    // radar station: armored base + mast (dish rotates live)
    bakeGroundPatch(g, w, h);
    const cx = w / 2;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(cx + 2, h - 7, w * 0.34, 4.5, 0, 0, Math.PI * 2); g.fill();
    const pg = g.createLinearGradient(cx - 8, 0, cx + 8, 0);
    pg.addColorStop(0, '#5a6480'); pg.addColorStop(0.5, '#39415a'); pg.addColorStop(1, '#20263a');
    g.fillStyle = pg;
    g.fillRect(cx - 8, h * 0.55, 16, h * 0.32);
    g.fillStyle = '#20263a';
    g.fillRect(cx - 2, h * 0.28, 4, h * 0.3); // mast
    g.fillStyle = TEAM_COLORS[owner]; g.globalAlpha = 0.8;
    g.fillRect(cx - 7, h - 12, 14, 2.5); g.globalAlpha = 1;
    g.fillStyle = '#8fd0ff';
    g.fillRect(cx - 6, h * 0.6, 3, 3); g.fillRect(cx + 3, h * 0.6, 3, 3);
  } else if (defId === 'repairyard') {
    // service pad: deck plating, corner posts, big maintenance chevron
    bakeGroundPatch(g, w, h);
    const dg = g.createLinearGradient(0, 6, 0, h - 6);
    dg.addColorStop(0, '#4d5568'); dg.addColorStop(0.5, '#39404f'); dg.addColorStop(1, '#232838');
    g.fillStyle = dg;
    g.fillRect(5, 7, w - 10, h - 14);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
    g.strokeRect(5, 7, w - 10, h - 14);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(5, 7 + (h - 14) * i / 4); g.lineTo(w - 5, 7 + (h - 14) * i / 4); g.stroke(); }
    for (const [px2, py2] of [[9, 11], [w - 9, 11], [9, h - 11], [w - 9, h - 11]] as const) {
      g.fillStyle = '#6b7590';
      g.fillRect(px2 - 3, py2 - 3, 6, 6);
      g.fillStyle = '#ffd76e';
      g.fillRect(px2 - 1.5, py2 - 1.5, 3, 3);
    }
    // green service cross (glow pulses live)
    g.fillStyle = '#3ddc84';
    g.fillRect(w / 2 - 3, h / 2 - 10, 6, 20);
    g.fillRect(w / 2 - 10, h / 2 - 3, 20, 6);
    g.strokeStyle = TEAM_COLORS[owner]; g.globalAlpha = 0.7; g.lineWidth = 2;
    g.strokeRect(6.5, 8.5, w - 13, h - 17); g.globalAlpha = 1;
  } else if (defId === 'arctower') {
    // tesla pylon: dark pedestal, insulator rings, crackling orb on top
    bakeGroundPatch(g, w, h);
    const cx = w / 2;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(cx + 2, h - 7, w * 0.36, 5, 0, 0, Math.PI * 2); g.fill();
    const pg = g.createLinearGradient(cx - 6, 0, cx + 6, 0);
    pg.addColorStop(0, '#4a4066'); pg.addColorStop(0.5, '#2a2440'); pg.addColorStop(1, '#181428');
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(cx - 7, h - 6); g.lineTo(cx - 3.5, h * 0.3); g.lineTo(cx + 3.5, h * 0.3); g.lineTo(cx + 7, h - 6);
    g.closePath(); g.fill();
    g.fillStyle = '#6f639a';
    for (const ry of [h * 0.42, h * 0.58, h * 0.74]) g.fillRect(cx - 6, ry, 12, 2.5);
    // orb (pulse glow drawn live)
    const og = g.createRadialGradient(cx - 2, h * 0.24, 1, cx, h * 0.26, 6.5);
    og.addColorStop(0, '#f2e3ff'); og.addColorStop(0.5, '#b48aff'); og.addColorStop(1, '#4a2a80');
    g.fillStyle = og;
    g.beginPath(); g.arc(cx, h * 0.26, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = TEAM_COLORS[owner]; g.globalAlpha = 0.8; g.lineWidth = 1.5;
    g.strokeRect(4.5, h - 8.5, w - 9, 4); g.globalAlpha = 1;
  } else if (defId === 'turret') {
    // armored gun emplacement (rotating barrels are drawn live)
    bakeGroundPatch(g, w, h);
    const cx = w / 2, cy = h / 2;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(cx + 2, cy + 4, w * 0.42, h * 0.3, 0, 0, Math.PI * 2); g.fill();
    const bg = g.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, w * 0.44);
    bg.addColorStop(0, '#8fa0be'); bg.addColorStop(0.55, '#51607e'); bg.addColorStop(1, '#232b3e');
    g.fillStyle = bg;
    g.beginPath(); g.arc(cx, cy, w * 0.40, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, w * 0.40, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = TEAM_COLORS[owner]; g.lineWidth = 2; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(cx, cy, w * 0.31, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = '#ffb02e';
    for (const a of [0.6, 2.2, 3.8, 5.4]) {
      g.beginPath(); g.arc(cx + Math.cos(a) * w * 0.36, cy + Math.sin(a) * w * 0.36, 1.8, 0, Math.PI * 2); g.fill();
    }
  } else {
    bakeGroundPatch(g, w, h);
    g.fillStyle = '#2a3040';
    g.fillRect(6, 6, w - 12, h - 12);
    g.strokeStyle = TEAM_COLORS[owner]; g.lineWidth = 2;
    g.strokeRect(6, 6, w - 12, h - 12);
  }
  const s = c as BldSprite; s.ox = 0; s.oy = 0;
  return s;
}

function sprite(kind: 'b' | 'u', defId: string, owner: number, variant = 0): HTMLCanvasElement {
  const key = `${kind}:${defId}:${owner}:${variant}`;
  let s = sprites.get(key);
  if (!s) {
    s = kind === 'b' ? bakeBuildingSprite(defId, owner, Math.max(1, variant)) : bakeUnitSprite(defId, owner, variant);
    sprites.set(key, s);
  }
  return s;
}
const bldSprite = (defId: string, owner: number, level: number) => sprite('b', defId, owner, level) as BldSprite;

// build-bar icon for procedurally drawn defences (turret, wall)
export function defenceIconUrl(defId: string): string {
  const s = bakeProceduralBuilding(defId, PLAYER);
  if (defId === 'turret') {
    // add static barrels so the icon reads as a gun
    const g = s.getContext('2d')!;
    const cx = s.width / 2, cy = s.height / 2;
    g.save();
    g.translate(cx, cy); g.rotate(-Math.PI / 4);
    g.strokeStyle = '#dfe7f2'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(2, -3); g.lineTo(15, -3); g.moveTo(2, 3); g.lineTo(15, 3); g.stroke();
    g.fillStyle = '#3f4b66';
    g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#20d6ff';
    g.beginPath(); g.arc(0, 0, 2, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  return s.toDataURL();
}

// ---------------- fog (soft) ----------------

let fogCanvas: HTMLCanvasElement, fogCtx: CanvasRenderingContext2D, fogImg: ImageData;

function updateFogTexture() {
  const d = fogImg.data;
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    d[i * 4] = 14; d[i * 4 + 1] = 5; d[i * 4 + 2] = 3;
    d[i * 4 + 3] = explored[i] ? (visible[i] ? 0 : 130) : 255;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}

// ---------------- init ----------------

export function initRenderer() {
  sprites.clear();
  paintTerrain();
  [fogCanvas, fogCtx] = makeCanvas(MAP_W, MAP_H);
  fogImg = fogCtx.createImageData(MAP_W, MAP_H);
}

// ---------------- live overlays per building ----------------

function g2Glow(x: number, y: number, r: number, color: string) {
  const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
}

function buildingOverlay(b: Building) {
  const px = b.tx * TILE, py = b.ty * TILE;
  const w = b.def.w * TILE, h = b.def.h * TILE;
  const cx = px + w / 2, cy = py + h / 2;
  switch (b.def.id) {
    case 'nexus': {
      // beacon on the pyramid peak (sprite overflows above the plot)
      const on = Math.sin(T * 4) > 0;
      g2Glow(cx, py - 6, on ? 4 : 2, on ? 'rgba(255,90,90,0.9)' : 'rgba(120,40,50,0.6)');
      break;
    }
    case 'extractor': {
      // refinery mast light + processing glow
      const a = 0.5 + Math.sin(T * 3) * 0.3;
      g2Glow(cx, cy + h * 0.1, 6, `rgba(67,243,236,${a})`);
      g2Glow(cx + w * 0.12, py - h * 0.45, 2.5, `rgba(255,176,46,${0.4 + Math.sin(T * 5) * 0.3})`);
      break;
    }
    case 'lab': {
      if (Math.sin(T * 5) > 0.2) g2Glow(cx, cy, 5, 'rgba(140,255,170,0.5)');
      break;
    }
    case 'spire': {
      // tower warning light, high above the plot
      const on = Math.sin(T * 2.6) > 0;
      g2Glow(cx, py - h * 1.1, on ? 3.5 : 1.5, on ? 'rgba(255,80,80,0.9)' : 'rgba(120,40,50,0.5)');
      break;
    }
    case 'sensor': {
      // rotating radar dish on the mast
      const mx = cx, my = py + h * 0.3;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(T * 1.2);
      ctx.strokeStyle = '#c8d6ec'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 9, -0.7, 0.7); ctx.stroke();
      ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.stroke();
      ctx.restore();
      if (Math.sin(T * 3) > 0.4) g2Glow(mx, my, 2.5, 'rgba(143,208,255,0.9)');
      break;
    }
    case 'repairyard': {
      // breathing repair-field glow
      const a = 0.18 + Math.sin(T * 2.4) * 0.1;
      g2Glow(cx, cy, w * 0.5, `rgba(61,220,132,${a})`);
      break;
    }
    case 'arctower': {
      // crackling tesla orb + occasional discharge flicker
      const cx2 = px + w / 2, orbY = py + h * 0.26 - 1;
      const pulse = 0.5 + Math.sin(T * 7 + b.id) * 0.3;
      g2Glow(cx2, orbY, 6 + pulse * 3, `rgba(180,138,255,${0.5 + pulse * 0.3})`);
      if (Math.sin(T * 11 + b.id * 2) > 0.86) {
        ctx.strokeStyle = 'rgba(220,190,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx2, orbY);
        ctx.lineTo(cx2 + (Math.random() * 16 - 8), orbY + 8 + Math.random() * 8);
        ctx.stroke();
      }
      break;
    }
    case 'bastion': {
      // rotating quad-cannon assembly on the silo pad
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(b.facing);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(1, 3, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
      const bgc = ctx.createRadialGradient(-3, -3, 1, 0, 0, 12);
      bgc.addColorStop(0, '#98a4c2'); bgc.addColorStop(0.6, '#525f80'); bgc.addColorStop(1, '#222941');
      ctx.fillStyle = bgc;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e6ecf8'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (const oy of [-6, -2, 2, 6]) { ctx.moveTo(4, oy); ctx.lineTo(30, oy); }
      ctx.stroke();
      ctx.fillStyle = '#aab4cc';
      for (const oy of [-6, -2, 2, 6]) ctx.fillRect(27, oy - 1.6, 4, 3.2);
      ctx.restore();
      const ready = b.cooldown < 0.15;
      g2Glow(cx, cy, 3, ready ? 'rgba(255,150,60,0.95)' : 'rgba(70,40,20,0.8)');
      break;
    }
    case 'turret':
    case 'railgun': {
      const heavy = b.def.id === 'railgun';
      const len = heavy ? 26 : 17;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(b.facing);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(1, 2, heavy ? 11 : 8, heavy ? 8 : 6, 0, 0, Math.PI * 2); ctx.fill();
      const tg = ctx.createRadialGradient(-2, -2, 1, 0, 0, heavy ? 10 : 7);
      tg.addColorStop(0, '#8b96b2'); tg.addColorStop(0.6, '#4d5872'); tg.addColorStop(1, '#20263a');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(0, 0, heavy ? 9 : 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#dfe7f2'; ctx.lineWidth = heavy ? 3.4 : 2.4;
      ctx.beginPath(); ctx.moveTo(3, -3); ctx.lineTo(len, -3); ctx.moveTo(3, 3); ctx.lineTo(len, 3); ctx.stroke();
      ctx.fillStyle = '#98a2b8'; ctx.fillRect(len - 3, -4.5, 3, 3); ctx.fillRect(len - 3, 1.5, 3, 3);
      ctx.restore();
      const charged = b.cooldown < 0.1;
      g2Glow(cx, cy, 2.5, charged ? 'rgba(32,214,255,0.95)' : 'rgba(20,50,70,0.8)');
      break;
    }
  }
  // upgrade level pips
  if (b.level > 1) {
    ctx.fillStyle = '#ffd76e';
    for (let i = 0; i < b.level - 1; i++) {
      ctx.beginPath(); ctx.arc(px + 7 + i * 8, py + h - 6, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------------- frame ----------------

function drawHealthBar(x: number, y: number, w: number, frac: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x, y, w, 4.5);
  ctx.fillStyle = frac > 0.5 ? '#3ddc84' : frac > 0.25 ? '#ffb02e' : '#e5484d';
  ctx.fillRect(x + 0.5, y + 0.5, (w - 1) * frac, 3.5);
}

function cornersSel(x: number, y: number, w: number, h: number) {
  const s = Math.min(8, w / 3);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + s); ctx.lineTo(x, y); ctx.lineTo(x + s, y);
  ctx.moveTo(x + w - s, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + s);
  ctx.moveTo(x + w, y + h - s); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - s, y + h);
  ctx.moveTo(x + s, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - s);
  ctx.stroke();
}

export function render() {
  if (!terrainTex) return; // not initialized yet (briefing screen)
  T = performance.now() / 1000;
  const vw = canvas.clientWidth, vh = canvas.clientHeight;
  const z = camera.zoom;
  const vwz = vw / z, vhz = vh / z; // visible world size at this zoom
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = '#0c0402';
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.scale(z, z);
  ctx.translate(-camera.x, -camera.y);

  ctx.drawImage(terrainTex, camera.x, camera.y, vwz, vhz, camera.x, camera.y, vwz, vhz);

  const tx0 = Math.max(0, Math.floor(camera.x / TILE));
  const ty0 = Math.max(0, Math.floor(camera.y / TILE));
  const tx1 = Math.min(MAP_W - 1, Math.ceil((camera.x + vwz) / TILE));
  const ty1 = Math.min(MAP_H - 1, Math.ceil((camera.y + vhz) / TILE));

  // crystals (dynamic: they deplete)
  for (let y = ty0; y <= ty1; y++)
    for (let x = tx0; x <= tx1; x++) {
      const i = idx(x, y);
      if (crystal[i] === 0 || !explored[i]) continue;
      const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
      const pulse = 0.8 + 0.2 * Math.sin(T * 2 + x * 1.7 + y * 2.3);
      g2Glow(cx, cy, TILE * 0.42 * pulse, 'rgba(67,243,236,0.16)');
      const s = (5 + (crystal[i] / 1000) * 9) * pulse;
      for (const [ox, oy, k] of [[0, 0, 1], [-8, 5, 0.55], [8, 6, 0.45]] as const) {
        const ss = s * k;
        const sg = ctx.createLinearGradient(cx + ox - ss, cy + oy - ss, cx + ox + ss, cy + oy + ss);
        sg.addColorStop(0, '#eafffe'); sg.addColorStop(0.45, '#43f3ec'); sg.addColorStop(1, '#0b7d78');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy + oy - ss); ctx.lineTo(cx + ox + ss * 0.6, cy + oy);
        ctx.lineTo(cx + ox, cy + oy + ss); ctx.lineTo(cx + ox - ss * 0.6, cy + oy);
        ctx.closePath(); ctx.fill();
      }
    }

  // buildings, sorted so southern (nearer) structures draw over northern ones
  const drawList = [...buildings].sort((a, b) => (a.ty + a.def.h) - (b.ty + b.def.h));
  for (const b of drawList) {
    const ci = idx(b.tx + Math.floor(b.def.w / 2), b.ty + Math.floor(b.def.h / 2));
    if (b.owner !== PLAYER && !explored[ci]) continue;
    const px = b.tx * TILE, py = b.ty * TILE;
    const w = b.def.w * TILE, h = b.def.h * TILE;
    const s = bldSprite(b.def.id, b.owner, b.level);
    ctx.drawImage(s, px - s.ox, py - s.oy);
    buildingOverlay(b);
    const sel = selection.has(b.id);
    if (sel || b.hp < b.maxHp) drawHealthBar(px + 4, py - 9, w - 8, b.hp / b.maxHp);
    if (b.upgrading) {
      // amber upgrade progress bar + wrench glint
      const frac = 1 - b.upgrading.remaining / b.upgrading.total;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(px + 4, py - 15, w - 8, 4.5);
      ctx.fillStyle = '#ffb02e';
      ctx.fillRect(px + 4.5, py - 14.5, (w - 9) * frac, 3.5);
      if (Math.sin(T * 6) > 0) g2Glow(px + w - 8, py + 6, 3, 'rgba(255,215,110,0.9)');
    }
    if (sel) cornersSel(px, py, w, h);
  }

  // units: 8-direction isometric sprites with 2-frame walk cycles
  for (const u of units) {
    if (u.owner !== PLAYER && !visible[idx(tileOf(u.x), tileOf(u.y))]) continue;
    const moving = !!u.path && u.path.length > 0;
    const frame = moving ? 1 + (Math.floor(T * 6 + u.id) % 2) : 0;
    const s = sprite('u', u.def.id, u.owner, dirIndex(u.facing) * 3 + frame);
    // flat sliver of shadow at the feet — offset SE like the buildings
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + s.height * 0.34, s.width * 0.42, s.height * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    if (u.def.harvester) {
      // hover drone: floats with a soft downdraft glow
      const bob = Math.sin(T * 3 + u.id) * 2;
      g2Glow(u.x, u.y + 6, 7, 'rgba(120,200,255,0.25)');
      ctx.drawImage(s, u.x - s.width / 2, u.y - s.height / 2 - 6 + bob);
    } else {
      ctx.drawImage(s, u.x - s.width / 2, u.y - s.height * 0.62);
    }
    if (u.def.harvester && u.cargo > 10) {
      g2Glow(u.x, u.y, 5 + (u.cargo / 500) * 5, `rgba(67,243,236,${0.25 + (u.cargo / 500) * 0.45})`);
    }
    const sel = selection.has(u.id);
    if (sel || u.hp < u.maxHp) {
      const w = u.def.radius * 2.2;
      drawHealthBar(u.x - w / 2, u.y - u.def.radius - 10, w, u.hp / u.maxHp);
    }
    if (sel) {
      const r = u.def.radius + 5;
      cornersSel(u.x - r, u.y - r, r * 2, r * 2);
    }
  }

  // projectiles: shells arc high, rockets fly flat with a flame trail
  for (const s2 of shells) {
    const p = Math.min(1, s2.t / s2.dur);
    const arc = s2.kind === 'shell' ? Math.sin(p * Math.PI) * 26 : Math.sin(p * Math.PI) * 6;
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(s2.x, s2.y, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    const py2 = s2.y - arc;
    if (s2.kind === 'rocket') {
      const ang = Math.atan2(s2.ty - s2.sy, s2.tx - s2.sx);
      g2Glow(s2.x - Math.cos(ang) * 6, py2 - Math.sin(ang) * 6, 3.5, 'rgba(255,170,80,0.8)');
      ctx.save(); ctx.translate(s2.x, py2); ctx.rotate(ang);
      ctx.fillStyle = '#e8eef8'; ctx.fillRect(-4, -1.5, 8, 3);
      ctx.fillStyle = '#ff7847'; ctx.fillRect(-6, -1, 2.5, 2);
      ctx.restore();
    } else {
      g2Glow(s2.x, py2, 3, 'rgba(255,200,120,0.7)');
      ctx.fillStyle = '#2a2e3a';
      ctx.beginPath(); ctx.arc(s2.x, py2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(s2.x - 1, py2 - 1, 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }

  // rally-point flag for a selected production building
  if (selection.size === 1) {
    const e = byId.get([...selection][0]);
    if (e?.kind === 'building' && e.owner === PLAYER && e.def.produces) {
      const c = { x: (e.tx + e.def.w / 2) * TILE, y: (e.ty + e.def.h / 2) * TILE };
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(61,220,132,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(e.rallyX, e.rallyY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.rallyX, e.rallyY + 4); ctx.lineTo(e.rallyX, e.rallyY - 12); ctx.stroke();
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath();
      ctx.moveTo(e.rallyX, e.rallyY - 12); ctx.lineTo(e.rallyX + 9, e.rallyY - 9); ctx.lineTo(e.rallyX, e.rallyY - 6);
      ctx.closePath(); ctx.fill();
    }
  }

  // weapon beams
  for (const bm of beams) {
    const a = Math.min(1, bm.ttl / 0.12);
    ctx.globalAlpha = a * 0.30;
    ctx.strokeStyle = bm.color; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
    ctx.globalAlpha = 1;
    g2Glow(bm.x1, bm.y1, 5 * a, bm.color);
    g2Glow(bm.x2, bm.y2, 4 * a, 'rgba(255,220,160,0.9)');
    ctx.lineCap = 'butt';
  }

  // explosions
  for (const bo of booms) {
    const life = Math.max(0, bo.ttl / 0.5);
    const fg = ctx.createRadialGradient(bo.x, bo.y, 0, bo.x, bo.y, bo.r * 1.2);
    fg.addColorStop(0, `rgba(255,240,200,${life})`);
    fg.addColorStop(0.35, `rgba(255,160,70,${life * 0.9})`);
    fg.addColorStop(0.8, `rgba(160,50,20,${life * 0.5})`);
    fg.addColorStop(1, 'rgba(60,20,10,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(bo.x, bo.y, bo.r * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = life * 0.8;
    ctx.strokeStyle = 'rgba(255,230,190,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bo.x, bo.y, bo.r * 1.6, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 7; k++) {
      const ang = k * 0.897 + bo.x;
      const dd = bo.r * (1.6 + (k % 3) * 0.3);
      ctx.fillStyle = k % 2 ? '#ffd76e' : '#ff8a4a';
      ctx.fillRect(bo.x + Math.cos(ang) * dd - 1.5, bo.y + Math.sin(ang) * dd - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // soft fog of war
  updateFogTexture();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, 0, 0, MAP_W, MAP_H, 0, 0, MAP_W * TILE, MAP_H * TILE);

  // building placement ghost
  if (placement) {
    const def = BUILDINGS[placement.defId];
    const ok = canPlace(PLAYER, placement.defId, placement.tx, placement.ty);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ok ? '#3ddc84' : '#e5484d';
    for (let y = 0; y < def.h; y++)
      for (let x = 0; x < def.w; x++)
        ctx.fillRect((placement.tx + x) * TILE + 1, (placement.ty + y) * TILE + 1, TILE - 2, TILE - 2);
    ctx.globalAlpha = 0.85;
    const gs = bldSprite(placement.defId, PLAYER, 1);
    ctx.drawImage(gs, placement.tx * TILE - gs.ox, placement.ty * TILE - gs.oy);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // vignette
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(26,6,2,0.30)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);

  if (selectBox) {
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 1;
    ctx.strokeRect(selectBox.x, selectBox.y, selectBox.w, selectBox.h);
    ctx.fillStyle = '#ffffff12';
    ctx.fillRect(selectBox.x, selectBox.y, selectBox.w, selectBox.h);
  }
}

// ---------------- minimap ----------------

const mm = document.getElementById('minimap') as HTMLCanvasElement;
const mmCtx = mm.getContext('2d')!;

export function renderMinimap() {
  if (!terrainTex) return;
  const sx = mm.width / MAP_W, sy = mm.height / MAP_H;
  mmCtx.imageSmoothingEnabled = true;
  mmCtx.drawImage(terrainTex, 0, 0, mm.width, mm.height);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (!explored[i]) { mmCtx.fillStyle = '#0c0402'; mmCtx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5); }
      else if (crystal[i] > 0) { mmCtx.fillStyle = '#1fa39d'; mmCtx.fillRect(x * sx, y * sy, sx, sy); }
    }
  for (const b of buildings) {
    if (b.owner !== PLAYER && !explored[idx(b.tx, b.ty)]) continue;
    mmCtx.fillStyle = TEAM_COLORS[b.owner];
    mmCtx.fillRect(b.tx * sx, b.ty * sy, Math.max(2, b.def.w * sx), Math.max(2, b.def.h * sy));
  }
  for (const u of units) {
    if (u.owner !== PLAYER && !visible[idx(tileOf(u.x), tileOf(u.y))]) continue;
    mmCtx.fillStyle = TEAM_COLORS[u.owner];
    mmCtx.fillRect((u.x / TILE) * sx - 1, (u.y / TILE) * sy - 1, 2.5, 2.5);
  }
  const { w, h } = viewSize();
  mmCtx.strokeStyle = '#fffa'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect((camera.x / TILE) * sx, (camera.y / TILE) * sy, (w / camera.zoom / TILE) * sx, (h / camera.zoom / TILE) * sy);
}
