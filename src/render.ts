import { TILE, TEAM_COLORS, BUILDINGS, UNITS, PLAYER, CAPTURE_TIME } from './config';
import { MAP_W, MAP_H, terrain, crystal, idx } from './map';
import * as game from './game';
import { units, buildings, beams, booms, shells, strikes, explored, visible, tileOf, Unit, Building, canPlace, byId } from './game';
import { camera, selection, selectBox, placement, strikeAim } from './input';
import { BUILDING_ART, VEHICLE_ART, TURRET_ART, arcOrb, setFineArt, nexusBeacon, extractorLights, fusionCore, spireLight, labLight } from './art';

// Renderer v4 — Kenney sprite assets on a pre-rendered noise terrain.
//  * terrain painted once into a big offscreen texture (per-pixel noise, craters, boulders)
//  * units use the pack's team-colored sets (blue/orange/green/grey), baked to size
//  * neutral structure sprites get a team-color tint wash
//  * fog of war is a tiny canvas scaled up with smoothing = soft edges

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let T = 0;

let lastViewW = 0, lastViewH = 0;
export function resize() {
  const vw = canvas.clientWidth, vh = canvas.clientHeight;
  // keep the middle of the view fixed, so folding/unfolding or rotating
  // doesn't slide the battlefield off to one side
  if (lastViewW && lastViewH) {
    camera.x += (lastViewW - vw) / 2 / camera.zoom;
    camera.y += (lastViewH - vh) / 2 / camera.zoom;
  }
  lastViewW = vw; lastViewH = vh;
  // Samsung foldables report fractional ratios (e.g. 2.625 on the cover screen)
  canvas.width = Math.round(vw * devicePixelRatio);
  canvas.height = Math.round(vh * devicePixelRatio);
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

const FLORA_SPRITES = ['env_16', 'env_17', 'env_18', 'env_19', 'env_14', 'env_15'];

// compass directions, indexed by round(facing / 45°): 0 = east, going clockwise
export const DIR8 = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;

export function dirIndex(facing: number): number {
  return ((Math.round(facing / (Math.PI / 4)) % 8) + 8) % 8;
}

function neededFiles(): string[] {
  const files = new Set<string>([...FLORA_SPRITES, 'env_05']);
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
// the terrain texture is painted at half resolution and blown up without
// smoothing, so the ground reads as chunky 2×-pixel art like an old RTS map
export const TEX_SCALE = 2;

// 2×2 ordered-dither offsets: quantized colour bands break into a checker
// pattern instead of hard steps, the classic 16-bit shading trick
const BAYER = [0, 0.5, 0.75, 0.25];

interface Pal { out: string, dk: string, mid: string, lt: string, hi: string }
const ROCK_GREY: Pal = { out: '#2a201d', dk: '#5a4c46', mid: '#85776e', lt: '#ad9f92', hi: '#d8ccbc' };
const ROCK_RED: Pal = { out: '#2c170f', dk: '#683724', mid: '#93553a', lt: '#bb7b52', hi: '#e6ab7a' };
const TREE_TEAL: Pal = { out: '#11231c', dk: '#1f4236', mid: '#2f6b55', lt: '#4f9a72', hi: '#93cf8c' };
const TREE_PURPLE: Pal = { out: '#1b1226', dk: '#36234c', mid: '#573a76', lt: '#8460a6', hi: '#c49edc' };

function paintTerrain() {
  const P = TEX_SCALE;
  const W = MAP_W * TILE, H = MAP_H * TILE;   // world size
  const TW = W / P, TH = H / P;               // texture size
  const [tex, g] = makeCanvas(TW, TH);

  // water mask, bilinearly sampled per pixel and wobbled with noise so lake
  // shores come out organic instead of following the tile grid
  const isWet = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && terrain[idx(tx, ty)] === 2 ? 1 : 0;
  // 3×3 box blur first: rounds the lake corners and leaves a beach rim inside
  // the impassable tiles
  const soft = new Float32Array(MAP_W * MAP_H);
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += isWet(tx + dx, ty + dy);
      soft[idx(tx, ty)] = sum / 9;
    }
  const wet = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H ? soft[idx(tx, ty)] : 0;
  const waterAt = (x: number, y: number) => {
    const fx = x / TILE - 0.5, fy = y / TILE - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ax = fx - ix, ay = fy - iy;
    const top = wet(ix, iy) * (1 - ax) + wet(ix + 1, iy) * ax;
    const bot = wet(ix, iy + 1) * (1 - ax) + wet(ix + 1, iy + 1) * ax;
    return top * (1 - ay) + bot * ay + (noise(x / 11 + 70, y / 11) - 0.5) * 0.3 + (noise(x / 5 + 9, y / 5) - 0.5) * 0.035;
  };

  const img = g.createImageData(TW, TH);
  const d = img.data;
  // slope lighting: compare each pixel's height with its NW neighbours so the
  // noise reads as actual relief lit from the north-west
  const prevRow = new Float32Array(TW);
  let left = 0;
  const STEP = 9;
  for (let py = 0; py < TH; py++) {
    for (let px = 0; px < TW; px++) {
      const x = px * P, y = py * P;
      const n = fbm(x / 110, y / 110);            // broad basins and plateaus
      const detail = fbm(x / 34 + 300, y / 34);   // small bumps
      const hgt = n * 0.75 + detail * 0.25;
      const grain = noise(x / 5, y / 5);
      const m = hgt * 0.8 + grain * 0.2;

      // sunlit ochre desert under a swollen red sun: warm sand, cooler ash
      // flats and olive scrub, each in crisp-edged patches
      let r = 132 + m * 74, gg = 82 + m * 46, b = 46 + m * 24;
      const ashMix = Math.min(1, Math.max(0, (noise(x / 140 + 40, y / 140) - 0.56) * 6));
      r = r * (1 - ashMix) + (124 + m * 48) * ashMix;
      gg = gg * (1 - ashMix) + (100 + m * 40) * ashMix;
      b = b * (1 - ashMix) + (86 + m * 32) * ashMix;
      const veg = Math.min(0.9, Math.max(0, (noise(x / 70 + 200, y / 70 + 90) - 0.57) * 5)) * (0.75 + grain * 0.35);
      r = r * (1 - veg) + (88 + m * 40) * veg;
      gg = gg * (1 - veg) + (104 + m * 40) * veg;
      b = b * (1 - veg) + (42 + m * 18) * veg;

      // big-picture depth: low basins sink into shadow, high ground brightens
      const lift = 0.72 + n * 0.5;
      r *= lift; gg *= lift; b *= lift;

      // relief shading from height difference vs W and N neighbours
      if (px > 0 && py > 0) {
        const slope = (hgt - left) + (hgt - prevRow[px]);
        const lit = Math.max(-24, Math.min(26, slope * 700));
        r += lit; gg += lit * 0.95; b += lit * 0.8;
      }
      left = hgt;
      prevRow[px] = hgt;

      // lakes: deep blue centre, teal shallows, a foam line and a sandy beach
      const w = waterAt(x, y);
      if (w > 0.5) {
        const depth = Math.min(1, (w - 0.5) * 3.2);
        r = 72 - depth * 46; gg = 160 - depth * 84; b = 178 - depth * 50;
        if (noise(x / 16 + 11, y / 3.2) > 0.8) { r += 30; gg += 34; b += 34; } // ripples
        if (w < 0.54) { r = 220; gg = 230; b = 216; }                          // foam
      } else if (w > 0.3) {
        const t = (w - 0.3) / 0.2;    // 0 at the dry edge → 1 at the waterline
        r = r * (1 - t) + (214 - t * 54) * t;
        gg = gg * (1 - t) + (182 - t * 52) * t;
        b = b * (1 - t) + (128 - t * 36) * t;
      }

      const dth = BAYER[(py & 1) * 2 + (px & 1)];
      const i = (py * TW + px) * 4;
      d[i] = Math.floor(r / STEP + dth) * STEP;
      d[i + 1] = Math.floor(gg / STEP + dth) * STEP;
      d[i + 2] = Math.floor(b / STEP + dth) * STEP;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const dry = (x: number, y: number) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && terrain[idx(tx, ty)] === 0 && waterAt(x, y) < 0.26;
  };

  // from here on draw in world coordinates
  g.setTransform(1 / P, 0, 0, 1 / P, 0, 0);

  // impact craters: dark bowl, lit far rim, shadowed near rim
  const craters = Math.floor(MAP_W * MAP_H / 110);
  for (let n = 0; n < craters; n++) {
    const cx = nrand() * W, cy = nrand() * H, r = 10 + nrand() * 24;
    if (!dry(cx, cy)) continue;
    const grd = g.createRadialGradient(cx + r * 0.15, cy + r * 0.1, r * 0.1, cx, cy, r);
    grd.addColorStop(0, 'rgba(60,26,12,0.5)');
    grd.addColorStop(0.75, 'rgba(60,26,12,0.22)');
    grd.addColorStop(1, 'rgba(60,26,12,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,224,170,0.35)';
    g.beginPath(); g.ellipse(cx, cy, r * 0.8, r * 0.64, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
    g.strokeStyle = 'rgba(50,22,10,0.35)';
    g.beginPath(); g.ellipse(cx, cy, r * 0.8, r * 0.64, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  }

  // hairline cracks
  g.strokeStyle = 'rgba(56,24,12,0.38)';
  g.lineWidth = 2;
  const cracks = Math.floor(MAP_W * MAP_H / 50);
  for (let n = 0; n < cracks; n++) {
    let x = nrand() * W, y = nrand() * H;
    if (!dry(x, y)) continue;
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

  // pixel-scale clutter, the detail that makes old maps feel busy: pebbles with
  // a lit top and a dark underside, and tufts of dry scrub (texture pixels)
  g.setTransform(1, 0, 0, 1, 0, 0);
  const pebbles = MAP_W * MAP_H * 2;
  for (let n = 0; n < pebbles; n++) {
    const x = Math.floor(nrand() * TW), y = Math.floor(nrand() * TH);
    if (!dry(x * P, y * P)) continue;
    const sz = nrand() < 0.3 ? 2 : 1;
    g.fillStyle = 'rgba(48,24,12,0.6)';
    g.fillRect(x, y + 1, sz, 1);
    g.fillStyle = nrand() < 0.5 ? '#d2b892' : '#a98a6a';
    g.fillRect(x, y + 1 - sz, sz, sz);
  }
  const tufts = Math.floor(MAP_W * MAP_H * 0.8);
  for (let n = 0; n < tufts; n++) {
    const x = Math.floor(nrand() * TW), y = Math.floor(nrand() * TH);
    if (!dry(x * P, y * P)) continue;
    const hue = nrand();
    const blades = 2 + Math.floor(nrand() * 3);
    g.fillStyle = 'rgba(40,22,10,0.45)';
    g.fillRect(x - 1, y, blades + 2, 1);
    for (let k = 0; k < blades; k++) {
      const h = 1 + Math.floor(nrand() * 3);
      g.fillStyle = hue < 0.6 ? '#76762f' : hue < 0.85 ? '#a08e3a' : '#5e5026';
      g.fillRect(x + k, y - h, 1, h);
      g.fillStyle = '#e4d58e';
      if (nrand() < 0.5) g.fillRect(x + k, y - h, 1, 1);
    }
  }

  g.setTransform(1 / P, 0, 0, 1 / P, 0, 0);

  // drifting cloud shadows: huge soft dark patches give the plain a sense of
  // scale and break up the even lighting
  const clouds = Math.max(3, Math.floor(W * H / (520 * 520)));
  for (let n = 0; n < clouds; n++) {
    const cx = nrand() * W, cy = nrand() * H, r = 160 + nrand() * 220;
    const grd = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    grd.addColorStop(0, 'rgba(36,16,10,0.2)');
    grd.addColorStop(1, 'rgba(36,16,10,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(cx, cy, r * 1.4, r, 0, 0, Math.PI * 2); g.fill();
  }

  // helper: stamp a prop sprite with a soft cast shadow
  const stamp = (file: string, cx: number, cy: number, size: number) => {
    const im = images.get(file);
    if (!im) return;
    const s = size / Math.max(im.width, im.height);
    const dw = im.width * s, dh = im.height * s;
    g.fillStyle = 'rgba(30,12,6,0.4)';
    g.beginPath(); g.ellipse(cx + 4, cy + dh * 0.36, dw * 0.46, dh * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.imageSmoothingEnabled = true;
    g.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
  };

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

  // ---- impassable features: boulder masses and alien forest ----
  // every boulder and tree is queued first, then all cast shadows are drawn,
  // then the bodies back-to-front, so overlapping pieces stack like a mountain
  type Piece = { x: number, y: number, r: number, pal: Pal, tree: boolean, seed: number };
  const pieces: Piece[] = [];
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = terrain[idx(tx, ty)];
      if (t !== 1 && t !== 3) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      // ground beneath the feature goes dark: ambient occlusion
      const grd = g.createRadialGradient(cx, cy, 4, cx, cy, 30);
      grd.addColorStop(0, t === 1 ? 'rgba(40,22,14,0.55)' : 'rgba(18,30,18,0.6)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(cx - 30, cy - 30, 60, 60);
      if (t === 1) {
        const pal = noise(tx / 6 + 50, ty / 6) > 0.55 ? ROCK_RED : ROCK_GREY;
        // tiles deep inside a formation get the biggest boulders so outcrops
        // build up into a mound instead of a grid of equal stones
        let inner = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
          if (terrain[idx(Math.min(MAP_W - 1, Math.max(0, tx + dx)), Math.min(MAP_H - 1, Math.max(0, ty + dy)))] === 1) inner++;
        const big = 10 + inner * 1.4 + nrand() * 6;
        pieces.push({ x: cx + (nrand() - 0.5) * 22, y: cy + (nrand() - 0.5) * 18, r: big, pal, tree: false, seed: nrand() });
        const extra = Math.floor(nrand() * 3);
        for (let k = 0; k < extra; k++)
          pieces.push({ x: cx + (nrand() - 0.5) * 34, y: cy + (nrand() - 0.5) * 28, r: 5 + nrand() * 6, pal, tree: false, seed: nrand() });
      } else {
        const pal = noise(tx / 7 + 9, ty / 7 + 30) > 0.62 ? TREE_PURPLE : TREE_TEAL;
        const trees = 2 + (nrand() < 0.4 ? 1 : 0);
        for (let k = 0; k < trees; k++)
          pieces.push({ x: cx + (nrand() - 0.5) * 28, y: cy + (nrand() - 0.5) * 24, r: 9 + nrand() * 9, pal, tree: true, seed: nrand() });
      }
    }
  pieces.sort((a, b) => a.y - b.y);
  g.fillStyle = 'rgba(28,12,6,0.42)';
  for (const p of pieces) {
    g.beginPath();
    if (p.tree) g.ellipse(p.x + p.r * 0.5, p.y + p.r * 0.35, p.r * 1.1, p.r * 0.5, 0, 0, Math.PI * 2);
    else g.ellipse(p.x + p.r * 0.45, p.y + p.r * 0.4, p.r * 1.15, p.r * 0.55, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (const p of pieces) p.tree ? drawTree(g, p.x, p.y, p.r, p.pal, p.seed) : drawBoulder(g, p.x, p.y, p.r, p.pal, p.seed);

  g.setTransform(1, 0, 0, 1, 0, 0);
  terrainTex = tex;
}

// a rounded boulder: dark outline, shadowed lower-right, lit upper-left lobe,
// a bright highlight and a crack — reads as a 3D rock at any size
function drawBoulder(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, pal: Pal, seed: number) {
  const pts: [number, number][] = [];
  const by = cy - r * 0.25;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const rr = r * (0.84 + Math.abs(Math.sin(seed * 97 + k * 2.3)) * 0.26);
    pts.push([cx + Math.cos(a) * rr, by + Math.sin(a) * rr * (Math.sin(a) > 0 ? 0.62 : 0.85)]);
  }
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    g.closePath();
  };
  g.lineWidth = 3; g.strokeStyle = pal.out; g.fillStyle = pal.mid;
  path(); g.stroke(); g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = pal.dk;
  g.beginPath(); g.ellipse(cx + r * 0.45, by + r * 0.4, r * 0.95, r * 0.6, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.lt;
  g.beginPath(); g.ellipse(cx - r * 0.25, by - r * 0.4, r * 0.7, r * 0.45, -0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.hi;
  g.beginPath(); g.ellipse(cx - r * 0.38, by - r * 0.52, r * 0.26, r * 0.15, -0.3, 0, Math.PI * 2); g.fill();
  if (r > 10) {
    g.strokeStyle = pal.out; g.lineWidth = 2; g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(cx + r * 0.1, by - r * 0.3); g.lineTo(cx + r * 0.25, by + r * 0.05); g.lineTo(cx + r * 0.15, by + r * 0.35); g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
}

// an alien tree: short trunk under a cluster of round canopy puffs, each
// shaded from dark underside to lit crown
function drawTree(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, pal: Pal, seed: number) {
  g.fillStyle = '#2a1a10';
  g.fillRect(cx - 2, cy - s * 0.5, 4, s * 0.55);
  const puffs: [number, number, number][] = [];
  const n = 4 + Math.floor(seed * 2);
  for (let k = 0; k < n; k++) {
    const a = seed * 40 + k * (Math.PI * 2 / n);
    puffs.push([cx + Math.cos(a) * s * 0.42, cy - s * 0.95 + Math.sin(a) * s * 0.3, s * (0.48 + ((k * 37 + seed * 100) % 10) / 50)]);
  }
  puffs.push([cx, cy - s * 1.1, s * 0.55]);
  g.fillStyle = pal.out;
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r + 1.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = pal.dk;
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = pal.mid;
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x - r * 0.12, y - r * 0.15, r * 0.8, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = pal.lt;
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x - r * 0.28, y - r * 0.32, r * 0.45, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = pal.hi;
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x - r * 0.36, y - r * 0.42, r * 0.16, 0, Math.PI * 2); g.fill(); }
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
// procedurally-drawn aircraft (faces east, rotated freely at draw time —
// smooth rotation reads naturally for flight, unlike ground walkers)
export function bakeAirSprite(defId: string, owner: number, refined = false): HTMLCanvasElement {
  const def = UNITS[defId];
  const team = TEAM_COLORS[owner];
  const S = def.radius * 3, k = refined ? 3 : 1;
  const [c, g] = makeCanvas(S * k, S * k);
  g.scale(k, k);
  g.translate(S / 2, S / 2);
  const heavy = defId === 'bomber';
  const L = def.radius * 1.35;             // nose length
  const W = heavy ? def.radius * 1.2 : def.radius * 0.95; // wingspan half-width
  // hull: swept delta wing
  const hg = g.createLinearGradient(-L * 0.6, -W, L, W);
  hg.addColorStop(0, heavy ? '#4a4456' : '#5a6472');
  hg.addColorStop(0.55, heavy ? '#332e40' : '#39414f');
  hg.addColorStop(1, '#191d26');
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(L, 0);                          // nose
  g.lineTo(-L * 0.35, -W);                 // left wingtip
  g.lineTo(-L * 0.7, -W * 0.35);
  g.lineTo(-L * 0.55, 0);                  // tail notch
  g.lineTo(-L * 0.7, W * 0.35);
  g.lineTo(-L * 0.35, W);                  // right wingtip
  g.closePath(); g.fill();
  g.strokeStyle = team; g.lineWidth = 1.6; g.stroke();
  if (heavy) {
    // twin bomb pods under the wings
    g.fillStyle = '#14161d';
    for (const sy of [-W * 0.55, W * 0.55]) {
      g.beginPath(); g.ellipse(-L * 0.1, sy, L * 0.4, W * 0.18, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // canopy
  const cg = g.createLinearGradient(L * 0.15, -3, L * 0.6, 3);
  cg.addColorStop(0, '#cdeeff'); cg.addColorStop(1, '#2585b5');
  g.fillStyle = cg;
  g.beginPath(); g.ellipse(L * 0.35, 0, L * 0.28, W * 0.22, 0, 0, Math.PI * 2); g.fill();
  // engine glow at the tail
  g.fillStyle = 'rgba(120,200,255,0.85)';
  for (const sy of heavy ? [-W * 0.3, W * 0.3] : [0]) {
    g.beginPath(); g.ellipse(-L * 0.62, sy, 3.2, 2, 0, 0, Math.PI * 2); g.fill();
  }
  // team stripe
  g.fillStyle = team; g.globalAlpha = 0.85;
  g.fillRect(-L * 0.3, -1.6, L * 0.5, 3.2);
  g.globalAlpha = 1;
  if (refined) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    gradeWarmCool(c, 0.7);
    outline(c, 'rgba(16,10,8,0.6)', 2);
    (c as Scaled).k = k;
  }
  return c;
}

// a sprite baked k× larger than world size (refined style), drawn back down
type Scaled = HTMLCanvasElement & { k?: number };
const kOf = (s: HTMLCanvasElement) => (s as Scaled).k ?? 1;

// refined-style vehicles: hull and turret baked separately at VEH_ANGLES
// headings, so hulls turn smoothly and turrets aim on their own
const VEH_ANGLES = 48;
type VehPart = Scaled & { ox: number; oy: number; ww: number; wh: number };
// walkers bake fewer headings (each has several gait frames)
const vehAngles = (defId: string) => VEHICLE_ART[defId]!.frames ? 24 : VEH_ANGLES;
function rotatedPart(key: string, reach: number, height: number, paint: (g: CanvasRenderingContext2D) => void): VehPart {
  let s = sprites.get(key) as VehPart | undefined;
  if (!s) {
    const k = 3, ww = reach * 2 + 4, wh = ww + height;
    const [c, g] = makeCanvas(ww * k, wh * k);
    g.scale(k, k); g.translate(ww / 2, ww / 2 + height);
    setFineArt(true);
    paint(g);
    setFineArt(false);
    g.setTransform(1, 0, 0, 1, 0, 0);
    gradeWarmCool(c, 0.7);
    outline(c, 'rgba(16,10,8,0.6)', 2);
    s = c as VehPart; s.k = k; s.ox = ww / 2; s.oy = ww / 2 + height; s.ww = ww; s.wh = wh;
    sprites.set(key, s);
  }
  return s;
}
function vehiclePart(defId: string, owner: number, part: 'hull' | 'turret', i: number, frame = 0): VehPart {
  const va = VEHICLE_ART[defId]!;
  const ang = (i / vehAngles(defId)) * Math.PI * 2;
  return rotatedPart(`v:${defId}:${owner}:${part}:${i}:${frame}`, va.reach, va.height, g => {
    if (part === 'hull') va.hull(g, ang, TEAM_COLORS[owner], frame / (va.frames ?? 1));
    else va.turret?.(g, ang, TEAM_COLORS[owner]);
  });
}
// a defence's aiming head, eased toward its target and drawn at its pivot
function drawDefenceHead(b: Building, px: number, py: number) {
  const ta = TURRET_ART[b.def.id]!, s = b.def.w * TILE / (b.def.w * 32);
  const v = vehViz.get(b.id) ?? { hull: b.facing, tur: b.facing };
  vehViz.set(b.id, v);
  v.tur = turnToward(v.tur, b.facing, 6 * vizDt);
  const i = headingIndex(v.tur, VEH_ANGLES);
  const head = rotatedPart(`d:${b.def.id}:${b.owner}:${i}`, ta.reach, ta.height,
    g => ta.head(g, (i / VEH_ANGLES) * Math.PI * 2, TEAM_COLORS[b.owner]));
  ctx.drawImage(head, px + ta.pivot[0] * s - head.ox, py + ta.pivot[1] * s - head.oy, head.ww, head.wh);
}
const vehViz = new Map<number, { hull: number, tur: number }>();
let vizT = 0, vizDt = 0;
// rotate cur toward want by at most maxStep, the short way round
function turnToward(cur: number, want: number, maxStep: number): number {
  const d = ((want - cur) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
const headingIndex = (a: number, n: number) => ((Math.round(a / (Math.PI * 2 / n)) % n) + n) % n;
function drawVehicle(u: Unit, moving: boolean, lift = 0) {
  const va = VEHICLE_ART[u.def.id]!, n = vehAngles(u.def.id);
  const v = vehViz.get(u.id) ?? { hull: u.facing, tur: u.facing };
  vehViz.set(u.id, v);
  v.hull = turnToward(v.hull, u.facing, (va.turn ?? 4) * vizDt);
  const tid = u.order.type === 'attack' ? u.order.targetId ?? -1 : u.autoTargetId;
  const tgt = tid >= 0 ? byId.get(tid) : undefined;
  let aim = v.hull;
  if (tgt) { const p = game.entityPos(tgt); aim = Math.atan2(p.y - u.y, p.x - u.x); }
  v.tur = turnToward(v.tur, aim, 5 * vizDt);
  // walkers stride instead of hovering; the gait speeds up with the unit
  const frame = va.frames && moving ? Math.floor(T * u.def.speed * 2.2 + u.id * 0.37) % va.frames : 0;
  const bob = va.frames ? 0 : Math.sin(T * 2.4 + u.id) * 0.8;
  for (const part of va.turret ? ['hull', 'turret'] as const : ['hull'] as const) {
    const s = vehiclePart(u.def.id, u.owner, part, headingIndex(part === 'hull' ? v.hull : v.tur, n), part === 'hull' ? frame : 0);
    ctx.drawImage(s, u.x - s.ox, u.y - s.oy + bob - lift, s.ww, s.wh);
  }
}

// warm key light from the dying sun in the north-west and a cool sky fill in
// the shadows, applied through the sprite's own alpha so its edges stay clean
function gradeWarmCool(c: HTMLCanvasElement, amount: number) {
  const [t, tg] = makeCanvas(c.width, c.height);
  tg.drawImage(c, 0, 0);
  tg.globalCompositeOperation = 'soft-light';
  const lg = tg.createLinearGradient(0, 0, c.width, c.height);
  lg.addColorStop(0, `rgba(255,168,92,${0.55 * amount})`);
  lg.addColorStop(0.5, 'rgba(128,128,128,0)');
  lg.addColorStop(1, `rgba(56,88,168,${0.6 * amount})`);
  tg.fillStyle = lg; tg.fillRect(0, 0, c.width, c.height);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(c, 0, 0);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(t, 0, 0);
}

// refined style: the pack art baked at 3× from its full-size source (it's
// 3-4× larger than drawn), a light team wash, warm/cool grade, thin edge
function bakeUnitSpriteRefined(img: HTMLImageElement, def: typeof UNITS[string], owner: number): Scaled {
  const k = 3, scale = def.spriteH / img.height;
  const dw = Math.ceil(img.width * scale * k), dh = Math.ceil(img.height * scale * k);
  const [c, g] = makeCanvas(dw + 4, dh + 4);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, 2, 2, dw, dh);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = TEAM_COLORS[owner];
  g.globalAlpha = owner === PLAYER ? 0.06 : 0.16;   // team reads from the ground glow instead
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  gradeWarmCool(c, 0.8);
  punch(g, c, 0.12);
  outline(c, 'rgba(16,10,8,0.6)', 2);               // two of 3× pixels: under one world pixel
  const s = c as Scaled; s.k = k;
  return s;
}

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
  if (refinedStyle) return bakeUnitSpriteRefined(img, def, owner);
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
// k: the sprite is baked k× larger than world size (refined style) and drawn back down
export interface BldSprite extends HTMLCanvasElement { ox: number; oy: number; k?: number }

// refined render style is the default; ?style=classic (or V in game) shows the
// original chunky pixelated look for comparison
export let refinedStyle = new URLSearchParams(location.search).get('style') !== 'classic';
export function setRefinedStyle(v: boolean) {
  refinedStyle = v;
  sprites.clear();
}
function drawBld(s: BldSprite, x: number, y: number) {
  const k = s.k ?? 1;
  ctx.drawImage(s, x - s.ox, y - s.oy, s.width / k, s.height / k);
}

// dark pixel-art outline around everything already drawn on the canvas
function outline(c: HTMLCanvasElement, color: string, px: number) {
  const [sil, sg] = makeCanvas(c.width, c.height);
  sg.drawImage(c, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = color;
  sg.fillRect(0, 0, c.width, c.height);
  const [o, og] = makeCanvas(c.width, c.height);
  for (const [dx, dy] of [[-px, 0], [px, 0], [0, -px], [0, px], [px, px]]) og.drawImage(sil, dx, dy);
  og.drawImage(c, 0, 0);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(o, 0, 0);
}

// re-sample a canvas into 2×2 pixel blocks so baked art matches the terrain
function pixelate(c: HTMLCanvasElement) {
  const [lo, lg] = makeCanvas(Math.ceil(c.width / 2), Math.ceil(c.height / 2));
  lg.imageSmoothingEnabled = true;
  lg.drawImage(c, 0, 0, lo.width, lo.height);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(lo, 0, 0, lo.width * 2, lo.height * 2);
  g.imageSmoothingEnabled = true;
}

// riveted metal foundation pad with bevelled edges and a team hazard stripe
function drawPad(g: CanvasRenderingContext2D, w: number, h: number, team: string) {
  // trampled dirt ring around the pad
  const dg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  dg.addColorStop(0, 'rgba(46,24,12,0.45)');
  dg.addColorStop(1, 'rgba(46,24,12,0)');
  g.fillStyle = dg;
  g.fillRect(-14, -14, w + 28, h + 28);
  const pg = g.createLinearGradient(0, 0, w * 0.6, h);
  pg.addColorStop(0, '#6a6158'); pg.addColorStop(0.5, '#514a43'); pg.addColorStop(1, '#3a342f');
  rr(g, 2, 2, w - 4, h - 4, 6);
  g.fillStyle = pg; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#1a120c'; g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let x = 32; x < w - 4; x += 32) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x, h - 4); g.stroke(); }
  for (let y = 32; y < h - 4; y += 32) { g.beginPath(); g.moveTo(4, y); g.lineTo(w - 4, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,236,200,0.28)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(5, h - 6); g.lineTo(5, 5); g.lineTo(w - 6, 5); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.moveTo(w - 5, 6); g.lineTo(w - 5, h - 5); g.lineTo(6, h - 5); g.stroke();
  for (const [rx, ry] of [[9, 9], [w - 9, 9], [9, h - 15], [w - 9, h - 15]]) {
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(rx, ry, 2.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b8a688'; g.beginPath(); g.arc(rx - 0.5, ry - 0.5, 1.4, 0, Math.PI * 2); g.fill();
  }
  // hazard stripe along the south lip, in team colour
  g.save();
  g.beginPath(); g.rect(6, h - 11, w - 12, 5); g.clip();
  g.fillStyle = team; g.fillRect(6, h - 11, w - 12, 5);
  g.fillStyle = 'rgba(16,10,6,0.8)';
  for (let x = 0; x < w + 10; x += 8) { g.beginPath(); g.moveTo(x, h - 11); g.lineTo(x + 4, h - 11); g.lineTo(x, h - 6); g.lineTo(x - 4, h - 6); g.closePath(); g.fill(); }
  g.restore();
}

function bakeBuildingSprite(defId: string, owner: number, level: number): BldSprite {
  const def = BUILDINGS[defId];
  const w = def.w * TILE, h = def.h * TILE;

  // the structure on its own canvas, overflowing the plot upward; baseY is the
  // canvas row that sits on the plot's south edge
  const art = BUILDING_ART[defId];
  if (art && refinedStyle) return bakeRefinedSprite(defId, owner, level);
  const img = def.sprite ? images.get(`${def.sprite}_${level}`) : undefined;
  let st: HTMLCanvasElement | null = null, baseY = 0;
  if (art) {
    // hand-drawn structure: colours are final, it only needs the outline
    const head = Math.ceil(w * 0.75), m = 6;
    const [c, cg] = makeCanvas(w + m * 2, h + head + m * 2);
    cg.translate(m, m + head);
    art(cg, w, h, level, TEAM_COLORS[owner]);
    cg.setTransform(1, 0, 0, 1, 0, 0); // outline() reuses this context
    st = c; baseY = m + head + h;
  } else if (img && !def.isWall) {
    // isometric pack sprite: team wash, NW light, contrast lift (the pad's
    // hazard stripe carries most of the team colour)
    const scale = Math.min((w * 1.3) / img.width, (h * 2.6) / img.height, 1);
    const dw = Math.ceil(img.width * scale), dh = Math.ceil(img.height * scale);
    const [c, sg] = makeCanvas(dw + 6, dh + 6);
    sg.imageSmoothingEnabled = true;
    sg.drawImage(img, 3, 3, dw, dh);
    sg.globalCompositeOperation = 'source-atop';
    sg.fillStyle = TEAM_COLORS[owner];
    sg.globalAlpha = owner === PLAYER ? 0.08 : 0.14;
    sg.fillRect(0, 0, c.width, c.height);
    sg.globalAlpha = 1;
    sg.globalCompositeOperation = 'source-over';
    bakeLighting(sg, c.width, c.height, 0.5);
    punch(sg, c, 0.2);
    st = c; baseY = c.height - 3;
  }
  if (st) {
    outline(st, '#1a120c', 2);

    // long low-sun shadow thrown to the south-east
    const reachX = Math.ceil(baseY * 0.42), reachY = Math.ceil(baseY * 0.16);
    const cw = Math.max(w, st.width) + 16 + reachX * 2;
    const ch = h + Math.max(0, baseY - h) + 16 + reachY;
    const [c, g] = makeCanvas(cw, ch);
    const ox = (cw - w) / 2;            // footprint offset inside the canvas
    const oy = ch - h - 6 - reachY;
    g.save(); g.translate(ox, oy);
    if (!def.isWall) drawPad(g, w, h, TEAM_COLORS[owner]);
    g.restore();
    const bx = cw / 2, by = oy + h - (art ? 0 : 2);
    g.save();
    g.translate(bx, by);
    g.transform(1, 0, -0.42, -0.16, 0, 0);
    g.globalAlpha = 0.34;
    g.drawImage(silhouetteOf(st), -st.width / 2, -baseY);
    g.restore();
    // contact shadow hugging the base
    g.fillStyle = 'rgba(16,8,4,0.35)';
    g.beginPath(); g.ellipse(bx + 3, by - 2, st.width * 0.44, Math.min(10, baseY * 0.08), 0, 0, Math.PI * 2); g.fill();
    // structure planted on the plot's south edge
    g.drawImage(st, bx - st.width / 2, by - baseY);
    pixelate(c);
    const s = c as BldSprite; s.ox = ox; s.oy = oy;
    return s;
  }
  return bakeProceduralBuilding(defId, owner);
}

// refined style: hand-drawn art baked at 2× with no pixelation, thin tinted
// edges, a soft blurred shadow and a quiet pad
function bakeRefinedSprite(defId: string, owner: number, level: number): BldSprite {
  const def = BUILDINGS[defId], art = BUILDING_ART[defId]!;
  const w = def.w * TILE, h = def.h * TILE, k = 2;
  const head = Math.ceil(w * 0.75), m = 6;
  const sw = w + m * 2, baseY = m + head + h;          // structure canvas, world units
  const [st, sg] = makeCanvas(sw * k, (h + head + m * 2) * k);
  sg.scale(k, k); sg.translate(m, m + head);
  setFineArt(true);
  art(sg, w, h, level, TEAM_COLORS[owner]);
  setFineArt(false);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  gradeWarmCool(st, 0.7);
  outline(st, 'rgba(20,12,8,0.55)', 1);                 // one device pixel, not two world pixels

  const reachX = Math.ceil(baseY * 0.42), reachY = Math.ceil(baseY * 0.16);
  const cw = Math.max(w, sw) + 16 + reachX * 2;
  const ch = h + Math.max(0, baseY - h) + 16 + reachY;
  const [c, g] = makeCanvas(cw * k, ch * k);
  g.scale(k, k);
  const ox = (cw - w) / 2, oy = ch - h - 6 - reachY;
  if (!def.isWall) { g.save(); g.translate(ox, oy); drawPadRefined(g, w, h, TEAM_COLORS[owner]); g.restore(); }
  const bx = cw / 2, by = oy + h;
  // long low-sun shadow, blurred so it reads as light rather than a decal
  g.save();
  g.filter = 'blur(2.5px)';
  g.translate(bx, by);
  g.transform(1, 0, -0.42, -0.16, 0, 0);
  g.globalAlpha = 0.3;
  g.drawImage(silhouetteOf(st), -sw / 2, -baseY, sw, st.height / k);
  g.restore();
  // soft contact shadow where it meets the ground
  const cs = g.createRadialGradient(bx + 2, by - 2, 0, bx + 2, by - 2, sw * 0.46);
  cs.addColorStop(0, 'rgba(16,8,4,0.32)'); cs.addColorStop(1, 'rgba(16,8,4,0)');
  g.save(); g.scale(1, 0.22); g.fillStyle = cs;
  g.beginPath(); g.arc(bx + 2, (by - 2) / 0.22, sw * 0.46, 0, Math.PI * 2); g.fill(); g.restore();
  g.drawImage(st, bx - sw / 2, by - baseY, sw, st.height / k);
  const s = c as BldSprite; s.ox = ox; s.oy = oy; s.k = k;
  return s;
}

// a low concrete slab: soft trampled ground, a faint bevel, and team colour
// only as a thin lip along the front edge
function drawPadRefined(g: CanvasRenderingContext2D, w: number, h: number, team: string) {
  const dg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  dg.addColorStop(0, 'rgba(40,22,12,0.32)'); dg.addColorStop(1, 'rgba(40,22,12,0)');
  g.fillStyle = dg; g.fillRect(-14, -14, w + 28, h + 28);
  const pg = g.createLinearGradient(0, 0, w * 0.5, h);
  pg.addColorStop(0, '#6c665e'); pg.addColorStop(1, '#4c4741');
  rr(g, 3, 3, w - 6, h - 6, 5);
  g.fillStyle = pg; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(30,22,16,0.7)'; g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 0.5;
  for (let x = 32; x < w - 4; x += 32) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x, h - 4); g.stroke(); }
  for (let y = 32; y < h - 4; y += 32) { g.beginPath(); g.moveTo(4, y); g.lineTo(w - 4, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,240,215,0.16)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(4.5, h - 5); g.lineTo(4.5, 4.5); g.lineTo(w - 5, 4.5); g.stroke();
  g.fillStyle = team; g.globalAlpha = 0.85;
  g.fillRect(8, h - 6, w - 16, 1.5);
  g.globalAlpha = 1;
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
  } else if (defId === 'skyport') {
    // aerodrome landing pad: octagonal deck, H-marking, corner beacons
    bakeGroundPatch(g, w, h);
    const cx = w / 2, cy = h / 2, r = w * 0.46;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(cx + 2, cy + 4, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    const pg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    pg.addColorStop(0, '#565e6e'); pg.addColorStop(0.5, '#3a4150'); pg.addColorStop(1, '#232833');
    g.fillStyle = pg;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      const px2 = cx + Math.cos(a) * r, py2 = cy + Math.sin(a) * r;
      i ? g.lineTo(px2, py2) : g.moveTo(px2, py2);
    }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.stroke();
    // landing circle + H marking
    g.strokeStyle = '#ffd76e'; g.globalAlpha = 0.8; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx - 8, cy - 9); g.lineTo(cx - 8, cy + 9);
    g.moveTo(cx + 8, cy - 9); g.lineTo(cx + 8, cy + 9);
    g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy);
    g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = TEAM_COLORS[owner]; g.globalAlpha = 0.85; g.lineWidth = 2;
    g.strokeRect(3.5, 3.5, w - 7, h - 7); g.globalAlpha = 1;
  } else if (defId === 'skyguard') {
    // flak battery: pedestal + upward quad missile pod
    bakeGroundPatch(g, w, h);
    const cx = w / 2, cy = h / 2;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(cx + 2, cy + 4, w * 0.4, h * 0.28, 0, 0, Math.PI * 2); g.fill();
    const bg2 = g.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, w * 0.44);
    bg2.addColorStop(0, '#8fa0be'); bg2.addColorStop(0.55, '#51607e'); bg2.addColorStop(1, '#232b3e');
    g.fillStyle = bg2;
    g.beginPath(); g.arc(cx, cy, w * 0.38, 0, Math.PI * 2); g.fill();
    // boxy launcher housing angled skyward, with four slim missile tubes
    g.save();
    g.translate(cx, cy - 2);
    g.rotate(-0.5);
    const lg2 = g.createLinearGradient(-9, -7, 9, 7);
    lg2.addColorStop(0, '#6a7590'); lg2.addColorStop(1, '#2c3346');
    g.fillStyle = lg2;
    g.fillRect(-9, -8, 18, 15);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.strokeRect(-9, -8, 18, 15);
    g.fillStyle = '#12141c';
    for (const ox of [-6, -2, 2, 6]) g.fillRect(ox - 1.3, -7, 2.6, 5); // tube openings
    g.fillStyle = '#ff8c3a';
    for (const ox of [-6, -2, 2, 6]) g.fillRect(ox - 0.8, -6.4, 1.6, 1.6); // warheads
    g.restore();
    g.strokeStyle = TEAM_COLORS[owner]; g.globalAlpha = 0.85; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, w * 0.34, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
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
  if (def.isWall) outline(c, '#1a120c', 2);
  pixelate(c);
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

// build-bar icon for a structure with hand-drawn art (null if it has none)
export function artIconUrl(defId: string): string | null {
  const art = BUILDING_ART[defId];
  if (!art) return null;
  const def = BUILDINGS[defId];
  const w = def.w * TILE, h = def.h * TILE, head = Math.ceil(w * 0.75), m = 4;
  const [c, g] = makeCanvas(w + m * 2, h + head + m * 2);
  g.translate(m, m + head);
  art(g, w, h, 1, TEAM_COLORS[PLAYER]);
  g.setTransform(1, 0, 0, 1, 0, 0);
  outline(c, '#1a120c', 2);
  pixelate(c);
  // crop the empty headroom so the icon fills its button
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0) return c.toDataURL();
  const [t, tg] = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  tg.drawImage(c, -x0, -y0);
  return t.toDataURL();
}

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
    d[i * 4] = 16; d[i * 4 + 1] = 12; d[i * 4 + 2] = 10;
    d[i * 4 + 3] = explored[i] ? (visible[i] ? 0 : 105) : 255;
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

// ---- flux crystal clusters: baked once per (variant, size) as chunky pixel art ----

const CRY = { out: '#06262c', dk: '#0f646c', mid: '#21a3a0', lt: '#5cdfd2', hi: '#dcfff8' };
const crystalCache = new Map<number, HTMLCanvasElement>();
const CRY_W = 56, CRY_H = 64, CRY_AX = 28, CRY_AY = 50; // canvas size + base anchor

// one hexagonal prism with a pointed tip: shadowed left faces, lit right faces,
// a bright tip facet and a dark outline so neighbouring crystals separate
function drawCrystal(g: CanvasRenderingContext2D, bx: number, by: number, h: number, w: number, lean: number) {
  const L = lean * h;
  const BL: [number, number] = [bx - w, by], BC: [number, number] = [bx, by + w * 0.35], BR: [number, number] = [bx + w, by];
  const SL: [number, number] = [bx - w + L * 0.65, by - h * 0.65], SC: [number, number] = [bx + L * 0.65, by - h * 0.65 + w * 0.35];
  const SR: [number, number] = [bx + w + L * 0.65, by - h * 0.65], A: [number, number] = [bx + L, by - h];
  const poly = (pts: [number, number][], fill: string) => {
    g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.closePath(); g.fill();
  };
  g.strokeStyle = CRY.out; g.lineWidth = 3; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(...BL); g.lineTo(...BC); g.lineTo(...BR); g.lineTo(...SR); g.lineTo(...A); g.lineTo(...SL); g.closePath(); g.stroke();
  poly([BL, BC, SC, SL], CRY.dk);
  poly([BC, BR, SR, SC], CRY.mid);
  poly([SL, SC, A], CRY.mid);
  poly([SC, SR, A], CRY.lt);
  // inner light: a glint down the lit face and along the front ridge
  g.strokeStyle = CRY.lt; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(BC[0] + w * 0.3, BC[1] - 2); g.lineTo(SC[0] + w * 0.3, SC[1] - 1); g.stroke();
  g.strokeStyle = CRY.hi; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(...SC); g.lineTo(...A); g.stroke();
}

function bakeCrystal(variant: number, size: number): HTMLCanvasElement {
  const key = variant * 8 + size;
  const cached = crystalCache.get(key);
  if (cached) return cached;
  const hash = (n: number) => { const v = Math.sin(variant * 91.3 + n * 47.1) * 43758.5; return v - Math.floor(v); };
  const scale = 0.5 + size * 0.17;                // depleting fields shrink
  // drawn at half resolution, then blown up without smoothing
  const [lo, g] = makeCanvas(CRY_W / 2, CRY_H / 2);
  g.scale(0.5, 0.5);
  const ax = CRY_AX, ay = CRY_AY;
  g.fillStyle = 'rgba(24,10,4,0.45)';
  g.beginPath(); g.ellipse(ax + 6, ay + 2, 18 * scale + 4, 5.5, 0, 0, Math.PI * 2); g.fill();
  // rubble the crystals have pushed up through
  for (let k = 0; k < 5; k++) {
    const rx = ax + (hash(k + 20) - 0.5) * 30 * scale, ry = ay + (hash(k + 30) - 0.3) * 8;
    const rs = 2.5 + hash(k + 40) * 3;
    g.fillStyle = '#1e140e'; g.beginPath(); g.ellipse(rx, ry, rs + 1.2, rs * 0.7 + 1.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a463a'; g.beginPath(); g.ellipse(rx, ry, rs, rs * 0.7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a7462'; g.beginPath(); g.ellipse(rx - rs * 0.3, ry - rs * 0.3, rs * 0.45, rs * 0.3, 0, 0, Math.PI * 2); g.fill();
  }
  // one tall central crystal flanked by shorter ones leaning outward
  const parts: { bx: number, by: number, h: number, w: number, lean: number }[] = [];
  parts.push({ bx: ax + (hash(1) - 0.5) * 4, by: ay, h: (26 + hash(2) * 8) * scale, w: 6.5 * scale + 1.5, lean: (hash(3) - 0.5) * 0.25 });
  const sides = 2 + Math.floor(hash(4) * 3);
  for (let k = 0; k < sides; k++) {
    const side = k % 2 ? 1 : -1;
    const off = (6 + hash(k + 5) * 9) * side;
    parts.push({ bx: ax + off * scale * 1.3, by: ay + (hash(k + 9) - 0.6) * 7, h: (12 + hash(k + 13) * 10) * scale,
      w: (4 + hash(k + 17) * 2) * scale + 1, lean: side * (0.2 + hash(k + 19) * 0.3) });
  }
  parts.sort((a, b) => a.by - b.by);
  for (const p of parts) drawCrystal(g, p.bx, p.by, p.h, p.w, p.lean);
  const [c, cg] = makeCanvas(CRY_W, CRY_H);
  cg.imageSmoothingEnabled = false;
  cg.drawImage(lo, 0, 0, CRY_W, CRY_H);
  crystalCache.set(key, c);
  return c;
}

function buildingOverlay(b: Building) {
  const px = b.tx * TILE, py = b.ty * TILE;
  const w = b.def.w * TILE, h = b.def.h * TILE;
  const cx = px + w / 2, cy = py + h / 2;
  // (classic had no live Skyguard head, so it uses the baked one in both styles)
  if (TURRET_ART[b.def.id] && (refinedStyle || b.def.id === 'skyguard')) {
    drawDefenceHead(b, px, py);
    // ready lamps on the heavy emplacements
    if (b.def.id === 'bastion' || b.def.id === 'railgun') {
      const ready = b.cooldown < 0.15, piv = TURRET_ART[b.def.id]!.pivot;
      const headTop = b.def.id === 'bastion' ? 22 : 20;
      g2Glow(px + piv[0], py + piv[1] - headTop, 2.5, ready ? (b.def.id === 'bastion' ? 'rgba(255,150,60,0.95)' : 'rgba(32,214,255,0.95)') : 'rgba(40,40,50,0.6)');
    }
  } else switch (b.def.id) {
    case 'nexus':
    case 'outpost': {
      // beacon on the tip of the antenna mast (sprite overflows above the plot)
      const on = Math.sin(T * 4) > 0;
      const bc = nexusBeacon(w, b.level, refinedStyle);
      g2Glow(px + bc.x, py + bc.y, on ? 4 : 2, on ? 'rgba(255,90,90,0.9)' : 'rgba(120,40,50,0.6)');
      break;
    }
    case 'extractor': {
      // refinery mast light + processing glow
      const a = 0.5 + Math.sin(T * 3) * 0.3;
      const el = extractorLights(w);
      g2Glow(px + el.glow[0], py + el.glow[1], 6, `rgba(67,243,236,${a})`);
      g2Glow(px + el.lamp[0], py + el.lamp[1], 2.5, `rgba(255,176,46,${0.4 + Math.sin(T * 5) * 0.3})`);
      break;
    }
    case 'lab': {
      // status lamp on the exhaust stack
      const ll = labLight(w);
      if (Math.sin(T * 5) > 0.2) g2Glow(px + ll[0], py + ll[1], 4, 'rgba(140,255,170,0.7)');
      break;
    }
    case 'fusion': {
      // the caged star breathes
      const fc = fusionCore(w);
      g2Glow(px + fc[0], py + fc[1], 9 + Math.sin(T * 3.2 + b.id) * 2, `rgba(255,200,110,${0.35 + Math.sin(T * 3.2 + b.id) * 0.15})`);
      break;
    }
    case 'spire': {
      // warning light on the spike tip, high above the plot
      const on = Math.sin(T * 2.6) > 0;
      const sl = spireLight(w);
      g2Glow(px + sl[0], py + sl[1], on ? 3.5 : 1.5, on ? 'rgba(255,80,80,0.9)' : 'rgba(120,40,50,0.5)');
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
      const orb = arcOrb(w), cx2 = px + orb[0], orbY = py + orb[1];
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
    ctx.fillStyle = '#e8c66a';
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
  vizDt = Math.min(0.1, Math.max(0, T - vizT)); vizT = T;
  if (vehViz.size > units.length + 64) for (const id of [...vehViz.keys()]) if (!byId.has(id)) vehViz.delete(id);
  const vw = canvas.clientWidth, vh = canvas.clientHeight;
  const z = camera.zoom;
  const vwz = vw / z, vhz = vh / z; // visible world size at this zoom
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = '#100c0a';
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.scale(z, z);
  // snap the scroll to whole device pixels: pixel art drawn at fractional
  // offsets shimmers and judders as the camera moves
  const px = 1 / (z * devicePixelRatio);
  ctx.translate(-Math.round(camera.x / px) * px, -Math.round(camera.y / px) * px);

  // blit only the part of the terrain texture that actually exists — clamping to
  // the map bounds prevents the browser from edge-smearing the last row/column
  // when you zoom/scroll past the edge of the map. Edges sit on whole texels so
  // nearest-neighbour sampling doesn't swim while scrolling.
  const mW = MAP_W * TILE, mH = MAP_H * TILE;
  const texel = (v: number, round: (n: number) => number) => round(v / TEX_SCALE) * TEX_SCALE;
  const bx0 = Math.max(0, texel(camera.x, Math.floor)), by0 = Math.max(0, texel(camera.y, Math.floor));
  const bx1 = Math.min(mW, texel(camera.x + vwz, Math.ceil)), by1 = Math.min(mH, texel(camera.y + vhz, Math.ceil));
  if (bx1 > bx0 && by1 > by0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrainTex, bx0 / TEX_SCALE, by0 / TEX_SCALE, (bx1 - bx0) / TEX_SCALE, (by1 - by0) / TEX_SCALE,
      bx0, by0, bx1 - bx0, by1 - by0);
    ctx.imageSmoothingEnabled = true;
  }

  const tx0 = Math.max(0, Math.floor(camera.x / TILE));
  const ty0 = Math.max(0, Math.floor(camera.y / TILE));
  const tx1 = Math.min(MAP_W - 1, Math.ceil((camera.x + vwz) / TILE));
  const ty1 = Math.min(MAP_H - 1, Math.ceil((camera.y + vhz) / TILE));

  // crystals: faceted flux-crystal clusters that shrink as they deplete
  for (let y = ty0; y <= ty1; y++)
    for (let x = tx0; x <= tx1; x++) {
      const i = idx(x, y);
      if (crystal[i] === 0 || !explored[i]) continue;
      const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
      const amt = Math.min(1, crystal[i] / 1000);
      const hash = (n: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5; return v - Math.floor(v); };
      const pulse = 0.75 + 0.25 * Math.sin(T * 2 + x * 1.7 + y * 2.3);
      // mix of big and small clusters so a field doesn't read as a hedge
      const size = Math.max(0, Math.min(3, Math.floor(amt * 4)) - (hash(3) < 0.3 ? 2 : hash(3) < 0.55 ? 1 : 0));
      g2Glow(cx, cy + 2, TILE * 0.5 * pulse, `rgba(67,243,236,${0.07 + amt * 0.09})`);
      const spr = bakeCrystal(Math.floor(hash(0) * 8), size);
      const ox = (hash(1) - 0.5) * 18, oy = (hash(2) - 0.5) * 12;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, cx + ox - CRY_AX, cy + oy + 6 - CRY_AY);
      ctx.imageSmoothingEnabled = true;
      // a rare four-point glint on the tip
      if (Math.sin(T * 1.3 + x * 3.1 + y * 5.7) > 0.985) {
        const sx = cx + ox, sy = cy + oy + 6 - (24 + size * 5);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4); ctx.stroke();
      }
    }

  // neutral objectives: flux vents & watchtowers with owner ring + capture arc
  for (const n of game.neutrals) {
    if (!explored[idx(n.tx, n.ty)]) continue;
    const cx = n.tx * TILE + TILE / 2, cy = n.ty * TILE + TILE / 2;
    const ownerCol = n.owner >= 0 ? TEAM_COLORS[n.owner] : '#8a8578';
    // control ring on the ground
    ctx.strokeStyle = ownerCol; ctx.globalAlpha = 0.75; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    if (n.kind === 'vent') {
      // rocky fumarole with a breathing flux plume
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(cx + 2, cy + 5, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      const rg = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 13);
      rg.addColorStop(0, '#7a6a58'); rg.addColorStop(0.7, '#4a3f32'); rg.addColorStop(1, '#241d14');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#120d08';
      ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(T * 2.4 + n.id);
      g2Glow(cx, cy - 4 - pulse * 5, 5 + pulse * 4, `rgba(67,243,236,${0.35 + pulse * 0.35})`);
    } else {
      // watchtower: stone pillar with a rotating scanner light
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(cx + 2, cy + 8, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      const tg2 = ctx.createLinearGradient(cx - 6, cy - 22, cx + 6, cy + 8);
      tg2.addColorStop(0, '#9a938a'); tg2.addColorStop(0.5, '#6a635a'); tg2.addColorStop(1, '#3a352e');
      ctx.fillStyle = tg2;
      ctx.fillRect(cx - 5, cy - 22, 10, 30);
      ctx.fillStyle = '#2a2620';
      ctx.fillRect(cx - 7, cy - 26, 14, 6);
      const ang = T * 1.5 + n.id;
      ctx.strokeStyle = `rgba(255,215,110,${n.owner >= 0 ? 0.8 : 0.25})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - 23);
      ctx.lineTo(cx + Math.cos(ang) * 16, cy - 23 + Math.sin(ang) * 7); ctx.stroke();
      g2Glow(cx, cy - 23, 3, n.owner >= 0 ? 'rgba(255,215,110,0.9)' : 'rgba(120,110,90,0.5)');
    }
    // capture progress arc
    if (n.prog > 0 && n.progOwner >= 0) {
      ctx.strokeStyle = TEAM_COLORS[n.progOwner]; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + (n.prog / CAPTURE_TIME) * Math.PI * 2);
      ctx.stroke();
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
    drawBld(s, px, py);
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
    if (u.def.air) continue; // aircraft draw in the top layer, after effects
    if (u.owner !== PLAYER && !visible[idx(tileOf(u.x), tileOf(u.y))]) continue;
    const moving = !!u.path && u.path.length > 0;
    const frame = moving ? 1 + (Math.floor(T * 6 + u.id) % 2) : 0;
    const s = sprite('u', u.def.id, u.owner, dirIndex(u.facing) * 3 + frame);
    const sw = s.width / kOf(s), sh = s.height / kOf(s);
    const va = refinedStyle ? VEHICLE_ART[u.def.id] : undefined;
    if (va) {
      // soft shadow and team glow pooled under the hull
      const tr = va.reach * 0.9;
      const tg = ctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, tr);
      tg.addColorStop(0, TEAM_COLORS[u.owner] + '90'); tg.addColorStop(0.6, TEAM_COLORS[u.owner] + '40'); tg.addColorStop(1, TEAM_COLORS[u.owner] + '00');
      ctx.save(); ctx.translate(0, u.y); ctx.scale(1, 0.55); ctx.translate(0, -u.y);
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(u.x, u.y, tr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.beginPath(); ctx.ellipse(u.x + 4, u.y + 3, va.reach * 0.62, va.reach * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    } else if (refinedStyle) {
      // team identity as a soft glow on the ground, under a softer shadow
      const tr = sw * 0.55;
      const tg = ctx.createRadialGradient(u.x, u.y + sh * 0.3, 0, u.x, u.y + sh * 0.3, tr);
      tg.addColorStop(0, TEAM_COLORS[u.owner] + 'b0'); tg.addColorStop(0.55, TEAM_COLORS[u.owner] + '55'); tg.addColorStop(1, TEAM_COLORS[u.owner] + '00');
      ctx.save(); ctx.translate(0, u.y + sh * 0.3); ctx.scale(1, 0.38); ctx.translate(0, -(u.y + sh * 0.3));
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(u.x, u.y + sh * 0.3, tr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(u.x + 2, u.y + sh * 0.32, sw * 0.32, sh * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // flat sliver of shadow at the feet — offset SE like the buildings
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + sh * 0.34, sw * 0.42, sh * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (va) {
      drawVehicle(u, moving);
    } else if (u.def.harvester) {
      // hover drone: floats with a soft downdraft glow
      const bob = Math.sin(T * 3 + u.id) * 2;
      g2Glow(u.x, u.y + 6, 7, 'rgba(120,200,255,0.25)');
      ctx.drawImage(s, u.x - sw / 2, u.y - sh / 2 - 6 + bob, sw, sh);
    } else {
      ctx.drawImage(s, u.x - sw / 2, u.y - sh * 0.62, sw, sh);
    }
    if (u.def.harvester && u.cargo > 10) {
      g2Glow(u.x, u.y, 5 + (u.cargo / 500) * 5, `rgba(67,243,236,${0.25 + (u.cargo / 500) * 0.45})`);
    }
    // active-ability visual states
    const ab = u.def.ability;
    if (ab && game.abilityOn(u)) {
      if (ab.id === 'siege') {
        // deployed: amber range ring + anchor spikes
        ctx.strokeStyle = 'rgba(255,176,46,0.28)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(u.x, u.y, game.unitRange(u) * TILE, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 2;
        for (const a of [0.6, 2.2, 3.8, 5.4]) {
          ctx.beginPath();
          ctx.moveTo(u.x + Math.cos(a) * u.def.radius, u.y + Math.sin(a) * u.def.radius * 0.6 + 4);
          ctx.lineTo(u.x + Math.cos(a) * (u.def.radius + 6), u.y + Math.sin(a) * (u.def.radius + 6) * 0.6 + 8);
          ctx.stroke();
        }
      } else if (ab.id === 'brace') {
        // shield bubble
        const pulse = 0.5 + 0.3 * Math.sin(T * 5 + u.id);
        ctx.strokeStyle = `rgba(120,200,255,${0.4 + pulse * 0.4})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(u.x, u.y - u.def.radius * 0.3, u.def.radius + 5, 0, Math.PI * 2); ctx.stroke();
      } else if (ab.id === 'overdrive') {
        g2Glow(u.x, u.y, u.def.radius, 'rgba(255,120,40,0.35)');
      } else if (ab.id === 'overcharge') {
        g2Glow(u.x, u.y, u.def.radius, 'rgba(200,139,255,0.4)');
      }
    }
    // veterancy chevrons (Veteran = 1, Elite = 2) + gold glint for Elite
    if (u.rank > 0) {
      if (u.rank === 2) g2Glow(u.x, u.y, u.def.radius * 0.8, 'rgba(255,215,110,0.22)');
      const cy2 = u.y - u.def.radius - 15;
      ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      for (let c = 0; c < u.rank; c++) {
        const cyy = cy2 - c * 3.5;
        ctx.beginPath();
        ctx.moveTo(u.x - 4, cyy); ctx.lineTo(u.x, cyy - 3); ctx.lineTo(u.x + 4, cyy);
        ctx.stroke();
      }
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

  // incoming orbital strikes: pulsing target reticle → searing beam at impact
  for (const s of strikes) {
    const left = s.delay - s.t;             // seconds to impact
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(T * 6));
    ctx.strokeStyle = `rgba(255,80,40,${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.stroke();
    const rIn = s.radius * (left / s.delay);  // shrinking ring counts down
    ctx.strokeStyle = 'rgba(255,180,60,0.9)';
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(2, rIn), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,120,50,${0.5 + pulse * 0.4})`; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x - s.radius - 6, s.y); ctx.lineTo(s.x + s.radius + 6, s.y);
    ctx.moveTo(s.x, s.y - s.radius - 6); ctx.lineTo(s.x, s.y + s.radius + 6);
    ctx.stroke();
    if (left < 0.35) { // searing beam slams down from the sky just before impact
      const bw = 10 + (0.35 - left) * 120;
      const bg = ctx.createLinearGradient(s.x - bw, 0, s.x + bw, 0);
      bg.addColorStop(0, 'rgba(255,120,40,0)');
      bg.addColorStop(0.5, 'rgba(255,240,200,0.85)');
      bg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(s.x - bw, camera.y, bw * 2, s.y - camera.y);
    }
  }

  // orbital-strike aiming reticle at the cursor
  const aim = strikeAim();
  if (aim) {
    const rr2 = (BUILDINGS['uplink'].superweapon?.radius ?? 3) * TILE;
    ctx.strokeStyle = 'rgba(255,90,50,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, rr2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(aim.x, aim.y, rr2 * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(aim.x - rr2 - 8, aim.y); ctx.lineTo(aim.x + rr2 + 8, aim.y);
    ctx.moveTo(aim.x, aim.y - rr2 - 8); ctx.lineTo(aim.x, aim.y + rr2 + 8);
    ctx.stroke();
  }

  // aircraft — top layer, above buildings and effects, with altitude + shadow
  const AIR_ALT = 26;
  for (const u of units) {
    if (!u.def.air) continue;
    if (u.owner !== PLAYER && !visible[idx(tileOf(u.x), tileOf(u.y))]) continue;
    const key = `a:${u.def.id}:${u.owner}`;
    let s = sprites.get(key);
    if (!s) { s = bakeAirSprite(u.def.id, u.owner, refinedStyle); sprites.set(key, s); }
    const bob = Math.sin(T * 2.2 + u.id) * 2;
    // ground shadow, offset from the airframe so the altitude reads
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(u.x + 8, u.y + 10, u.def.radius * 0.9, u.def.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    if (refinedStyle && VEHICLE_ART[u.def.id]) {
      // baked per heading so the sun stays put as it turns; lifted to altitude
      drawVehicle(u, false, AIR_ALT - bob);
    } else {
      ctx.save();
      ctx.translate(u.x, u.y - AIR_ALT + bob);
      ctx.rotate(u.facing);
      const ak = kOf(s);
      ctx.drawImage(s, -s.width / ak / 2, -s.height / ak / 2, s.width / ak, s.height / ak);
      ctx.restore();
    }
    const sel = selection.has(u.id);
    if (sel || u.hp < u.maxHp) {
      const w2 = u.def.radius * 2.2;
      drawHealthBar(u.x - w2 / 2, u.y - AIR_ALT - u.def.radius - 8 + bob, w2, u.hp / u.maxHp);
    }
    if (sel) {
      const r2 = u.def.radius + 5;
      cornersSel(u.x - r2, u.y - AIR_ALT - r2 + bob, r2 * 2, r2 * 2);
    }
  }

  // alert pings — expanding rings where the player is being attacked
  for (const p of game.pings) {
    const k = p.t / 2.2;
    const r = 8 + k * 46;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
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
    drawBld(gs, placement.tx * TILE, placement.ty * TILE);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // vignette
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(18,8,4,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);

  // orbital-strike screen flash: white core fading through fiery orange
  if (game.flash > 0) {
    const f = game.flash;
    ctx.fillStyle = `rgba(255,${170 + f * 60},${120 + f * 80},${f * 0.55})`;
    ctx.fillRect(0, 0, vw, vh);
  }

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
      if (!explored[i]) { mmCtx.fillStyle = '#000'; mmCtx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5); }
      else if (crystal[i] > 0) { mmCtx.fillStyle = '#1fa39d'; mmCtx.fillRect(x * sx, y * sy, sx, sy); }
    }
  // neutral objectives as diamonds (grey until captured)
  for (const n of game.neutrals) {
    if (!explored[idx(n.tx, n.ty)]) continue;
    const mx = n.tx * sx, my = n.ty * sy;
    mmCtx.fillStyle = n.owner >= 0 ? TEAM_COLORS[n.owner] : '#b0a890';
    mmCtx.beginPath();
    mmCtx.moveTo(mx, my - 3); mmCtx.lineTo(mx + 3, my); mmCtx.lineTo(mx, my + 3); mmCtx.lineTo(mx - 3, my);
    mmCtx.closePath(); mmCtx.fill();
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
  // alert pings on the minimap — blinking rings
  for (const p of game.pings) {
    if (Math.floor(p.t * 6) % 2) continue; // blink
    mmCtx.strokeStyle = p.color; mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.arc((p.x / TILE) * sx, (p.y / TILE) * sy, 4 + (p.t / 2.2) * 6, 0, Math.PI * 2);
    mmCtx.stroke();
  }
  const { w, h } = viewSize();
  mmCtx.strokeStyle = '#fffa'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect((camera.x / TILE) * sx, (camera.y / TILE) * sy, (w / camera.zoom / TILE) * sx, (h / camera.zoom / TILE) * sy);
}
