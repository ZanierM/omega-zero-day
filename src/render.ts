import { TILE, TEAM_COLORS, BUILDINGS, UNITS, PLAYER, CAPTURE_TIME, CAPTURE_RADIUS, FACTION_NAMES, kindOf, SLOTS, hostile, isClan } from './config';
import * as telemetry from './telemetry';
import { setListener, sfxAt } from './audio';
import { skinOf, skinBuilding, skinUnit } from './faction-skin';
import './clan-art';   // adds the Ashen Clans to art.ts's registries
import './hollow-art';  // and the Hollow
import './brood-art';   // and the brood
import './kessler-art'; // and Kessler's own shapes ('k:' entries)
import './keeper-art';  // and the Keepers
import './helion-art';  // and Helion's troops
import { MAP_W, MAP_H, terrain, crystal, idx, land, Land } from './map';
import * as game from './game';
import { units, buildings, beams, booms, shells, strikes, explored, visible, tileOf, Unit, Building, canPlace, byId, packedAway } from './game';
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
// NG is a power of two, so wrapping the lattice is a mask (also for negatives)
const NGM = NG - 1;
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const x0 = xi & NGM, x1 = (xi + 1) & NGM, r0 = (yi & NGM) * NG, r1 = ((yi + 1) & NGM) * NG;
  const v00 = ngrid[r0 + x0], v10 = ngrid[r0 + x1], v01 = ngrid[r1 + x0], v11 = ngrid[r1 + x1];
  const top = v00 + (v10 - v00) * sx;
  return top + ((v01 + (v11 - v01) * sx) - top) * sy;
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

let terrainTex: HTMLCanvasElement | null = null;
// the ground is painted at full resolution with smooth colour and fine clutter
let texScale = 1;
// the decoration layout is seeded per game so a saved match repaints the same map
let terrainSeed = -1;

// 2×2 ordered-dither offsets: quantized colour bands break into a checker
// pattern instead of hard steps, the classic 16-bit shading trick
const BAYER = [0, 0.5, 0.75, 0.25];

interface Pal { out: string, dk: string, mid: string, lt: string, hi: string }
const ROCK_GREY: Pal = { out: '#2a201d', dk: '#5a4c46', mid: '#85776e', lt: '#ad9f92', hi: '#d8ccbc' };
const ROCK_RED: Pal = { out: '#2c170f', dk: '#683724', mid: '#93553a', lt: '#bb7b52', hi: '#e6ab7a' };
const BASALT: Pal = { out: '#141214', dk: '#2e2a2c', mid: '#4a4446', lt: '#6a6264', hi: '#948a88' };
const CONCRETE: Pal = { out: '#1e1c1a', dk: '#4a4640', mid: '#6e6a62', lt: '#8e8a80', hi: '#b8b2a6' };
// each landscape's ground: base colour (and how much height lifts it), its second patch colour, how green it gets
interface Look { base: [number, number, number, number, number, number]; patch: [number, number, number, number, number, number]; patchBias: number; veg: number }
const LOOKS: Record<Land, Look> = {
  scrub:  { base: [132, 74, 82, 46, 46, 24], patch: [124, 48, 100, 40, 86, 32], patchBias: 0, veg: 1 },     // ochre sand, ash flats, olive scrub
  ash:    { base: [112, 50, 104, 46, 98, 42], patch: [66, 30, 62, 28, 62, 26], patchBias: 0.06, veg: 0 },   // grey ash with charcoal drifts
  canyon: { base: [150, 70, 80, 40, 54, 24], patch: [120, 40, 138, 44, 136, 42], patchBias: -0.04, veg: 0.4 },   // red rock, pale crystal dust
  ruins:  { base: [118, 54, 110, 50, 96, 44], patch: [72, 26, 72, 26, 76, 26], patchBias: 0.04, veg: 1.3 },   // dusty paving, old asphalt, weeds
};
const TREE_TEAL: Pal = { out: '#11231c', dk: '#1f4236', mid: '#2f6b55', lt: '#4f9a72', hi: '#93cf8c' };
const TREE_PURPLE: Pal = { out: '#1b1226', dk: '#36234c', mid: '#573a76', lt: '#8460a6', hi: '#c49edc' };

// Painted in slices that pause every ~12 ms, so the page keeps drawing frames
// (the briefing's "Deploying…" stays live) instead of freezing while a large
// map is built. A newer paint (a style flip mid-paint) supersedes an older one.
let paintGen = 0;
async function paintTerrain() {
  const gen = ++paintGen;
  if (terrainSeed < 0) terrainSeed = 1 + Math.floor(Math.random() * 2147483645);
  // its own generator, seeded per game: a pause must not let sprite baking draw
  // from the shared one and shift where rocks and props land
  let rs = terrainSeed;
  const rand = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  let lastYield = performance.now();
  const pace = async () => {
    if (performance.now() - lastYield < 12) return true;
    await new Promise(r => setTimeout(r, 0));
    lastYield = performance.now();
    return gen === paintGen;
  };
  const fine = true;
  const P = texScale = 1;
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
  const waterBase = (x: number, y: number) => {
    const fx = x / TILE - 0.5, fy = y / TILE - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ax = fx - ix, ay = fy - iy;
    const top = wet(ix, iy) * (1 - ax) + wet(ix + 1, iy) * ax;
    const bot = wet(ix, iy + 1) * (1 - ax) + wet(ix + 1, iy + 1) * ax;
    return top * (1 - ay) + bot * ay + (noise(x / 11 + 70, y / 11) - 0.5) * 0.3;
  };
  const shoreWobble = 0;                      // smooth shorelines
  const waterAt = (x: number, y: number) =>
    waterBase(x, y) + (shoreWobble ? (noise(x / 5 + 9, y / 5) - 0.5) * shoreWobble : 0);

  // the broad fields (basins, the first octave of the bumps, sand/ash/scrub
  // patches, lake shapes) change over tens of pixels, so they're sampled every
  // S texture pixels and blended; only the finer bumps and grain are worked out
  // per pixel. This was the bulk of a ~1.2 s freeze on deploy.
  const S = 4, CW = Math.ceil(TW / S) + 2, CH = Math.ceil(TH / S) + 2;
  const nC = new Float32Array(CW * CH), dC = new Float32Array(CW * CH);
  const ashC = new Float32Array(CW * CH), vegC = new Float32Array(CW * CH), wC = new Float32Array(CW * CH);
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const x = cx * S * P, y = cy * S * P, i = cy * CW + cx;
      nC[i] = fbm(x / 110, y / 110);
      dC[i] = noise(x / 34 + 300, y / 34);
      ashC[i] = noise(x / 140 + 40, y / 140);
      vegC[i] = noise(x / 70 + 200, y / 70 + 90);
      wC[i] = waterBase(x, y);
    }

  const img = g.createImageData(TW, TH);
  const d = img.data;
  // slope lighting: compare each pixel's height with its NW neighbours so the
  // noise reads as actual relief lit from the north-west
  const prevRow = new Float32Array(TW);
  let left = 0;
  const STEP = 9;
  for (let py = 0; py < TH; py++) {
    if (!(await pace())) return;
    const fy = py / S, iy = fy | 0, ty = fy - iy, row = iy * CW;
    for (let px = 0; px < TW; px++) {
      const x = px * P, y = py * P;
      const fx = px / S, ix = fx | 0, tx = fx - ix;
      const c00 = row + ix, c10 = c00 + 1, c01 = c00 + CW, c11 = c01 + 1;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const n = nC[c00] * w00 + nC[c10] * w10 + nC[c01] * w01 + nC[c11] * w11;        // broad basins and plateaus
      const X = x / 34 + 300, Y = y / 34;                                                 // small bumps
      const detail = (dC[c00] * w00 + dC[c10] * w10 + dC[c01] * w01 + dC[c11] * w11) * 0.55
        + noise(X * 2.7, Y * 2.7) * 0.3 + noise(X * 7.1, Y * 7.1) * 0.15;
      const hgt = n * 0.75 + detail * 0.25;
      const grain = noise(x / 5, y / 5);
      const m = hgt * 0.8 + grain * 0.2;

      // sunlit ochre desert under a swollen red sun: warm sand, cooler ash
      // flats and olive scrub, each in crisp-edged patches
      const L = LOOKS[land], B = L.base, Pt = L.patch;
      let r = B[0] + m * B[1], gg = B[2] + m * B[3], b = B[4] + m * B[5];
      const ashN = ashC[c00] * w00 + ashC[c10] * w10 + ashC[c01] * w01 + ashC[c11] * w11;
      const ashMix = Math.min(1, Math.max(0, (ashN - 0.56 + L.patchBias) * 6));
      r = r * (1 - ashMix) + (Pt[0] + m * Pt[1]) * ashMix;
      gg = gg * (1 - ashMix) + (Pt[2] + m * Pt[3]) * ashMix;
      b = b * (1 - ashMix) + (Pt[4] + m * Pt[5]) * ashMix;
      const vegN = vegC[c00] * w00 + vegC[c10] * w10 + vegC[c01] * w01 + vegC[c11] * w11;
      const veg = Math.min(0.9, Math.max(0, (vegN - 0.57) * 5)) * (0.75 + grain * 0.35) * Math.min(1, L.veg) * (L.veg > 1 ? 1.2 : 1);
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
      const w = wC[c00] * w00 + wC[c10] * w10 + wC[c01] * w01 + wC[c11] * w11
        + (shoreWobble ? (noise(x / 5 + 9, y / 5) - 0.5) * shoreWobble : 0);
      if (w > 0.5) {
        const depth = Math.min(1, (w - 0.5) * 3.2);
        r = 72 - depth * 46; gg = 160 - depth * 84; b = 178 - depth * 50;
        if (noise(x / 16 + 11, y / 3.2) > 0.8) { r += 30; gg += 34; b += 34; } // ripples
        if (fine) {
          // a soft foam band fading out into the shallows
          const f = Math.max(0, 1 - (w - 0.5) / 0.06) * 0.9;
          r = r * (1 - f) + 220 * f; gg = gg * (1 - f) + 230 * f; b = b * (1 - f) + 216 * f;
        } else if (w < 0.54) { r = 220; gg = 230; b = 216; }                    // foam
      } else if (w > 0.3) {
        const t = (w - 0.3) / 0.2;    // 0 at the dry edge → 1 at the waterline
        r = r * (1 - t) + (214 - t * 54) * t;
        gg = gg * (1 - t) + (182 - t * 52) * t;
        b = b * (1 - t) + (128 - t * 36) * t;
      }

      const i = (py * TW + px) * 4;
      if (fine) {
        // smooth colour with a fine natural grain instead of stepped, dithered bands
        const gr = (noise(x / 2.6 + 17, y / 2.6) - 0.5) * 10 + (noise(x / 9 + 5, y / 9 + 3) - 0.5) * 7;
        d[i] = r + gr; d[i + 1] = gg + gr * 0.92; d[i + 2] = b + gr * 0.8;
      } else {
        const dth = BAYER[(py & 1) * 2 + (px & 1)];
        d[i] = Math.floor(r / STEP + dth) * STEP;
        d[i + 1] = Math.floor(gg / STEP + dth) * STEP;
        d[i + 2] = Math.floor(b / STEP + dth) * STEP;
      }
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

  if (!(await pace())) return;
  // impact craters: dark bowl, lit far rim, shadowed near rim
  const craters = Math.floor(MAP_W * MAP_H / 110);
  for (let n = 0; n < craters; n++) {
    const cx = rand() * W, cy = rand() * H, r = 10 + rand() * 24;
    if (!dry(cx, cy)) continue;
    const grd = g.createRadialGradient(cx + r * 0.15, cy + r * 0.1, r * 0.1, cx, cy, r);
    grd.addColorStop(0, 'rgba(60,26,12,0.5)');
    grd.addColorStop(0.75, 'rgba(60,26,12,0.22)');
    grd.addColorStop(1, 'rgba(60,26,12,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = fine ? 1.6 : 3;
    g.strokeStyle = 'rgba(255,224,170,0.35)';
    g.beginPath(); g.ellipse(cx, cy, r * 0.8, r * 0.64, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
    g.strokeStyle = 'rgba(50,22,10,0.35)';
    g.beginPath(); g.ellipse(cx, cy, r * 0.8, r * 0.64, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  }

  // hairline cracks
  g.strokeStyle = 'rgba(56,24,12,0.38)';
  g.lineWidth = fine ? 1.1 : 2;
  const cracks = Math.floor(MAP_W * MAP_H / 50);
  for (let n = 0; n < cracks; n++) {
    let x = rand() * W, y = rand() * H;
    if (!dry(x, y)) continue;
    let a = rand() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * (6 + rand() * 10);
      y += Math.sin(a) * (6 + rand() * 10);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  if (!(await pace())) return;
  // pixel-scale clutter, the detail that makes old maps feel busy: pebbles with
  // a lit top and a dark underside, and tufts of dry scrub (texture pixels)
  g.setTransform(1, 0, 0, 1, 0, 0);
  const pebbles = MAP_W * MAP_H * 2;
  for (let n = 0; n < pebbles; n++) {
    const x = Math.floor(rand() * TW), y = Math.floor(rand() * TH);
    if (!dry(x * P, y * P)) continue;
    const sz = rand() < 0.3 ? 2 : 1;
    const lit = rand() < 0.5 ? '#d2b892' : '#a98a6a';
    if (fine) {
      const r = sz === 2 ? 1.7 : 1.05;
      g.fillStyle = 'rgba(48,24,12,0.45)';
      g.beginPath(); g.ellipse(x + 0.5, y + r * 0.55, r * 1.15, r * 0.55, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = lit; g.beginPath(); g.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,245,225,0.45)'; g.fillRect(x - r * 0.5, y - r * 0.5, r * 0.6, r * 0.35);
      continue;
    }
    g.fillStyle = 'rgba(48,24,12,0.6)';
    g.fillRect(x, y + 1, sz, 1);
    g.fillStyle = lit;
    g.fillRect(x, y + 1 - sz, sz, sz);
  }
  const tufts = Math.floor(MAP_W * MAP_H * 0.8);
  for (let n = 0; n < tufts; n++) {
    const x = Math.floor(rand() * TW), y = Math.floor(rand() * TH);
    if (!dry(x * P, y * P)) continue;
    const hue = rand();
    const blades = 2 + Math.floor(rand() * 3);
    // refined: twice the blades at half the width, so a tuft is finer, not bigger
    const u = fine ? 2 : 1, n = blades * (fine ? 2 : 1), bw = fine ? 0.8 : 1;
    g.fillStyle = 'rgba(40,22,10,0.45)';
    g.fillRect(x - u, y, (blades + 2) * u, fine ? 0.8 : 1);
    for (let k = 0; k < n; k++) {
      const h = (1 + Math.floor(rand() * 3)) * u * (fine ? 0.8 : 1);
      g.fillStyle = hue < 0.6 ? '#76762f' : hue < 0.85 ? '#a08e3a' : '#5e5026';
      g.fillRect(x + k * (fine ? 1 : 1), y - h, bw, h);
      g.fillStyle = '#e4d58e';
      if (rand() < 0.5) g.fillRect(x + k, y - h, bw, fine ? 0.8 : 1);
    }
  }

  g.setTransform(1 / P, 0, 0, 1 / P, 0, 0);

  if (!(await pace())) return;
  // drifting cloud shadows: huge soft dark patches give the plain a sense of
  // scale and break up the even lighting
  const clouds = Math.max(3, Math.floor(W * H / (520 * 520)));
  for (let n = 0; n < clouds; n++) {
    const cx = rand() * W, cy = rand() * H, r = 160 + rand() * 220;
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
    const tx = 1 + Math.floor(rand() * (MAP_W - 2));
    const ty = 1 + Math.floor(rand() * (MAP_H - 2));
    const i = idx(tx, ty);
    if (terrain[i] !== 0 || crystal[i] > 0) continue;
    const file = FLORA_SPRITES[Math.floor(rand() * FLORA_SPRITES.length)];
    const tall = file === 'env_17' || file === 'env_19';
    stamp(file, tx * TILE + TILE / 2 + (rand() - 0.5) * 14, ty * TILE + TILE / 2 + (rand() - 0.5) * 14,
      tall ? 30 + rand() * 16 : 18 + rand() * 10);
  }

  if (!(await pace())) return;
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
        const pal = land === 'ash' ? BASALT : land === 'ruins' ? CONCRETE : land === 'canyon' || noise(tx / 6 + 50, ty / 6) > 0.55 ? ROCK_RED : ROCK_GREY;
        // tiles deep inside a formation get the biggest boulders so outcrops
        // build up into a mound instead of a grid of equal stones
        let inner = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
          if (terrain[idx(Math.min(MAP_W - 1, Math.max(0, tx + dx)), Math.min(MAP_H - 1, Math.max(0, ty + dy)))] === 1) inner++;
        const big = 10 + inner * 1.4 + rand() * 6;
        pieces.push({ x: cx + (rand() - 0.5) * 22, y: cy + (rand() - 0.5) * 18, r: big, pal, tree: false, seed: rand() });
        const extra = Math.floor(rand() * 3);
        for (let k = 0; k < extra; k++)
          pieces.push({ x: cx + (rand() - 0.5) * 34, y: cy + (rand() - 0.5) * 28, r: 5 + rand() * 6, pal, tree: false, seed: rand() });
      } else {
        const pal = noise(tx / 7 + 9, ty / 7 + 30) > 0.62 ? TREE_PURPLE : TREE_TEAL;
        const trees = 2 + (rand() < 0.4 ? 1 : 0);
        for (let k = 0; k < trees; k++)
          pieces.push({ x: cx + (rand() - 0.5) * 28, y: cy + (rand() - 0.5) * 24, r: 9 + rand() * 9, pal, tree: true, seed: rand() });
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
  for (const p of pieces) p.tree ? drawTree(g, p.x, p.y, p.r, p.pal, p.seed) : land === 'ruins' ? drawRuin(g, p.x, p.y, p.r, p.pal, p.seed) : drawBoulder(g, p.x, p.y, p.r, p.pal, p.seed);

  g.setTransform(1, 0, 0, 1, 0, 0);
  if (gen === paintGen) terrainTex = tex;
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
  g.lineWidth = 1.5; g.strokeStyle = pal.out; g.fillStyle = pal.mid;
  path(); g.stroke(); g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = pal.dk;
  g.beginPath(); g.ellipse(cx + r * 0.45, by + r * 0.4, r * 0.95, r * 0.6, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.lt;
  g.beginPath(); g.ellipse(cx - r * 0.25, by - r * 0.4, r * 0.7, r * 0.45, -0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.hi;
  g.beginPath(); g.ellipse(cx - r * 0.38, by - r * 0.52, r * 0.26, r * 0.15, -0.3, 0, Math.PI * 2); g.fill();
  if (r > 10) {
    g.strokeStyle = pal.out; g.lineWidth = 1; g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(cx + r * 0.1, by - r * 0.3); g.lineTo(cx + r * 0.25, by + r * 0.05); g.lineTo(cx + r * 0.15, by + r * 0.35); g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
}

// a broken concrete block from the dead colony town: a lit roof slab, a shadowed face, dark window holes
function drawRuin(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, pal: Pal, seed: number) {
  const w = r * 1.5, h = r * (0.9 + (seed * 7 % 1) * 0.8), d = r * 0.6;
  const x0 = cx - w / 2, yb = cy + d / 2;
  g.lineWidth = 1.2; g.strokeStyle = pal.out;
  g.fillStyle = pal.dk; g.fillRect(x0, yb - h, w, h); g.strokeRect(x0, yb - h, w, h);   // the face toward us
  // a broken roofline: the slab stepped down where it fell in
  const cut = (seed * 13 % 1) * w * 0.6;
  g.fillStyle = pal.lt;
  g.beginPath(); g.moveTo(x0, yb - h); g.lineTo(x0 + d * 0.6, yb - h - d); g.lineTo(x0 + w - cut + d * 0.6, yb - h - d); g.lineTo(x0 + w - cut, yb - h); g.closePath(); g.fill(); g.stroke();
  if (cut > 2) { g.fillStyle = pal.mid; g.fillRect(x0 + w - cut, yb - h * 0.7, cut, h * 0.7); g.strokeRect(x0 + w - cut, yb - h * 0.7, cut, h * 0.7); }
  g.fillStyle = 'rgba(10,8,8,0.75)';
  for (let row = 0; row < Math.floor(h / 7); row++) for (let col = 0; col < Math.floor(w / 6); col++)
    if ((seed * 31 + row * 7 + col * 3) % 1 > 0.35) g.fillRect(x0 + 2 + col * 6, yb - h + 3 + row * 7, 3, 3.5);
  g.fillStyle = pal.hi; g.fillRect(x0, yb - h, w - cut, 1);
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
  const rim = 0.8;
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r + rim, 0, Math.PI * 2); g.fill(); }
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
export function bakeAirSprite(defId: string, owner: number): HTMLCanvasElement {
  const def = UNITS[defId];
  const team = TEAM_COLORS[owner];
  const S = def.radius * 3, k = 3;
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
  g.setTransform(1, 0, 0, 1, 0, 0);
  finish(c, 2, owner);
  (c as Scaled).k = k;
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
// Kessler draws its own art where it has some ('k:<id>' in the registries), Helion's otherwise
const own = (owner: number) => SLOTS[owner] === 'kessler';
const vArt = (id: string, owner: number) => (own(owner) && VEHICLE_ART['k:' + id]) || VEHICLE_ART[id];
const bArt = (id: string, owner: number) => (own(owner) && BUILDING_ART['k:' + id]) || BUILDING_ART[id];
const tArt = (id: string, owner: number) => (own(owner) && TURRET_ART['k:' + id]) || TURRET_ART[id];
// the old paint-over only for what Kessler doesn't draw itself
const skinFor = (owner: number, id: string, kind: 'v' | 'b') => (own(owner) && (kind === 'v' ? VEHICLE_ART : BUILDING_ART)['k:' + id] ? null : skinOf(owner));
const vehAngles = (defId: string) => VEHICLE_ART[defId]!.frames ? 24 : VEH_ANGLES;
function rotatedPart(key: string, reach: number, height: number, paint: (g: CanvasRenderingContext2D) => void, skinOwner = -1, owner = -1): VehPart {
  let s = sprites.get(key) as VehPart | undefined;
  if (!s) {
    const k = 3, ww = reach * 2 + 4, wh = ww + height;
    const [c, g] = makeCanvas(ww * k, wh * k);
    g.scale(k, k); g.translate(ww / 2, ww / 2 + height);
    setFineArt(true);
    paint(g);
    setFineArt(false);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const skin = skinOwner >= 0 ? skinOf(skinOwner) : null;
    if (skin) skinUnit(c, skin);
    finish(c, 2, owner);
    s = c as VehPart; s.k = k; s.ox = ww / 2; s.oy = ww / 2 + height; s.ww = ww; s.wh = wh;
    sprites.set(key, s);
  }
  return s;
}
function vehiclePart(defId: string, owner: number, part: 'hull' | 'turret', i: number, frame = 0): VehPart {
  const va = vArt(defId, owner)!;
  const ang = (i / vehAngles(defId)) * Math.PI * 2;
  return rotatedPart(`v:${defId}:${owner}:${part}:${i}:${frame}`, va.reach, va.height, g => {
    if (part === 'hull') va.hull(g, ang, TEAM_COLORS[owner], frame / (va.frames ?? 1));
    else va.turret?.(g, ang, TEAM_COLORS[owner]);
  }, skinFor(owner, defId, 'v') ? owner : -1, owner);
}
// a defence's aiming head, eased toward its target and drawn at its pivot
function drawDefenceHead(b: Building, px: number, py: number) {
  const ta = tArt(b.def.id, b.owner)!, s = b.def.w * TILE / (b.def.w * 32);
  const v = vehViz.get(b.id) ?? { hull: b.facing, tur: b.facing };
  vehViz.set(b.id, v);
  v.tur = turnToward(v.tur, b.facing, 6 * vizDt);
  const i = headingIndex(v.tur, VEH_ANGLES);
  const head = rotatedPart(`d:${b.def.id}:${b.owner}:${i}`, ta.reach, ta.height,
    g => ta.head(g, (i / VEH_ANGLES) * Math.PI * 2, TEAM_COLORS[b.owner]), own(b.owner) && !TURRET_ART['k:' + b.def.id] ? b.owner : -1, b.owner);
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
  const va = vArt(u.def.id, u.owner)!, n = vehAngles(u.def.id);
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
  // the Hollow rising out of the ground: sunk and faint at first, the ground line cutting off what's still under it
  const rise = u.emergeT ? Math.min(1, u.emergeT / game.EMERGE_TIME) : 0;
  if (rise) { ctx.save(); ctx.beginPath(); ctx.rect(u.x - 60, u.y - 120, 120, 120 + 4); ctx.clip(); ctx.globalAlpha = 1 - rise * 0.5; }
  const sink = rise * (va.height + 6);
  for (const part of va.turret ? ['hull', 'turret'] as const : ['hull'] as const) {
    const s = vehiclePart(u.def.id, u.owner, part, headingIndex(part === 'hull' ? v.hull : v.tur, n), part === 'hull' ? frame : 0);
    ctx.drawImage(s, u.x - s.ox, u.y - s.oy + bob - lift + sink, s.ww, s.wh);
  }
  if (rise) ctx.restore();
}

// the gritty finish every code-drawn sprite gets after it's drawn: darker
// toward the ground, worn and dirty, a light sun grade, then more contrast and
// colour than the raw art so nothing reads washed out; line: outline width.
// The Keepers keep their polish: the same contrast, none of the dirt.
function finish(c: HTMLCanvasElement, line: number, owner = -1) {
  const pristine = owner >= 0 && SLOTS[owner] === 'keepers';
  underShade(c, pristine ? 0.12 : 0.35);
  if (!pristine) grime(c, 0.42);
  gradeWarmCool(c, 0.35);
  tone(c, 1.3, 1.25, 0.95);
  outline(c, 'rgba(8,5,4,0.9)', line);
}
// contrast round mid-grey, saturation round luma, gamma (>1 deepens midtones)
function tone(c: HTMLCanvasElement, contrast: number, sat: number, gamma: number) {
  const g = c.getContext('2d')!, im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.pow(Math.max(0, Math.min(1, (i / 255 - 0.5) * contrast + 0.5)), gamma) * 255;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = lut[d[i]], gr = lut[d[i + 1]], b = lut[d[i + 2]], y = 0.299 * r + 0.587 * gr + 0.114 * b;
    d[i] = y + (r - y) * sat; d[i + 1] = y + (gr - y) * sat; d[i + 2] = y + (b - y) * sat;
  }
  g.putImageData(im, 0, 0);
}
// darker toward the ground: ambient occlusion so the sprite sits heavier
function underShade(c: HTMLCanvasElement, amount: number) {
  const g = c.getContext('2d')!;
  g.save(); g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, c.height * 0.35, 0, c.height);
  lg.addColorStop(0, 'rgba(10,6,4,0)'); lg.addColorStop(1, `rgba(10,6,4,${amount})`);
  g.fillStyle = lg; g.fillRect(0, 0, c.width, c.height); g.restore();
}
// dirt and wear, kept inside the sprite: mud caked on the lower half, rust
// and soot streaks running down, fine speckle and chipped paint. Seeded by
// size so every heading of a unit wears the same dirt
function grime(c: HTMLCanvasElement, amount: number) {
  const g = c.getContext('2d')!, W = c.width, H = c.height;
  let sd = W * 7919 + H;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  g.save(); g.globalCompositeOperation = 'source-atop';
  // mud: soft brown patches, thicker toward the ground
  for (let i = 0, n = Math.max(3, (W * H) / 2600); i < n; i++) {
    const x = rnd() * W, y = H * (0.35 + 0.65 * Math.sqrt(rnd())), r = 3 + rnd() * W * 0.12;
    const mg = g.createRadialGradient(x, y, 0, x, y, r);
    mg.addColorStop(0, `rgba(58,40,22,${amount * (0.5 + 0.5 * rnd())})`); mg.addColorStop(1, 'rgba(58,40,22,0)');
    g.fillStyle = mg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // streaks: rust and soot running down from seams
  for (let i = 0, n = (W * H) / 900; i < n; i++) {
    const x = Math.floor(rnd() * W), y = rnd() * H * 0.85, len = 4 + rnd() * H * 0.12, w = 1 + Math.floor(rnd() * 2);
    const sg = g.createLinearGradient(0, y, 0, y + len);
    const col = rnd() < 0.45 ? '110,52,24' : '18,12,8';
    sg.addColorStop(0, `rgba(${col},${amount * (0.6 + 0.4 * rnd())})`); sg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = sg; g.fillRect(x, y, w, len);
  }
  // speckle and chipped paint
  for (let i = 0, n = (W * H) / 30; i < n; i++) {
    g.fillStyle = rnd() < 0.75 ? `rgba(20,14,8,${amount * rnd()})` : `rgba(255,236,210,${amount * 0.5 * rnd()})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.restore();
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
  return bakeUnitSpriteRefined(img, def, owner);
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


function bakeBuildingSprite(defId: string, owner: number, level: number): BldSprite {
  // every structure has hand-drawn art; the procedural bake is only a fallback
  if (bArt(defId, owner)) return bakeRefinedSprite(defId, owner, level);
  return bakeProceduralBuilding(defId, owner);
}

// refined style: hand-drawn art baked at 2× with no pixelation, thin tinted
// edges, a soft blurred shadow and a quiet pad
function bakeRefinedSprite(defId: string, owner: number, level: number): BldSprite {
  const def = BUILDINGS[defId], art = bArt(defId, owner)!;
  const w = def.w * TILE, h = def.h * TILE, k = 2;
  const head = Math.ceil(w * 0.75), m = 6;
  const sw = w + m * 2, baseY = m + head + h;          // structure canvas, world units
  const [st, sg] = makeCanvas(sw * k, (h + head + m * 2) * k);
  sg.scale(k, k); sg.translate(m, m + head);
  setFineArt(true);
  art(sg, w, h, level, TEAM_COLORS[owner]);
  setFineArt(false);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  const skin = skinFor(owner, defId, 'b');
  if (skin && !def.isWall) skinBuilding(st, skin, defId, k);   // the faction's look over the shared shape
  finish(st, 1, owner);          // one device pixel, not two world pixels

  const reachX = Math.ceil(baseY * 0.42), reachY = Math.ceil(baseY * 0.16);
  const cw = Math.max(w, sw) + 16 + reachX * 2;
  const ch = h + Math.max(0, baseY - h) + 16 + reachY;
  const [c, g] = makeCanvas(cw * k, ch * k);
  g.scale(k, k);
  const ox = (cw - w) / 2, oy = ch - h - 6 - reachY;
  if (!def.isWall && !def.nonBuildable && !isClan(owner)) { g.save(); g.translate(ox, oy); drawPadRefined(g, w, h, TEAM_COLORS[owner]); g.restore(); }   // the brood grows straight out of the ground; the Clans build on dirt
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
// crop an icon canvas to its visible pixels so it fills its button
function cropToContent(c: HTMLCanvasElement): HTMLCanvasElement {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0) return c;
  const [t, tg] = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  tg.drawImage(c, -x0, -y0);
  return t;
}

// refined icons are downscaled smoothly here to twice their on-screen box
// (the build bar shows them pixelated), so a 2× screen draws them 1:1
const ICON_MAX_W = 172, ICON_MAX_H = 120;
function iconUrl(c: HTMLCanvasElement): string {
  const t = cropToContent(c);
  const f = Math.min(1, ICON_MAX_W / t.width, ICON_MAX_H / t.height);
  if (f >= 1) return t.toDataURL();
  const [o, og] = makeCanvas(Math.round(t.width * f), Math.round(t.height * f));
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(t, 0, 0, o.width, o.height);
  return o.toDataURL();
}

// Icons take 10–30 ms each to bake, which stalled the first visit to each
// build tab. Bakes are remembered, and every build-bar icon is baked one per
// idle slot (during the briefing, and again after a style flip), so opening a
// tab only ever reads finished icons.
const iconMemo = new Map<string, string | null>();
function memoIcon(key: string, make: () => string | null): string | null {
  let v = iconMemo.get(key);
  if (v === undefined) { v = make(); iconMemo.set(key, v); }
  return v;
}
const whenIdle: (fn: () => void) => void = 'requestIdleCallback' in window
  ? fn => requestIdleCallback(fn, { timeout: 400 })
  : fn => setTimeout(fn, 30);
let warmGen = 0;
function warmIcons() {
  const gen = ++warmGen;               // a newer warm-up (style flip) supersedes this one
  const queue: (() => void)[] = [
    ...Object.keys(BUILDINGS).map(id => () => { artIconUrl(id); }),
    ...Object.keys(UNITS).map(id => () => { unitIconUrl(id); }),
  ];
  const step = () => {
    if (gen !== warmGen) return;
    queue.shift()?.();
    if (queue.length) whenIdle(step);
  };
  whenIdle(step);
}
setTimeout(warmIcons, 300);

// build-bar icon for a structure with hand-drawn art (null if it has none);
// defences show their turret head, aimed toward the viewer
const ICON_AIM = 0.6;
export function artIconUrl(defId: string, owner = PLAYER, level = 1): string | null {
  return memoIcon(`a:${SLOTS[owner]}:${defId}:${owner}:${level}`, () => bakeArtIcon(defId, owner, level));
}
function bakeArtIcon(defId: string, owner: number, level: number): string | null {
  const art = bArt(defId, owner);
  if (!art) return null;
  const def = BUILDINGS[defId];
  const w = def.w * TILE, h = def.h * TILE, head = Math.ceil(w * 0.75), m = 4;
  const k = 2;
  const [c, g] = makeCanvas((w + m * 2) * k, (h + head + m * 2) * k);
  g.scale(k, k); g.translate(m, m + head);
  setFineArt(true);
  art(g, w, h, level, TEAM_COLORS[owner]);
  const ta = tArt(defId, owner);
  if (ta) { g.save(); g.translate(ta.pivot[0], ta.pivot[1]); ta.head(g, ICON_AIM, TEAM_COLORS[owner]); g.restore(); }
  setFineArt(false);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const skin = skinFor(owner, defId, 'b');
  if (skin && !def.isWall) skinBuilding(c, skin, defId, k);
  finish(c, 1, owner);
  return iconUrl(c);
}

// build-bar icon for a unit drawn in code (infantry, vehicles, aircraft),
// three-quarter view facing the viewer; null if it has no code-drawn art
export function unitIconUrl(defId: string, owner = PLAYER): string | null {
  return memoIcon(`u:${SLOTS[owner]}:${defId}:${owner}`, () => bakeUnitIcon(defId, owner));
}
function bakeUnitIcon(defId: string, owner: number): string | null {
  const va = vArt(defId, owner);
  if (!va) return null;
  const k = 3, ww = va.reach * 2 + 4, wh = ww + va.height;
  const [c, g] = makeCanvas(ww * k, wh * k);
  g.scale(k, k); g.translate(ww / 2, ww / 2 + va.height);
  setFineArt(true);
  va.hull(g, ICON_AIM, TEAM_COLORS[owner], 0);
  va.turret?.(g, ICON_AIM, TEAM_COLORS[owner]);
  setFineArt(false);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const skin = skinFor(owner, defId, 'v');
  if (skin) skinUnit(c, skin);
  finish(c, 2, owner);
  return iconUrl(c);
}

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


// ---- objective status: capture radius, a status pill under each objective ----

const shortName = (o: number) => o === PLAYER ? 'Yours' : FACTION_NAMES[o].split(' ')[0];
function drawObjectiveStatus(n: game.Neutral, cx: number, cy: number) {
  const capturing = n.prog > 0 && n.progOwner >= 0;
  // capture radius: faint until someone is on it, so it's clear where to stand
  ctx.save();
  ctx.setLineDash([6, 6]); ctx.lineDashOffset = -T * 8;
  ctx.strokeStyle = n.contested ? '#ff5a4a' : capturing ? TEAM_COLORS[n.progOwner] : 'rgba(232,220,190,0.9)';
  ctx.globalAlpha = n.contested || capturing ? 0.7 : 0.18; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, CAPTURE_RADIUS * TILE, CAPTURE_RADIUS * TILE * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  const what = n.kind === 'vent' ? 'VENT' : 'TOWER';
  const text = n.dark ? `${what} · DARK · STORM` : n.contested ? `${what} · CONTESTED`
    : capturing ? `${what} · ${n.progOwner === PLAYER ? '' : shortName(n.progOwner).toUpperCase() + ' '}CAPTURING ${Math.floor(n.prog / CAPTURE_TIME * 100)}%`
    : n.owner >= 0 ? `${what} · ${shortName(n.owner).toUpperCase()}` : `${what} · UNCLAIMED`;
  const col = n.dark ? '#7a9aa0' : n.contested ? '#ff5a4a' : capturing ? TEAM_COLORS[n.progOwner] : n.owner >= 0 ? TEAM_COLORS[n.owner] : '#b8ae98';
  ctx.font = '700 9px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12, y = cy + 30;
  ctx.fillStyle = 'rgba(10,12,20,0.78)';
  ctx.beginPath(); ctx.roundRect(cx - w / 2, y - 7, w, 14, 7); ctx.fill();
  ctx.strokeStyle = col; ctx.globalAlpha = n.contested ? 0.6 + 0.4 * Math.sin(T * 8) : 0.8; ctx.lineWidth = 1;
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + 0.5);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ---- launch-corridor tracker (screen space, under the top-left HUD) ----

let hudTop = 56, hudLeft = 8, hudTopCheck = 0;
function drawCorridorStrip(vw: number) {
  if (!game.mission.corridor) return;   // campaign missions track their own objectives
  const vents = game.neutrals.filter(n => n.kind === 'vent');
  if (!vents.length) return;
  // the top bar wraps on narrow screens; re-measure now and then, never every frame
  if (T - hudTopCheck > 1) {
    hudTopCheck = T;
    const tb = document.getElementById('topbar')?.getBoundingClientRect();
    const cv = canvas.getBoundingClientRect();
    hudTop = tb ? Math.max(8, tb.bottom - cv.top + 6) : 56;
    hudLeft = tb ? Math.max(8, tb.left - cv.left) : 8;
  }
  const { owner, held } = game.corridor, need = game.ventsNeeded();
  const mine = game.ventsHeld(PLAYER);
  const left = Math.max(0, game.CORRIDOR_HOLD - held);
  const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  let status = owner === PLAYER ? `LAUNCH IN ${clock}`
    : owner >= 0 ? `${FACTION_NAMES[owner].split(' ')[0].toUpperCase()} LAUNCHES IN ${clock}`
    : kindOf(PLAYER) !== 'human' ? `RIVALS NEED ${need} OF ${vents.length} · DENY THEM`   // the aliens have no fleet to launch
    : `HOLD ${need} OF ${vents.length} VENTS · YOU HOLD ${mine}`;
  const danger = owner > 0;
  ctx.font = '800 10px system-ui, sans-serif';
  const pipW = vents.length * 14, room = vw - hudLeft - 8;
  let label = 'LAUNCH CORRIDOR';
  // narrow screens (Fold cover) get the short wording rather than clipped text
  if (ctx.measureText(label + status).width + pipW + 44 > room) {
    label = 'CORRIDOR';
    status = owner === PLAYER ? `LAUNCH ${clock}`
      : owner >= 0 ? `${FACTION_NAMES[owner].split(' ')[0].toUpperCase()} ${clock}`
      : kindOf(PLAYER) !== 'human' ? `RIVALS ${need}/${vents.length}` : `${need} OF ${vents.length} · YOU ${mine}`;
  }
  const lw = ctx.measureText(label).width, sw = ctx.measureText(status).width;
  const w = Math.min(room, lw + sw + pipW + 44), h = 24;
  // tucked under the resource pills, top left
  const x = Math.round(hudLeft), y = Math.round(hudTop);
  ctx.fillStyle = 'rgba(14,20,36,0.86)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = danger ? `rgba(255,90,74,${0.55 + 0.35 * Math.sin(T * 5)})` : owner === PLAYER ? '#3ddc84' : 'rgba(201,160,82,0.7)';
  ctx.lineWidth = 1.5; ctx.stroke();
  // hold progress along the bottom edge
  if (owner >= 0) {
    ctx.fillStyle = TEAM_COLORS[owner];
    ctx.fillRect(x + 4, y + h - 3, (w - 8) * Math.min(1, held / game.CORRIDOR_HOLD), 2);
  }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9a052'; ctx.fillText(label, x + 10, y + h / 2);
  let px = x + 18 + lw;
  for (const n of vents) {
    ctx.beginPath(); ctx.arc(px + 5, y + h / 2, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = n.owner >= 0 ? TEAM_COLORS[n.owner] : 'rgba(184,174,152,0.25)'; ctx.fill();
    if (n.contested) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1.5; ctx.stroke(); }
    px += 14;
  }
  ctx.fillStyle = danger ? '#ff8a7a' : owner === PLAYER ? '#7dffb0' : '#e8dcc0';
  ctx.fillText(status, px + 8, y + h / 2);
  ctx.textBaseline = 'alphabetic';
}

// ---- performance overlay (?perf): frame pacing and match pacing at a glance ----

function drawPerfOverlay(vh: number) {
  const r = telemetry.liveSummary();
  const lines = [
    `frame p50 ${r.p50.toFixed(1)} ms  p95 ${r.p95.toFixed(1)}  worst ${r.worst.toFixed(0)}  (${r.fps.toFixed(0)} fps)`,
    `update ${r.updateMs.toFixed(2)} ms  render ${r.renderMs.toFixed(2)} ms  long frames ${r.longFrames}`,
    `units ${units.length}  buildings ${buildings.length}  factions ${game.numPlayers}  t ${Math.floor(game.stats.time / 60)}:${String(Math.floor(game.stats.time % 60)).padStart(2, '0')}`,
    `first fight ${r.firstFight ?? '—'}  stalls ${r.stalls} (${r.stallSec}s)  lost ${r.losses.join('/')}`,
  ];
  ctx.font = '11px ui-monospace, Menlo, monospace';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16, h = lines.length * 15 + 10;
  const x = 8, y = vh - h - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#9dffb8';
  lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 18 + i * 15));
}

// ---------------- init ----------------

/** Seed the ground was painted with, so a saved match repaints the same map. */
export function terrainPaintSeed() { return terrainSeed; }

export async function initRenderer(seed = -1): Promise<void> {
  // the deck appears as the briefing hides, resizing the map canvas; take its
  // size now so the late resize notification doesn't shift the camera the game
  // is about to centre on the base
  resize();
  lastViewW = canvas.clientWidth; lastViewH = canvas.clientHeight;
  sprites.clear();
  resetStructureLife();
  terrainSeed = seed;
  terrainTex = null;   // no stale ground from a previous game
  await paintTerrain();
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
  g.strokeStyle = CRY.out; g.lineWidth = 1.4; g.lineJoin = 'round';
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
  // drawn at 2× and scaled down when drawn
  const k = 2;
  const [lo, g] = makeCanvas(CRY_W * k, CRY_H * k);
  g.scale(k, k);
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
  g.setTransform(1, 0, 0, 1, 0, 0); gradeWarmCool(lo, 0.5); crystalCache.set(key, lo);
  return lo;
}

function buildingOverlay(b: Building) {
  const px = b.tx * TILE, py = b.ty * TILE;
  const w = b.def.w * TILE, h = b.def.h * TILE;
  const cx = px + w / 2, cy = py + h / 2;
  if (tArt(b.def.id, b.owner)) {
    drawDefenceHead(b, px, py);
    // ready lamps on the heavy emplacements
    if (b.def.id === 'bastion' || b.def.id === 'railgun') {
      const ready = b.cooldown < 0.15, piv = tArt(b.def.id, b.owner)!.pivot;
      const headTop = b.def.id === 'bastion' ? 22 : 20;
      g2Glow(px + piv[0], py + piv[1] - headTop, 2.5, ready ? (b.def.id === 'bastion' ? 'rgba(255,150,60,0.95)' : 'rgba(32,214,255,0.95)') : 'rgba(40,40,50,0.6)');
    }
  } else switch (b.def.id) {
    case 'nexus':
    case 'outpost': {
      // beacon on the tip of the antenna mast (sprite overflows above the plot)
      const on = Math.sin(T * 4) > 0;
      const bc = nexusBeacon(w, b.level, true);
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

// ---------------- refined effects ----------------
// Purely visual: new beams, explosions and shells from the simulation are
// spotted as they appear and spawn flashes, sparks, debris, smoke, trails and
// scorch marks that live and die here.

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; kind: 'spark' | 'smoke' | 'debris' | 'flash' | 'steam' | 'mote'; col?: string; ambient?: boolean }
const particles: Particle[] = [];
const scorches: { x: number; y: number; r: number; life: number; max: number; col?: string }[] = [];   // col: a stain instead of soot ('r,g,b')
// burning hulks where machines died: a charred shell with embers, smoking for a while
const wrecks: { x: number; y: number; r: number; life: number; max: number; seed: number }[] = [];
const MAX_WRECKS = 30;
// per weapon style: muzzle-flash colour, impact spark colour (r,g,b)
const FX_FLASH: Record<string, string> = { laser: '120,230,255', tracer: '255,210,120', powder: '255,220,150', acid: '160,255,140', light: '255,236,180', crystal: '150,255,245', flame: '255,170,80' };
const FX_SPARK: Record<string, string> = { laser: '140,235,255', tracer: '255,200,110', powder: '255,190,110', acid: '150,240,90', light: '255,232,170', crystal: '140,250,245', flame: '255,160,70' };
const seenFx = new WeakSet<object>();
const trails = new WeakMap<object, [number, number][]>();
const MAX_PARTICLES = 420, MAX_SCORCHES = 70;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function addParticle(p: Particle) {
  if (particles.length >= MAX_PARTICLES && particles.shift()?.ambient) ambientCount--;
  particles.push(p);
}

// ---- ambient life: stack smoke, vent steam, crystal motes, forest spores and
// drifting dust. Only spawned on screen and over explored ground, under its own
// budget so it never crowds out battle effects. (Flora and trees are baked into
// the ground texture, so the forests shed spores rather than sway.)
const WIND = { x: 9, y: 2.5 };          // world px/s, a light easterly
const MAX_AMBIENT = 150;
let ambientCount = 0;
const ambientTimers = new Map<number, number>();   // per building / vent: time to next puff
function addAmbient(p: Particle) {
  if (ambientCount >= MAX_AMBIENT) return;
  p.ambient = true; ambientCount++;
  addParticle(p);
}
// every `every` seconds per source, with a little jitter
function due(id: number, dt: number, every: number) {
  const t = (ambientTimers.get(id) ?? Math.random() * every) - dt;
  if (t > 0) { ambientTimers.set(id, t); return false; }
  ambientTimers.set(id, every * rnd(0.7, 1.3));
  return true;
}

// live particle counts by kind (dev console: novaFx())
export function fxStats() {
  const by: Record<string, number> = {};
  for (const p of particles) by[p.kind] = (by[p.kind] ?? 0) + 1;
  return { total: particles.length, ambient: ambientCount, scorches: scorches.length, ...by };
}
(window as unknown as { novaFx: typeof fxStats }).novaFx = fxStats;

function spawnAmbient(dt: number) {
  if (dt <= 0) return;
  const z = camera.zoom, vx0 = camera.x, vy0 = camera.y;
  const vx1 = vx0 + canvas.clientWidth / z, vy1 = vy0 + canvas.clientHeight / z;
  const inView = (x: number, y: number, pad = 40) => x > vx0 - pad && x < vx1 + pad && y > vy0 - pad && y < vy1 + pad;
  const seen = (x: number, y: number) => { const tx = tileOf(x), ty = tileOf(y); return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && explored[idx(tx, ty)] === 1; };

  // stacks: extractors puff smoke, labs breathe a faint green-tinged vapour
  for (const b of buildings) {
    if (b.def.id !== 'extractor' && b.def.id !== 'lab') continue;
    const px = b.tx * TILE, py = b.ty * TILE, w = b.def.w * TILE;
    if (!inView(px + w / 2, py) || !seen(px + w / 2, py + w / 2)) continue;
    const lab = b.def.id === 'lab';
    if (!due(b.id, dt, lab ? 0.9 : 0.32)) continue;
    const [sx, sy] = lab ? labLight(w) : extractorLights(w).lamp;
    addAmbient({ x: px + sx, y: py + sy - 2, z: 0, vx: WIND.x + rnd(-3, 3), vy: WIND.y + rnd(-2, 2), vz: rnd(10, 16),
      life: rnd(2.4, 3.4), max: 3.4, size: lab ? 3.6 : 4.6, kind: 'steam', col: lab ? '190,235,205' : '150,142,134' });
  }
  // flux vents breathe steam
  for (const n of game.neutrals) {
    if (n.kind !== 'vent') continue;
    const x = (n.tx + 0.5) * TILE, y = (n.ty + 0.5) * TILE;
    if (!inView(x, y) || !seen(x, y) || !due(-1000 - n.id, dt, 0.22)) continue;
    addAmbient({ x: x + rnd(-6, 6), y: y + rnd(-4, 4), z: 2, vx: WIND.x * 0.6 + rnd(-4, 4), vy: WIND.y + rnd(-2, 2), vz: rnd(18, 26),
      life: rnd(1.6, 2.4), max: 2.4, size: rnd(4, 6.5), kind: 'steam', col: '235,240,245' });
  }
  // sample a few random on-screen tiles: crystal motes, forest spores, dust
  const tries = Math.min(6, Math.ceil(dt * 60 * 0.12 * ((vx1 - vx0) * (vy1 - vy0)) / (900 * 600)));
  for (let k = 0; k < tries; k++) {
    const x = rnd(vx0, vx1), y = rnd(vy0, vy1);
    if (!seen(x, y)) continue;
    const i = idx(tileOf(x), tileOf(y));
    if (crystal[i] > 0 && Math.random() < 0.6) {
      addAmbient({ x, y, z: rnd(2, 10), vx: rnd(-3, 3), vy: rnd(-2, 2), vz: rnd(6, 12), life: rnd(1.6, 2.6), max: 2.6, size: rnd(1.4, 2.2), kind: 'mote', col: '120,255,245' });
    } else if (terrain[i] === 3 && Math.random() < 0.5) {
      const violet = noise(tileOf(x) / 7 + 9, tileOf(y) / 7 + 30) > 0.62;
      addAmbient({ x, y, z: rnd(6, 18), vx: WIND.x + rnd(-4, 4), vy: WIND.y + rnd(-3, 3), vz: rnd(-1, 3), life: rnd(2.5, 4), max: 4, size: rnd(1.3, 2), kind: 'mote', col: violet ? '210,170,255' : '170,235,190' });
    } else if (Math.random() < 0.35) {
      addAmbient({ x, y, z: rnd(2, 14), vx: WIND.x * 1.6 + rnd(-4, 4), vy: WIND.y + rnd(-2, 2), vz: rnd(-1, 1), life: rnd(3, 5), max: 5, size: rnd(0.9, 1.4), kind: 'mote', col: '226,200,160' });
    }
  }
}
function shellLift(s: { t: number; dur: number; kind: string }) {
  const p = Math.min(1, s.t / s.dur);
  return s.kind === 'shell' ? Math.sin(p * Math.PI) * 26 : Math.sin(p * Math.PI) * 6;
}

function spawnEffects(dt: number) {
  for (const bm of beams) {
    if (seenFx.has(bm)) continue;
    seenFx.add(bm);
    const fx = bm.fx ?? 'laser';
    addParticle({ x: bm.x1, y: bm.y1, z: 6, vx: 0, vy: 0, vz: 0, life: 0.07, max: 0.07, size: fx === 'powder' ? 9 : fx === 'light' ? 8 : 6, kind: 'flash', col: FX_FLASH[fx] });
    if (fx === 'powder') for (let k = 0; k < 3; k++)   // a cloud of black-powder smoke hangs at the muzzle
      addParticle({ x: bm.x1 + rnd(-2, 2), y: bm.y1 + rnd(-1, 1), z: 6, vx: WIND.x * 2 + rnd(-6, 6), vy: rnd(-3, 3), vz: rnd(4, 10), life: rnd(1, 1.6), max: 1.6, size: rnd(4, 7), kind: 'steam', col: '214,206,192' });
    if (fx === 'tracer') addParticle({ x: bm.x1, y: bm.y1, z: 6, vx: rnd(-4, 4), vy: rnd(-2, 2), vz: 8, life: 0.6, max: 0.6, size: 3.5, kind: 'steam', col: '150,145,140' });
    const n = fx === 'light' ? 0 : 4;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(40, 95);
      addParticle({ x: bm.x2, y: bm.y2, z: 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(20, 60), life: rnd(0.2, 0.38), max: 0.38, size: 1, kind: fx === 'acid' ? 'debris' : 'spark', col: FX_SPARK[fx] });
    }
    if (fx === 'light') for (let k = 0; k < 3; k++) addParticle({ x: bm.x2 + rnd(-3, 3), y: bm.y2 + rnd(-2, 2), z: 4, vx: rnd(-6, 6), vy: rnd(-3, 3), vz: rnd(14, 26), life: rnd(0.5, 0.9), max: 0.9, size: rnd(1.2, 1.8), kind: 'mote', col: '255,230,160' });
    if (fx === 'powder' || fx === 'tracer') addParticle({ x: bm.x2, y: bm.y2, z: 2, vx: rnd(-4, 4), vy: rnd(-2, 2), vz: 6, life: 0.7, max: 0.7, size: 3, kind: 'steam', col: '150,128,104' });   // dirt kicked up
    if (fx === 'acid') addParticle({ x: bm.x2, y: bm.y2, z: 2, vx: 0, vy: 0, vz: 5, life: 0.6, max: 0.6, size: 3.5, kind: 'steam', col: '120,200,90' });
  }
  for (const bo of booms) {
    if (seenFx.has(bo)) continue;
    seenFx.add(bo);
    boomParticles(bo);
  }
  // shells: remember the recent flight path; rockets shed smoke as they go
  for (const sh of shells) {
    let tr = trails.get(sh);
    if (!tr) { tr = []; trails.set(sh, tr); }
    const y = sh.y - shellLift(sh);
    tr.push([sh.x, y]);
    if (tr.length > 10) tr.shift();
    if (dt <= 0) continue;
    if (sh.fx === 'powder' || sh.fx === 'flame') addParticle({ x: sh.x, y, z: 0, vx: rnd(-3, 3), vy: rnd(-3, 3), vz: 4, life: 0.8, max: 0.8, size: 2.6, kind: 'steam', col: '190,182,170' });
    else if (sh.fx === 'acid') { if (Math.random() < 0.4) addParticle({ x: sh.x, y: sh.y, z: shellLift(sh), vx: 0, vy: 0, vz: -10, life: 0.6, max: 0.6, size: 1.2, kind: 'debris', col: '150,240,90' }); }
    else if (sh.kind === 'rocket') addParticle({ x: sh.x, y, z: 0, vx: rnd(-4, 4), vy: rnd(-4, 4), vz: 6, life: 0.55, max: 0.55, size: 2.2, kind: 'smoke' });
  }
  for (const w of wrecks) if (dt > 0 && w.life > w.max * 0.25 && Math.random() < dt * (2 + w.r / 8)) {
    addParticle({ x: w.x + rnd(-w.r, w.r) * 0.4, y: w.y + rnd(-1, 1), z: 3, vx: WIND.x * 3 + rnd(-3, 3), vy: rnd(-2, 2), vz: rnd(10, 18), life: rnd(1.6, 2.6), max: 2.6, size: w.r * rnd(0.35, 0.55), kind: 'smoke' });
    if (Math.random() < 0.4) addParticle({ x: w.x + rnd(-w.r, w.r) * 0.3, y: w.y, z: 4, vx: rnd(-6, 6), vy: rnd(-3, 3), vz: rnd(20, 40), life: rnd(0.4, 0.8), max: 0.8, size: 1, kind: 'spark' });
  }
}

// what an impact or a death throws up, by the style of whoever made it
function boomParticles(bo: { x: number; y: number; max: number; fx?: string; death?: string }) {
  const big = bo.max, fx = bo.fx ?? 'fire';
  const burst = (n: number, kind: Particle['kind'], col: string | undefined, sp0: number, sp1: number, vz0: number, vz1: number, life: number, s0: number, s1: number) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(sp0, sp1);
      addParticle({ x: bo.x, y: bo.y, z: 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(vz0, vz1), life: rnd(life * 0.6, life), max: life, size: rnd(s0, s1), kind, col });
    }
  };
  const puffs = (n: number, col: string, size: number) => {
    for (let k = 0; k < n; k++) addParticle({ x: bo.x + rnd(-big, big) * 0.3, y: bo.y + rnd(-big, big) * 0.2, z: rnd(1, 5), vx: WIND.x * 2 + rnd(-6, 6), vy: rnd(-3, 3), vz: rnd(6, 14), life: rnd(0.9, 1.6), max: 1.6, size: size * rnd(0.7, 1.2), kind: 'steam', col });
  };
  const stain = (col: string | undefined, r: number, life = 25) => { if (scorches.length >= MAX_SCORCHES) scorches.shift(); scorches.push({ x: bo.x, y: bo.y + 2, r, life, max: life, col }); };
  if (fx === 'dust' || bo.death === 'infantry') {
    // a soldier going down, or crust thrown up: dust, not fire
    puffs(3, '150,128,104', big * 0.6);
    burst(3, 'debris', '110,92,70', 20, 50, 30, 60, 0.8, 1.2, 2);
    return;
  }
  if (fx === 'acid') {
    // a splash of acid and ichor, crystal shards from a creature's back
    burst(Math.min(14, 6 + big / 3), 'debris', '150,240,90', 30, 80, 40, 90, 0.9, 1, 2);
    if (bo.death) { burst(Math.min(12, 5 + big / 3), 'debris', '130,40,110', 30, 70, 30, 80, 1, 1.4, 2.6); burst(6, 'spark', '140,250,245', 50, 110, 40, 90, 0.45, 1, 1); }
    puffs(Math.min(5, 2 + big / 10), '120,200,90', big * 0.5);
    stain(bo.death ? '70,20,60' : '50,80,20', big * (bo.death ? 0.9 : 0.6), bo.death ? 40 : 20);
    return;
  }
  if (fx === 'light') {
    // the Keepers come apart into light: no fire, no wreck, motes rising
    for (let k = 0; k < Math.min(18, (bo.death ? 8 : 3) + big / 3); k++)
      addParticle({ x: bo.x + rnd(-big, big) * 0.4, y: bo.y + rnd(-big, big) * 0.25, z: rnd(2, 10), vx: rnd(-8, 8), vy: rnd(-4, 4), vz: rnd(18, 40), life: rnd(0.8, 1.6), max: 1.6, size: rnd(1.2, 2.2), kind: 'mote', col: '255,230,160' });
    burst(bo.death ? 8 : 4, 'spark', '255,240,200', 60, 140, 30, 70, 0.4, 1, 1);
    if (bo.death) burst(6, 'debris', '232,206,140', 30, 70, 50, 100, 1, 1.2, 2);   // shards of gold
    return;
  }
  if (fx === 'crystal') {
    // stone and crystal: the Hollow crumble
    burst(Math.min(14, 5 + big / 3), 'debris', '96,90,104', 25, 70, 40, 90, 1.1, 1.6, 3);
    burst(Math.min(10, 4 + big / 4), 'spark', '140,250,245', 50, 120, 40, 90, 0.5, 1, 1);
    puffs(Math.min(4, 2 + big / 12), '170,230,230', big * 0.45);
    if (bo.death) stain('40,80,90', big * 0.6, 25);
    return;
  }
  // fire: everything with fuel in it (Helion, Kessler, the Clans, flamers, the big guns)
  burst(Math.min(12, 4 + big / 4), 'debris', undefined, 30 * (0.6 + big / 40), 70 * (0.6 + big / 40), 50, 110, 1.1, 1.8, 3.4);
  for (let k = 0; k < Math.min(fx === 'powder' ? 9 : 6, (fx === 'powder' ? 4 : 2) + big / 10); k++)
    addParticle({ x: bo.x + rnd(-big, big) * 0.3, y: bo.y + rnd(-big, big) * 0.2, z: rnd(2, 8), vx: rnd(-6, 6) + 5, vy: rnd(-3, 3), vz: rnd(8, 18), life: rnd(1.2, 2.2), max: 2.2, size: big * rnd(0.25, 0.4), kind: 'smoke' });
  burst(5, 'spark', FX_SPARK[fx], 60, 130, 40, 90, 0.45, 1, 1);
  stain(undefined, big * 0.7);
  if (bo.death === 'machine') { if (wrecks.length >= MAX_WRECKS) wrecks.shift(); wrecks.push({ x: bo.x, y: bo.y, r: Math.max(6, big * 0.55), life: 14, max: 14, seed: Math.random() * 1000 }); }
}

function updateEffects(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { if (p.ambient) ambientCount--; particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.kind === 'mote') {
      p.x += Math.sin(T * 1.7 + p.y * 0.05) * dt * 4;          // a lazy wobble
    } else if (p.kind === 'steam') {
      p.size += dt * 5;
    } else if (p.kind === 'spark' || p.kind === 'debris') {
      p.vz -= 260 * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.55; p.vy *= 0.55; }
    } else if (p.kind === 'smoke') {
      p.size += dt * 6; p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * 0.8;
    }
  }
  for (let i = scorches.length - 1; i >= 0; i--) if ((scorches[i].life -= dt) <= 0) scorches.splice(i, 1);
  for (let i = wrecks.length - 1; i >= 0; i--) if ((wrecks[i].life -= dt) <= 0) wrecks.splice(i, 1);
}

function drawScorches() {
  for (const sc of scorches) {
    // a burn mark, not a hole: soft sooty centre, warm singed rim
    const a = Math.min(1, sc.life / 6) * (sc.col ? 0.45 : 0.3);
    const gr = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
    if (sc.col) { gr.addColorStop(0, `rgba(${sc.col},${a})`); gr.addColorStop(0.7, `rgba(${sc.col},${a * 0.5})`); gr.addColorStop(1, `rgba(${sc.col},0)`); }   // ichor, crystal dust
    else { gr.addColorStop(0, `rgba(24,14,8,${a})`); gr.addColorStop(0.55, `rgba(46,24,12,${a * 0.55})`); gr.addColorStop(0.85, `rgba(90,44,18,${a * 0.25})`); gr.addColorStop(1, 'rgba(90,44,18,0)'); }
    ctx.save(); ctx.translate(sc.x, sc.y); ctx.scale(1, 0.62); ctx.translate(-sc.x, -sc.y);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const w of wrecks) drawWreck(w);
}
// a burnt-out hull: a charred, broken outline, embers glowing in it as it cools
function drawWreck(w: { x: number; y: number; r: number; life: number; max: number; seed: number }) {
  const fade = Math.min(1, w.life / 3), heat = Math.max(0, (w.life - w.max * 0.3) / (w.max * 0.7));
  let sd = w.seed | 0; const rr2 = () => (sd = (sd * 16807 + 7) % 2147483647) / 2147483647;
  const pts: [number, number][] = [];
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, r = w.r * (0.6 + rr2() * 0.45); pts.push([w.x + Math.cos(a) * r, w.y + Math.sin(a) * r * 0.55]); }
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(14,10,8,0.85)'; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y - 2) : ctx.moveTo(x, y - 2)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a342e'; ctx.lineWidth = 1; ctx.stroke();
  // a few twisted plates standing up out of it
  for (let k = 0; k < 3; k++) {
    const x = w.x + (rr2() - 0.5) * w.r, y = w.y + (rr2() - 0.5) * w.r * 0.4, h = w.r * (0.35 + rr2() * 0.4);
    ctx.fillStyle = k % 2 ? '#2a2622' : '#3e3832'; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + rr2() * 2, y - h); ctx.lineTo(x + 2.5, y); ctx.closePath(); ctx.fill();
  }
  if (heat > 0) for (let k = 0; k < 4; k++) {
    const x = w.x + (rr2() - 0.5) * w.r * 0.9, y = w.y + (rr2() - 0.5) * w.r * 0.35 - 2;
    g2Glow(x, y, 2.4 + Math.sin(T * 7 + k + w.seed) * 0.6, `rgba(255,${120 + k * 20},40,${0.7 * heat})`);
  }
  ctx.globalAlpha = 1;
}



// ---- the Vey (campaign): tunnel mouths, stressed crystal, crystal storms ----

// ---- the bloom: the brood's living ground, painted 4 px per tile and drawn smoothed ----
let bloomCanvas: HTMLCanvasElement | null = null, bloomCtx: CanvasRenderingContext2D | null = null;
let bloomImg: ImageData | null = null, bloomPrev = new Uint8Array(0), bloomDirty = new Uint8Array(0);
const BLOOM_PX = 8;
// repaint only the tiles whose bloom changed since last time (and their neighbours,
// which the smoothing between tiles depends on): usually a thin band along the edge
function paintBloom(): boolean {
  const W = MAP_W * BLOOM_PX, H = MAP_H * BLOOM_PX, B = game.bloom;
  if (!bloomCanvas || bloomCanvas.width !== W || bloomCanvas.height !== H || bloomPrev.length !== B.length) {
    [bloomCanvas, bloomCtx] = makeCanvas(W, H); bloomImg = bloomCtx.createImageData(W, H);
    bloomPrev = new Uint8Array(B.length).fill(1);   // forces a full first paint
  }
  let x0 = MAP_W, y0 = MAP_H, x1 = -1, y1 = -1;
  let i0 = 0;
  while (i0 < B.length && B[i0] === bloomPrev[i0]) i0++;
  if (i0 === B.length) return false;                 // nothing changed (the usual frame)
  if (bloomDirty.length !== B.length) bloomDirty = new Uint8Array(B.length); else bloomDirty.fill(0);
  const dirty = bloomDirty;
  for (let i = i0; i < B.length; i++) {
    if (B[i] === bloomPrev[i]) continue;
    const tx = i % MAP_W, ty = (i / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      dirty[y * MAP_W + x] = 1;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  bloomPrev.set(B);
  if (x1 < 0) return false;
  const d = bloomImg!.data;
  const at2 = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? 0 : B[y * MAP_W + x];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!dirty[ty * MAP_W + tx]) continue;
    for (let py = ty * BLOOM_PX; py < (ty + 1) * BLOOM_PX; py++) for (let px = tx * BLOOM_PX; px < (tx + 1) * BLOOM_PX; px++) {
      // bilinear strength between tile centres, broken up by noise so the edge is ragged and alive
      const fx = px / BLOOM_PX - 0.5, fy = py / BLOOM_PX - 0.5, bx = Math.floor(fx), by = Math.floor(fy), kx = fx - bx, ky = fy - by;
      const v = (at2(bx, by) * (1 - kx) + at2(bx + 1, by) * kx) * (1 - ky) + (at2(bx, by + 1) * (1 - kx) + at2(bx + 1, by + 1) * kx) * ky;
      const o = (py * W + px) * 4;
      if (v < 4) { d[o + 3] = 0; continue; }
      // ragged living edge, mottled flesh, thin branching veins, rare crystal flecks
      const n = noise(px * 0.11, py * 0.11), n2 = noise(px * 0.37 + 9, py * 0.37 + 3);
      const vein = Math.min(Math.abs(noise(px * 0.05 + 40, py * 0.05 + 17) - 0.5), Math.abs(noise(px * 0.08 + 7, py * 0.08 + 61) - 0.5));
      const a = Math.max(0, Math.min(1, (v / 255) * 1.5 - n * 0.6));
      const m = 0.75 + n2 * 0.5;                                    // mottling
      let r = 92 * m, gg = 30 * m, b = 70 * m, al = a * 150;        // wet dark flesh, see-through at the edge
      if (vein < 0.018) { const k = 1 - vein / 0.018; r += 120 * k; gg += 60 * k; b += 170 * k; al = Math.max(al, a * 220 * k); }   // a lit vein
      else if (n2 > 0.9 && n > 0.45) { r = 130; gg = 240; b = 235; al = a * 210; }   // a crystal fleck
      d[o] = Math.min(255, r); d[o + 1] = Math.min(255, gg); d[o + 2] = Math.min(255, b); d[o + 3] = Math.round(al);
    }
  }
  bloomCtx!.putImageData(bloomImg!, 0, 0, x0 * BLOOM_PX, y0 * BLOOM_PX, (x1 - x0 + 1) * BLOOM_PX, (y1 - y0 + 1) * BLOOM_PX);
  return true;
}
let bloomAny = false;
function drawBloom() {
  const B = game.bloom;
  if (!B.length) return;
  paintBloom();
  if (!bloomAny) { bloomAny = B.some(v => v > 0); if (!bloomAny) return; }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bloomCanvas!, 0, 0, MAP_W * TILE, MAP_H * TILE);
  // a slow heartbeat of light through the veins
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.08 + 0.07 * Math.max(0, Math.sin(T * 2.2));
  ctx.drawImage(bloomCanvas!, 0, 0, MAP_W * TILE, MAP_H * TILE);
  ctx.restore();
}

function drawVeyGround() {
  drawBloom();
  // tunnel mouths: a dark throat in the ground, ringed with crystal and rubble
  for (const t of game.tunnels) {
    if (!explored[idx(t.tx, t.ty)]) continue;
    const x = (t.tx + 0.5) * TILE, y = (t.ty + 0.5) * TILE;
    const open = Math.min(1, (game.stats.time - t.born) / 1.2 + 0.05);
    const r = 15 * open;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.6);
    const rim = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.6);
    rim.addColorStop(0, 'rgba(60,46,36,0.9)'); rim.addColorStop(1, 'rgba(60,46,36,0)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
    const pit = ctx.createRadialGradient(0, 2, 0, 0, 0, r);
    pit.addColorStop(0, '#020304'); pit.addColorStop(0.7, '#0a0c10'); pit.addColorStop(1, '#2a2420');
    ctx.fillStyle = pit; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // crystal teeth around the rim, faintly lit from below
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + t.id, cx = x + Math.cos(a) * r * 1.05, cy = y + Math.sin(a) * r * 0.62;
      const hgt = (4 + ((k * 37 + t.id) % 5)) * open;
      ctx.fillStyle = k % 2 ? '#8ef4f0' : '#3aa8b0';
      ctx.beginPath(); ctx.moveTo(cx - 2, cy); ctx.lineTo(cx, cy - hgt); ctx.lineTo(cx + 2, cy); ctx.closePath(); ctx.fill();
    }
    g2Glow(x, y, r * (0.6 + 0.15 * Math.sin(T * 2 + t.id)), 'rgba(120,250,240,0.16)');
  }
  if (!game.mission.resonance) return;
  // stressed crystal pulses: brighter and faster the closer a patch is to breaking
  const z = camera.zoom, vw = canvas.clientWidth / z, vh = canvas.clientHeight / z;
  const x0 = Math.max(0, Math.floor(camera.x / TILE)), y0 = Math.max(0, Math.floor(camera.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil((camera.x + vw) / TILE)), y1 = Math.min(MAP_H - 1, Math.ceil((camera.y + vh) / TILE));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const i = idx(tx, ty);
    if (!crystal[i] || !explored[i]) continue;
    const lvl = game.resonance[game.resCell(tx, ty)];
    if (lvl < 0.3) continue;
    const pulse = 0.5 + 0.5 * Math.sin(T * (2 + lvl * 6) + tx * 0.7 + ty * 1.3);
    const hot = lvl >= game.RES_TREMOR;
    g2Glow((tx + 0.5) * TILE, (ty + 0.5) * TILE, TILE * (0.5 + lvl * 0.6),
      hot ? `rgba(255,${Math.round(120 + 100 * (1 - lvl))},200,${0.12 + 0.25 * lvl * pulse})` : `rgba(120,250,240,${0.08 + 0.2 * lvl * pulse})`);
  }
}

// a crystal storm: a glittering cyan haze over the patch, thick enough to hide things in
function drawStorms() {
  if (!game.mission.resonance) return;
  for (let c = 0; c < game.resonance.length; c++) {
    const lvl = game.resonance[c];
    if (lvl < game.RES_STORM) continue;
    const tx = (c % game.resCols) * game.RES_CELL, ty = Math.floor(c / game.resCols) * game.RES_CELL;
    if (!explored[idx(Math.min(MAP_W - 1, tx + 5), Math.min(MAP_H - 1, ty + 5))]) continue;
    const x = tx * TILE, y = ty * TILE, s2 = game.RES_CELL * TILE;
    const k = (lvl - game.RES_STORM) / (1 - game.RES_STORM);
    const gr = ctx.createRadialGradient(x + s2 / 2, y + s2 / 2, s2 * 0.1, x + s2 / 2, y + s2 / 2, s2 * 0.75);
    gr.addColorStop(0, `rgba(150,240,240,${0.18 + 0.12 * k})`); gr.addColorStop(1, 'rgba(150,240,240,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - s2 * 0.25, y - s2 * 0.25, s2 * 1.5, s2 * 1.5);
    // wind-driven glitter
    if (Math.random() < 0.6) addAmbient({ x: x + Math.random() * s2, y: y + Math.random() * s2, z: rnd(4, 26), vx: WIND.x * 4 + rnd(-10, 10), vy: WIND.y * 3 + rnd(-6, 6), vz: rnd(-4, 4),
      life: rnd(0.8, 1.6), max: 1.6, size: rnd(1, 2), kind: 'mote', col: '200,255,250' });
  }
}

// ---- structure life cycle: rise on placement, scaffold while upgrading, rubble after ----

const RISE = 1.2;                                          // seconds a new structure takes to rise
const bornAt = new Map<number, number>();                  // building id → when it appeared
const levelSeen = new Map<number, number>();
const upgradedAt = new Map<number, number>();              // building id → when an upgrade finished
const knownBld = new Map<number, { tx: number; ty: number; w: number; h: number; wall: boolean; trap: boolean }>();
interface Rubble { tx: number; ty: number; w: number; h: number; spr: HTMLCanvasElement }
const rubble: Rubble[] = [];
const MAX_RUBBLE = 60;
let lifeReady = false;                                     // the first frame's buildings were already standing
function resetStructureLife() { bornAt.clear(); levelSeen.clear(); upgradedAt.clear(); knownBld.clear(); rubble.length = 0; lifeReady = false; }

function trackStructures() {
  const seen = new Set<number>();
  for (const b of buildings) {
    seen.add(b.id);
    if (!knownBld.has(b.id)) {
      knownBld.set(b.id, { tx: b.tx, ty: b.ty, w: b.def.w, h: b.def.h, wall: !!b.def.isWall, trap: !!b.def.trap });
      levelSeen.set(b.id, b.level);
      if (!lifeReady) continue;
      bornAt.set(b.id, T);
      // building over a ruin clears it
      for (let i = rubble.length - 1; i >= 0; i--) {
        const r = rubble[i];
        if (r.tx < b.tx + b.def.w && r.tx + r.w > b.tx && r.ty < b.ty + b.def.h && r.ty + r.h > b.ty) rubble.splice(i, 1);
      }
      const cx = (b.tx + b.def.w / 2) * TILE, cy = (b.ty + b.def.h) * TILE;
      for (let k = 0; k < 6 + b.def.w * 3; k++)
        addParticle({ x: cx + rnd(-0.5, 0.5) * b.def.w * TILE, y: cy - rnd(0, 6), z: rnd(0, 4), vx: rnd(-14, 14), vy: rnd(-4, 4), vz: rnd(4, 12),
          life: rnd(0.9, 1.6), max: 1.6, size: rnd(5, 9), kind: 'smoke', col: '150,128,104' });
    } else if ((levelSeen.get(b.id) ?? 1) < b.level) {
      levelSeen.set(b.id, b.level);
      upgradedAt.set(b.id, T);
    }
  }
  for (const [id, k] of knownBld) {
    if (seen.has(id)) continue;
    knownBld.delete(id); bornAt.delete(id); levelSeen.delete(id); upgradedAt.delete(id);
    if (k.trap || packedAway.delete(id)) continue;   // a sprung trap or a struck camp leaves no ruin
    if (rubble.length >= MAX_RUBBLE) rubble.shift();
    rubble.push({ tx: k.tx, ty: k.ty, w: k.w, h: k.h, spr: bakeRubble(k.w, k.h, k.wall, id) });
  }
  lifeReady = true;
}

// a ruin: charred footprint, broken slabs, a few twisted beams. Baked once at 2×.
function bakeRubble(tw: number, th: number, wall: boolean, seed: number): HTMLCanvasElement {
  const w = tw * TILE, h = th * TILE, k = 2, m = 8;
  const [c, g] = makeCanvas((w + m * 2) * k, (h + m * 2) * k);
  g.scale(k, k); g.translate(m, m);
  let r = seed * 9301 + 49297;
  const rand = () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647;
  // scorched ground under it
  const gr = g.createRadialGradient(w / 2, h * 0.6, 2, w / 2, h * 0.6, Math.max(w, h) * 0.75);
  gr.addColorStop(0, 'rgba(18,10,6,0.75)'); gr.addColorStop(0.7, 'rgba(40,24,14,0.4)'); gr.addColorStop(1, 'rgba(40,24,14,0)');
  g.fillStyle = gr; g.fillRect(-m, -m, w + m * 2, h + m * 2);
  // slabs and chunks, lighter on the sunlit (north-west) side
  const n = wall ? 4 : 10 + tw * th * 3;
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = h * 0.25 + rand() * h * 0.75, s2 = (wall ? 3 : 4) + rand() * (wall ? 4 : 9);
    const a = rand() * Math.PI;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = ['#3a342e', '#4a423a', '#2c2723', '#56504a'][Math.floor(rand() * 4)];
    g.beginPath(); g.moveTo(-s2, -s2 * 0.4); g.lineTo(s2 * 0.6, -s2 * 0.6); g.lineTo(s2, s2 * 0.3); g.lineTo(-s2 * 0.3, s2 * 0.5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,240,220,0.12)'; g.fillRect(-s2 * 0.8, -s2 * 0.45, s2 * 1.2, 1.2);
    g.restore();
  }
  // twisted beams
  if (!wall) for (let i = 0; i < 2 + tw; i++) {
    const x0 = rand() * w, y0 = h * 0.4 + rand() * h * 0.5;
    g.strokeStyle = '#1e1a17'; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + rand() * 14 - 7, y0 - 8 - rand() * 8, x0 + rand() * 18 - 9, y0 - 4 - rand() * 14); g.stroke();
    g.strokeStyle = 'rgba(200,150,110,0.25)'; g.lineWidth = 0.8; g.stroke();
  }
  // a few embers still glowing in the cracks
  for (let i = 0; i < (wall ? 1 : 3); i++) {
    const x = w * 0.2 + rand() * w * 0.6, y = h * 0.4 + rand() * h * 0.5;
    const eg = g.createRadialGradient(x, y, 0, x, y, 4);
    eg.addColorStop(0, 'rgba(255,140,60,0.55)'); eg.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = eg; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function drawRubble() {
  for (const r of rubble) {
    if (!explored[idx(r.tx, r.ty)]) continue;
    ctx.drawImage(r.spr, r.tx * TILE - 8, r.ty * TILE - 8, r.w * TILE + 16, r.h * TILE + 16);
    // the odd wisp of smoke from a fresh ruin
    if (Math.random() < 0.02) addAmbient({ x: (r.tx + r.w / 2) * TILE + rnd(-8, 8), y: (r.ty + r.h * 0.7) * TILE, z: 4, vx: WIND.x * 0.6, vy: WIND.y * 0.4, vz: rnd(6, 10),
      life: rnd(2, 3), max: 3, size: rnd(4, 6), kind: 'smoke' });
  }
}

// scaffold poles and braces around a structure that is going up or being upgraded
function drawScaffold(px: number, py: number, w: number, h: number, rise: number, alpha: number) {
  const top = py + h - rise;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#c9a052'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const x of [px + 3, px + w - 3]) { ctx.moveTo(x, py + h + 2); ctx.lineTo(x, top); }
  for (let y = py + h - 6; y > top; y -= 12) { ctx.moveTo(px + 3, y); ctx.lineTo(px + w - 3, y); }
  ctx.moveTo(px + 3, py + h); ctx.lineTo(px + w - 3, Math.max(top, py + h - 24));
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const f = p.life / p.max, sy = p.y - p.z;
    if (p.kind === 'mote') {
      // fade in and out over its life, twinkling a little
      const a = Math.min(1, (1 - f) * 4, f * 3) * (0.55 + 0.45 * Math.sin(T * 6 + p.x));
      ctx.fillStyle = `rgba(${p.col},${0.22 * a})`;
      ctx.beginPath(); ctx.arc(p.x, sy, p.size * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${p.col},${0.95 * a})`;
      ctx.fillRect(p.x - p.size / 2, sy - p.size / 2, p.size, p.size);
      continue;
    }
    if (p.kind === 'steam') {
      const a = Math.min(1, (1 - f) * 5) * f;
      const gr = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, p.size);
      gr.addColorStop(0, `rgba(${p.col},${0.62 * a})`); gr.addColorStop(0.5, `rgba(${p.col},${0.3 * a})`); gr.addColorStop(1, `rgba(${p.col},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, sy, p.size, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (p.kind === 'smoke') {
      const gr = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, p.size);
      gr.addColorStop(0, `rgba(52,46,42,${0.6 * f})`); gr.addColorStop(0.5, `rgba(60,54,50,${0.32 * f})`); gr.addColorStop(1, 'rgba(60,54,50,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, sy, p.size, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'debris') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(p.x - p.size / 2 + 1, p.y - p.size / 4, p.size, p.size / 2);
      ctx.fillStyle = p.col ? `rgb(${p.col})` : '#3a302a'; ctx.fillRect(p.x - p.size / 2, sy - p.size / 2, p.size, p.size);
      ctx.fillStyle = p.col ? 'rgba(255,255,255,0.35)' : 'rgba(255,190,120,0.5)'; ctx.fillRect(p.x - p.size / 2, sy - p.size / 2, p.size, 0.6);
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = p.col ? `rgba(${p.col},${f})` : `rgba(255,${200 + 40 * f | 0},120,${f})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x, sy); ctx.lineTo(p.x - p.vx * 0.025, sy - p.vy * 0.025 + p.vz * 0.025); ctx.stroke();
    } else {
      g2Glow(p.x, sy, p.size * (0.6 + f), `rgba(${p.col ?? '255,236,190'},${0.9 * f})`);
      ctx.strokeStyle = `rgba(255,255,240,${f})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - p.size, sy); ctx.lineTo(p.x + p.size, sy); ctx.moveTo(p.x, sy - p.size * 0.7); ctx.lineTo(p.x, sy + p.size * 0.7); ctx.stroke();
    }
  }
}

// a blast in the style of whoever made it: fire for fuel, a green splash for
// acid, a flash and ring of light for the Keepers, a cyan crack for crystal,
// nothing but dust for crust and fallen soldiers
function drawStyledBoom(bo: { x: number; y: number; r: number; ttl: number; max: number; fx?: string; death?: string }) {
  const life = Math.max(0, bo.ttl / 0.5), r = bo.r * 1.25, fx = bo.fx;
  if (fx === 'dust' || bo.death === 'infantry') return;
  const flash = (c0: string, c1: string, c2: string, ring: string, rk: number) => {
    const fg = ctx.createRadialGradient(bo.x, bo.y - r * 0.15, 0, bo.x, bo.y, r);
    fg.addColorStop(0, `rgba(${c0},${life})`); fg.addColorStop(0.35, `rgba(${c1},${life * 0.85})`); fg.addColorStop(1, `rgba(${c2},0)`);
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bo.x, bo.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(bo.x, bo.y); ctx.scale(1, 0.6);
    ctx.strokeStyle = `rgba(${ring},${life * 0.6})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, bo.r * rk, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };
  if (fx === 'acid') return flash('230,255,190', '140,230,80', '60,120,30', '170,255,120', 1.6);
  if (fx === 'crystal') return flash('230,255,255', '120,240,240', '30,110,120', '160,255,250', 1.8);
  if (fx === 'light') {
    flash('255,255,245', '255,225,150', '200,150,60', '255,235,180', 2.6);
    if (bo.death) {   // a pillar of light where a Keeper was
      const pg = ctx.createLinearGradient(bo.x, bo.y, bo.x, bo.y - 60);
      pg.addColorStop(0, `rgba(255,240,200,${life * 0.7})`); pg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = pg; ctx.fillRect(bo.x - 4, bo.y - 60, 8, 60); ctx.restore();
    }
    return;
  }
  drawRefinedBoom(bo);
}

// refined explosion: white core, layered fireball and a thin shock ring
function drawRefinedBoom(bo: { x: number; y: number; r: number; ttl: number; max: number }) {
  const life = Math.max(0, bo.ttl / 0.5), r = bo.r * 1.25;
  const fg = ctx.createRadialGradient(bo.x, bo.y - r * 0.15, 0, bo.x, bo.y, r);
  fg.addColorStop(0, `rgba(255,250,230,${life})`);
  fg.addColorStop(0.25, `rgba(255,214,130,${life * 0.95})`);
  fg.addColorStop(0.6, `rgba(240,120,50,${life * 0.7})`);
  fg.addColorStop(1, 'rgba(90,30,12,0)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bo.x, bo.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(bo.x, bo.y); ctx.scale(1, 0.6);
  ctx.strokeStyle = `rgba(255,236,200,${life * 0.55})`; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, bo.r * 1.9, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ---------------- frame ----------------

function drawHealthBar(x: number, y: number, w: number, frac: number) {
  const col = frac > 0.5 ? '#3ddc84' : frac > 0.25 ? '#ffb02e' : '#e5484d';
  // slim bar: dark rounded well, lit fill, quarter ticks
  const hh = 3;
  ctx.fillStyle = 'rgba(10,8,6,0.62)';
  rr(ctx, x - 0.5, y - 0.5, w + 1, hh + 1, 1.5); ctx.fill();
  ctx.fillStyle = col;
  if (frac > 0) { rr(ctx, x, y, Math.max(1.5, w * frac), hh, 1); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + 0.5, y + 0.3, Math.max(0, w * frac - 1), 0.8);
  ctx.fillStyle = 'rgba(10,8,6,0.5)';
  for (const t of [0.25, 0.5, 0.75]) ctx.fillRect(x + w * t - 0.25, y, 0.5, hh);
}

// Keeper shields: a thin cyan bar under the health bar, and a shimmer of the
// shield's surface for a moment after it takes a hit
function drawShieldBar(x: number, y: number, w: number, frac: number) {
  ctx.fillStyle = 'rgba(6,14,20,0.6)'; ctx.fillRect(x - 0.5, y - 0.5, w + 1, 2.6);
  ctx.fillStyle = '#7ff2ff'; ctx.fillRect(x, y, w * Math.max(0, frac), 1.6);
}
function shieldShimmer(x: number, y: number, r: number, e: { shT?: number; sh?: number }) {
  const t = e.shT ?? 99;
  if (t > 0.6 || !(e.sh ?? 0)) return;
  const k = 1 - t / 0.6;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
  gr.addColorStop(0, 'rgba(140,240,255,0)'); gr.addColorStop(0.85, `rgba(140,240,255,${0.35 * k})`); gr.addColorStop(1, `rgba(220,255,255,${0.6 * k})`);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Keepers arrive in a column of light: anything of theirs that appears gets one
const arrivedAt = new Map<number, number>();
let arrivalsReady = false;
function drawArrivals() {
  for (const e of [...units, ...buildings]) {
    if (kindOf(e.owner) !== 'keepers' || arrivedAt.has(e.id)) continue;
    arrivedAt.set(e.id, arrivalsReady ? T : -9);
    if (arrivalsReady) { const p = game.entityPos(e); sfxAt('arrive', p.x, p.y); }
  }
  arrivalsReady = true;
  // translocations: units of theirs vanishing from one place and arriving in another
  for (let i = game.lightColumns.length - 1; i >= 0; i--) {
    const c = game.lightColumns[i], k = (game.stats.time - c.born) / 1.1;
    if (k > 1) { game.lightColumns.splice(i, 1); continue; }
    if (k < 0 || !visible[idx(game.tileOf(c.x), game.tileOf(c.y))]) continue;
    const a = Math.sin(k * Math.PI);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(c.x, c.y - 420, c.x, c.y);
    lg.addColorStop(0, 'rgba(255,240,200,0)'); lg.addColorStop(1, `rgba(255,250,230,${0.8 * a})`);
    ctx.fillStyle = lg; ctx.fillRect(c.x - 9, c.y - 420, 18, 420);
    ctx.restore();
  }
  for (const [id, t0] of arrivedAt) {
    const e = byId.get(id);
    if (!e) { arrivedAt.delete(id); continue; }
    const k = (T - t0) / 1.1;
    if (k > 1 || k < 0) continue;
    if (e.owner !== PLAYER && !visible[idx(game.tileOf(game.entityPos(e).x), game.tileOf(game.entityPos(e).y))]) continue;
    const p = game.entityPos(e), w = e.kind === 'building' ? e.def.w * TILE * 0.6 : 14;
    const a = Math.sin(k * Math.PI);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(p.x, p.y - 420, p.x, p.y);
    lg.addColorStop(0, 'rgba(255,240,200,0)'); lg.addColorStop(0.7, `rgba(255,240,200,${0.45 * a})`); lg.addColorStop(1, `rgba(255,255,240,${0.9 * a})`);
    ctx.fillStyle = lg; ctx.fillRect(p.x - w / 2, p.y - 420, w, 420);
    ctx.strokeStyle = `rgba(255,230,160,${a})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w * (0.6 + k), w * (0.3 + k * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// refined selection: a soft gold ring lying on the ground, four ticks turning
// slowly round it
function groundRing(x: number, y: number, rx: number, ry: number) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx);
  ctx.strokeStyle = 'rgba(232,198,106,0.28)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,227,154,0.9)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#fff4cc'; ctx.lineWidth = 2.2;
  const spin = T * 0.8;
  for (let k = 0; k < 4; k++) {
    const a = spin + k * Math.PI / 2;
    ctx.beginPath(); ctx.arc(0, 0, rx, a - 0.16, a + 0.16); ctx.stroke();
  }
  ctx.restore();
}


export function render() {
  if (!terrainTex) return; // not initialized yet (briefing screen)
  T = performance.now() / 1000;
  vizDt = Math.min(0.1, Math.max(0, T - vizT)); vizT = T;
  { const fdt = game.paused ? 0 : vizDt; spawnEffects(fdt); spawnAmbient(fdt); updateEffects(fdt); }
  if (vehViz.size > units.length + 64) for (const id of [...vehViz.keys()]) if (!byId.has(id)) vehViz.delete(id);
  const vw = canvas.clientWidth, vh = canvas.clientHeight;
  const z = camera.zoom;
  const vwz = vw / z, vhz = vh / z; // visible world size at this zoom
  setListener(camera.x + vwz / 2, camera.y + vhz / 2, vwz / 2);   // battle sounds pan and fade around the view
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = '#100c0a';
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.scale(z, z);
  // snap the scroll to whole device pixels: pixel art drawn at fractional
  // offsets shimmers and judders as the camera moves
  const px = 1 / (z * devicePixelRatio);
  ctx.translate(-Math.round(camera.x / px) * px, -Math.round(camera.y / px) * px);
  if (game.quake > 0) {   // a tremor in view: the ground heaves
    const q = game.quake * game.quake * 5;
    ctx.translate(Math.sin(T * 61) * q, Math.cos(T * 47) * q * 0.6);
  }

  // blit only the part of the terrain texture that actually exists — clamping to
  // the map bounds prevents the browser from edge-smearing the last row/column
  // when you zoom/scroll past the edge of the map. Edges sit on whole texels so
  // nearest-neighbour sampling doesn't swim while scrolling.
  const mW = MAP_W * TILE, mH = MAP_H * TILE;
  const texel = (v: number, round: (n: number) => number) => round(v / texScale) * texScale;
  const bx0 = Math.max(0, texel(camera.x, Math.floor)), by0 = Math.max(0, texel(camera.y, Math.floor));
  const bx1 = Math.min(mW, texel(camera.x + vwz, Math.ceil)), by1 = Math.min(mH, texel(camera.y + vhz, Math.ceil));
  if (bx1 > bx0 && by1 > by0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrainTex, bx0 / texScale, by0 / texScale, (bx1 - bx0) / texScale, (by1 - by0) / texScale,
      bx0, by0, bx1 - bx0, by1 - by0);
    ctx.imageSmoothingEnabled = true;
  }
  drawScorches();
  drawVeyGround();
  trackStructures();
  drawRubble();

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
      ctx.drawImage(spr, cx + ox - CRY_AX, cy + oy + 6 - CRY_AY, CRY_W, CRY_H);
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
      if (!n.dark) g2Glow(cx, cy - 4 - pulse * 5, 5 + pulse * 4, `rgba(67,243,236,${0.35 + pulse * 0.35})`);   // a storm chokes the plume
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
    drawObjectiveStatus(n, cx, cy);
  }

  // buildings, sorted so southern (nearer) structures draw over northern ones
  const drawList = [...buildings].sort((a, b) => (a.ty + a.def.h) - (b.ty + b.def.h));
  for (const b of drawList) {
    const ci = idx(b.tx + Math.floor(b.def.w / 2), b.ty + Math.floor(b.def.h / 2));
    if (b.owner !== PLAYER && !explored[ci]) continue;
    if (b.def.trap && hostile(b.owner, PLAYER)) continue;   // you never see their traps
    const px = b.tx * TILE, py = b.ty * TILE;
    const w = b.def.w * TILE, h = b.def.h * TILE;
    const s = bldSprite(b.def.id, b.owner, b.level);
    const sel = selection.has(b.id);
    if (sel) groundRing(px + w / 2, py + h * 0.55, w * 0.66, h * 0.5);
    const born = bornAt.get(b.id), rise = born === undefined ? 1 : Math.min(1, (T - born) / RISE);
    const sk = s.k ?? 1, tall = s.oy + h;                    // how far the art stands above the ground line
    if (rise < 1) {
      // rising out of the ground: slide the art up through the ground line
      const e = 1 - (1 - rise) ** 3;
      ctx.save();
      ctx.beginPath(); ctx.rect(px - s.ox, py - s.oy - 40, s.width / sk, h + s.oy + 44); ctx.clip();
      ctx.translate(0, (1 - e) * (tall + 6));
      drawBld(s, px, py);
      ctx.restore();
      drawScaffold(px, py, w, h, (tall + 6) * Math.min(1, rise * 1.6), 1 - rise * 0.8);
    } else {
      drawBld(s, px, py);
      buildingOverlay(b);
    }
    if (b.upgrading) {
      drawScaffold(px, py, w, h, Math.min(tall, h * 1.6), 0.85);
      // welding sparks somewhere on the structure
      if (Math.random() < 0.25) {
        const sx = px + rnd(4, w - 4), sy = py + h - rnd(6, Math.min(tall, h * 1.4));
        for (let k2 = 0; k2 < 3; k2++) addParticle({ x: sx, y: sy, z: 0, vx: rnd(-40, 40), vy: rnd(-20, 30), vz: rnd(-10, 30), life: rnd(0.2, 0.4), max: 0.4, size: 1, kind: 'spark' });
      }
    }
    if (b.shielded) {
      // a relay-fed shield: a shimmering dome with a slow hex sweep
      const cx = px + w / 2, cy = py + h * 0.4, r = Math.max(w, h) * 0.95;
      ctx.save();
      const sg = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
      sg.addColorStop(0, 'rgba(120,200,255,0.02)'); sg.addColorStop(0.85, 'rgba(120,200,255,0.12)'); sg.addColorStop(1, 'rgba(160,220,255,0.35)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(170,225,255,${0.35 + 0.2 * Math.sin(T * 3)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
      const a0 = (T * 0.8) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,240,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, a0, a0 + 0.7); ctx.stroke();
      ctx.restore();
    }
    const up = upgradedAt.get(b.id);
    if (up !== undefined && T - up < 0.7) {
      // upgrade complete: a gold flash and a ring washing out across the plot
      const f = (T - up) / 0.7;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      g2Glow(px + w / 2, py + h * 0.4, w * (0.6 + f * 0.6), `rgba(255,220,140,${0.55 * (1 - f)})`);
      ctx.strokeStyle = `rgba(255,227,154,${1 - f})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(px + w / 2, py + h * 0.6, w * (0.4 + f * 0.7), h * (0.25 + f * 0.45), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // the art stands up over the footprint's top edge, so its bars sit
    // just below the footprint instead of across the building
    const barY = py + h + 2, upY = py + h + 7;
    if (sel || b.hp < b.maxHp || (b.def.shield && (b.sh ?? 0) < b.def.shield)) {
      drawHealthBar(px + 4, barY, w - 8, b.hp / b.maxHp);
      if (b.def.shield) drawShieldBar(px + 4, barY + 4.5, w - 8, (b.sh ?? 0) / b.def.shield);
    }
    if (b.def.shield) shieldShimmer(px + w / 2, py + h * 0.3, Math.max(w, h) * 0.8, b);
    if (b.upgrading) {
      // amber upgrade progress bar + wrench glint
      const frac = 1 - b.upgrading.remaining / b.upgrading.total;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(px + 4, upY, w - 8, 4.5);
      ctx.fillStyle = '#ffb02e';
      ctx.fillRect(px + 4.5, upY + 0.5, (w - 9) * frac, 3.5);
      if (Math.sin(T * 6) > 0) g2Glow(px + w - 8, py + 6, 3, 'rgba(255,215,110,0.9)');
    }
  }

  // units: 8-direction isometric sprites with 2-frame walk cycles
  for (const u of units) {
    if (u.def.air) continue; // aircraft draw in the top layer, after effects
    if (u.owner !== PLAYER && !visible[idx(tileOf(u.x), tileOf(u.y))]) continue;
    const moving = !!u.path && u.path.length > 0;
    const frame = moving ? 1 + (Math.floor(T * 6 + u.id) % 2) : 0;
    const s = sprite('u', u.def.id, u.owner, dirIndex(u.facing) * 3 + frame);
    const sw = s.width / kOf(s), sh = s.height / kOf(s);
    const va = vArt(u.def.id, u.owner);
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
    } else {
      // team identity as a soft glow on the ground, under a softer shadow
      const tr = sw * 0.55;
      const tg = ctx.createRadialGradient(u.x, u.y + sh * 0.3, 0, u.x, u.y + sh * 0.3, tr);
      tg.addColorStop(0, TEAM_COLORS[u.owner] + 'b0'); tg.addColorStop(0.55, TEAM_COLORS[u.owner] + '55'); tg.addColorStop(1, TEAM_COLORS[u.owner] + '00');
      ctx.save(); ctx.translate(0, u.y + sh * 0.3); ctx.scale(1, 0.38); ctx.translate(0, -(u.y + sh * 0.3));
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(u.x, u.y + sh * 0.3, tr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(u.x + 2, u.y + sh * 0.32, sw * 0.32, sh * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    }
    const picked = selection.has(u.id);
    if (picked) groundRing(u.x, u.y + 1, u.def.radius + 4, (u.def.radius + 4) * 0.55);
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
    if (sel || u.hp < u.maxHp || (u.def.shield && (u.sh ?? 0) < u.def.shield)) {
      const w = u.def.radius * 2.2;
      drawHealthBar(u.x - w / 2, u.y - u.def.radius - 10, w, u.hp / u.maxHp);
      if (u.def.shield) drawShieldBar(u.x - w / 2, u.y - u.def.radius - 13.5, w, (u.sh ?? 0) / u.def.shield);
    }
    if (u.def.shield) shieldShimmer(u.x, u.y - u.def.radius * 0.6, u.def.radius * 1.5, u);
  }

  // projectiles: shells arc high, rockets fly flat with a flame trail
  for (const s2 of shells) {
    const tr = trails.get(s2);
    if (tr && tr.length > 1 && (s2.kind === 'shell' || s2.fx === 'acid' || s2.fx === 'light')) {
      for (let k = 1; k < tr.length; k++) {
        ctx.strokeStyle = `rgba(${s2.fx === 'acid' ? '150,240,90' : s2.fx === 'light' ? '255,230,160' : '255,190,110'},${(k / tr.length) * 0.5})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(tr[k - 1][0], tr[k - 1][1]); ctx.lineTo(tr[k][0], tr[k][1]); ctx.stroke();
      }
    }
    const p = Math.min(1, s2.t / s2.dur);
    const arc = s2.kind === 'shell' ? Math.sin(p * Math.PI) * 26 : Math.sin(p * Math.PI) * 6;
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(s2.x, s2.y, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    const py2 = s2.y - arc;
    if (s2.fx === 'acid') {
      g2Glow(s2.x, py2, 3.4, 'rgba(150,250,100,0.85)');
      ctx.fillStyle = '#3a7a20'; ctx.beginPath(); ctx.arc(s2.x, py2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8ff9a'; ctx.beginPath(); ctx.arc(s2.x - 0.8, py2 - 0.8, 1, 0, Math.PI * 2); ctx.fill();
    } else if (s2.fx === 'light') {
      g2Glow(s2.x, py2, 4.5, 'rgba(255,230,160,0.95)');
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(s2.x, py2, 2, 0, Math.PI * 2); ctx.fill();
    } else if (s2.fx === 'flame') {
      // a lit bottle tumbling end over end
      ctx.save(); ctx.translate(s2.x, py2); ctx.rotate(s2.t * 14);
      ctx.fillStyle = '#4a8a5a'; ctx.fillRect(-1.2, -2.4, 2.4, 4.4); ctx.fillStyle = '#c8a060'; ctx.fillRect(-0.6, -3.6, 1.2, 1.4);
      ctx.restore(); g2Glow(s2.x, py2 - 2, 3, 'rgba(255,150,60,0.9)');
    } else if (s2.fx === 'powder' && s2.kind === 'shell') {
      ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.arc(s2.x, py2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(s2.x - 0.9, py2 - 0.9, 0.9, 0, Math.PI * 2); ctx.fill();
    } else if (s2.kind === 'rocket') {
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

  // weapon beams, by the firer's style
  for (const bm of beams) {
    const a = Math.min(1, bm.ttl / 0.12), t = 1 - a, fx = bm.fx ?? 'laser';
    const at2 = (k: number): [number, number] => [bm.x1 + (bm.x2 - bm.x1) * k, bm.y1 + (bm.y2 - bm.y1) * k];
    ctx.lineCap = 'round';
    if (fx === 'tracer') {
      // a bright tracer round streaking along the line
      const [hx, hy] = at2(Math.min(1, t * 1.3 + 0.25)), [tx, ty] = at2(Math.max(0, t * 1.3 - 0.1));
      ctx.strokeStyle = 'rgba(255,200,110,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,70,0.55)'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 1.4; ctx.stroke();
      g2Glow(bm.x1, bm.y1, 4 * a, 'rgba(255,200,110,0.9)');
    } else if (fx === 'powder') {
      // a lead ball: barely a line, the muzzle smoke does the talking
      ctx.strokeStyle = `rgba(235,225,205,${0.35 * a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
      g2Glow(bm.x1, bm.y1, 5 * a, 'rgba(255,210,140,0.9)');
    } else if (fx === 'acid') {
      // a glob of acid flying with a short wet trail
      const [hx, hy] = at2(Math.min(1, t * 1.4)), [tx, ty] = at2(Math.max(0, t * 1.4 - 0.25));
      ctx.strokeStyle = 'rgba(150,240,90,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      g2Glow(hx, hy, 2.6, 'rgba(160,255,110,0.9)');
      ctx.fillStyle = '#d8ff9a'; ctx.beginPath(); ctx.arc(hx, hy, 1.4, 0, Math.PI * 2); ctx.fill();
    } else if (fx === 'light') {
      // a lance of gold light, flared at both ends
      ctx.globalAlpha = a * 0.45; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
      g2Glow(bm.x1, bm.y1, 6 * a, 'rgba(255,230,160,0.9)'); g2Glow(bm.x2, bm.y2, 7 * a, 'rgba(255,240,200,0.95)');
    } else if (fx === 'crystal') {
      // a spray of crystal splinters
      ctx.setLineDash([3, 2.5]); ctx.lineDashOffset = -t * 20;
      ctx.strokeStyle = `rgba(154,246,241,${a})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
      ctx.setLineDash([]);
      g2Glow(bm.x2, bm.y2, 4 * a, 'rgba(150,255,245,0.85)');
    } else {
      // Helion's lasers and the flamers: a coloured bolt round a white core
      ctx.globalAlpha = a * 0.30;
      ctx.strokeStyle = bm.color; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
      ctx.globalAlpha = 1;
      g2Glow(bm.x1, bm.y1, 5 * a, bm.color);
      g2Glow(bm.x2, bm.y2, 4 * a, fx === 'laser' ? 'rgba(160,235,255,0.9)' : 'rgba(255,220,160,0.9)');
    }
    ctx.lineCap = 'butt';
  }

  // explosions
  for (const bo of booms) drawStyledBoom(bo);

  drawParticles();
  drawStorms();
  drawArrivals();

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
    if (!s) { s = bakeAirSprite(u.def.id, u.owner); sprites.set(key, s); }
    const bob = Math.sin(T * 2.2 + u.id) * 2;
    if (selection.has(u.id)) groundRing(u.x + 4, u.y + 8, u.def.radius + 3, (u.def.radius + 3) * 0.5);
    // ground shadow, offset from the airframe so the altitude reads
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(u.x + 8, u.y + 10, u.def.radius * 0.9, u.def.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    if (vArt(u.def.id, u.owner)) {
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
  }

  // where the player just sent units: a ring closing on the spot with four
  // inward chevrons (move green, attack-move amber, harvest cyan); an attack
  // order brackets its target in red and follows it
  for (const m of game.orderMarkers) {
    const f = m.ttl / m.max;                    // 1 → 0 over its short life
    let { x, y } = m;
    if (m.kind === 'attack' && m.targetId !== undefined) {
      const t = byId.get(m.targetId);
      if (t) ({ x, y } = game.entityPos(t));
    }
    const col = m.kind === 'attack' ? '255,90,74' : m.kind === 'attackMove' ? '255,176,46' : m.kind === 'harvest' ? '67,243,236' : '61,220,132';
    const r = 6 + 14 * f;
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, 0.6);
    ctx.globalAlpha = Math.min(1, f * 2.5);
    ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.6;
    if (m.kind === 'attack') {
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(0, 0, r, a - 0.45, a + 0.45); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, d = r + 6;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(d + 3, -3); ctx.lineTo(d, 0); ctx.lineTo(d + 3, 3); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
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
    // a soft footprint with faint tile seams, then the ghost on top
    const gx = placement.tx * TILE, gy = placement.ty * TILE, gw = def.w * TILE, gh = def.h * TILE;
    const col = ok ? '61,220,132' : '229,72,77';
    ctx.fillStyle = `rgba(${col},0.16)`;
    rr(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 5); ctx.fill();
    ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let x = 1; x < def.w; x++) { ctx.moveTo(gx + x * TILE, gy + 3); ctx.lineTo(gx + x * TILE, gy + gh - 3); }
    for (let y = 1; y < def.h; y++) { ctx.moveTo(gx + 3, gy + y * TILE); ctx.lineTo(gx + gw - 3, gy + y * TILE); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 1.5;
    rr(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 5); ctx.stroke();
    ctx.globalAlpha = ok ? 0.72 : 0.45;
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

  drawCorridorStrip(vw);
  telemetry.frameDrawn(performance.now() - T * 1000);
  if (telemetry.overlayOn) drawPerfOverlay(vh);

  if (selectBox) {
    const { x, y, w, h } = selectBox, k = Math.min(10, w / 3, h / 3);
    ctx.fillStyle = 'rgba(232,198,106,0.08)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(232,198,106,0.55)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = '#ffe39a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
    ctx.moveTo(x + w - k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + k);
    ctx.moveTo(x + w, y + h - k); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - k, y + h);
    ctx.moveTo(x + k, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - k);
    ctx.stroke();
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
  // a touch darker than the battlefield so the blips carry
  mmCtx.fillStyle = 'rgba(8,10,20,0.22)'; mmCtx.fillRect(0, 0, mm.width, mm.height);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (!explored[i]) { mmCtx.fillStyle = '#070b16'; mmCtx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5); continue; }
      if (crystal[i] > 0) {
        mmCtx.fillStyle = visible[i] ? 'rgba(67,243,236,0.85)' : 'rgba(67,243,236,0.45)';
        mmCtx.fillRect(x * sx + 0.15, y * sy + 0.15, sx * 0.7, sy * 0.7);
      }
      if (game.bloom[i] >= 90) { mmCtx.fillStyle = 'rgba(150,70,200,0.55)'; mmCtx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5); }   // living ground
      if (!visible[i]) { mmCtx.fillStyle = 'rgba(7,11,22,0.45)'; mmCtx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5); }   // remembered, not seen
    }
  // neutral objectives: diamonds for vents, triangles for towers (grey until captured)
  for (const n of game.neutrals) {
    if (!explored[idx(n.tx, n.ty)]) continue;
    const mx = (n.tx + 0.5) * sx, my = (n.ty + 0.5) * sy, r = 3.5;
    mmCtx.beginPath();
    if (n.kind === 'vent') { mmCtx.moveTo(mx, my - r); mmCtx.lineTo(mx + r, my); mmCtx.lineTo(mx, my + r); mmCtx.lineTo(mx - r, my); }
    else { mmCtx.moveTo(mx, my - r); mmCtx.lineTo(mx + r, my + r * 0.8); mmCtx.lineTo(mx - r, my + r * 0.8); }
    mmCtx.closePath();
    mmCtx.fillStyle = n.owner >= 0 ? TEAM_COLORS[n.owner] : '#b8ae98'; mmCtx.fill();
    mmCtx.strokeStyle = n.contested ? '#ff5a4a' : 'rgba(10,8,6,0.9)'; mmCtx.lineWidth = n.contested ? 1.5 : 1; mmCtx.stroke();
  }
  // structures: team plates with a dark rim so they stay crisp on any ground
  mmCtx.lineWidth = 1;
  for (const b of buildings) {
    if ((b.owner !== PLAYER && !explored[idx(b.tx, b.ty)]) || b.def.trap) continue;
    const bw = Math.max(2.5, b.def.w * sx), bh = Math.max(2.5, b.def.h * sy);
    mmCtx.fillStyle = TEAM_COLORS[b.owner];
    mmCtx.fillRect(b.tx * sx, b.ty * sy, bw, bh);
    mmCtx.strokeStyle = 'rgba(8,8,12,0.85)';
    mmCtx.strokeRect(b.tx * sx + 0.5, b.ty * sy + 0.5, bw - 1, bh - 1);
  }
  // units: round blips, vehicles larger than infantry
  for (const u of units) {
    if (u.owner !== PLAYER && !visible[idx(tileOf(u.x), tileOf(u.y))]) continue;
    const r = u.def.tab === 'veh' ? 1.8 : 1.3;
    mmCtx.beginPath(); mmCtx.arc((u.x / TILE) * sx, (u.y / TILE) * sy, r + 0.7, 0, Math.PI * 2);
    mmCtx.fillStyle = 'rgba(8,8,12,0.85)'; mmCtx.fill();
    mmCtx.beginPath(); mmCtx.arc((u.x / TILE) * sx, (u.y / TILE) * sy, r, 0, Math.PI * 2);
    mmCtx.fillStyle = TEAM_COLORS[u.owner]; mmCtx.fill();
  }
  // alert pings on the minimap — blinking rings
  for (const p of game.pings) {
    if (Math.floor(p.t * 6) % 2) continue; // blink
    mmCtx.strokeStyle = p.color; mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.arc((p.x / TILE) * sx, (p.y / TILE) * sy, 4 + (p.t / 2.2) * 6, 0, Math.PI * 2);
    mmCtx.stroke();
  }
  // camera: a gold frame with heavier corner brackets
  const { w, h } = viewSize();
  const fx = (camera.x / TILE) * sx, fy = (camera.y / TILE) * sy;
  const fw = (w / camera.zoom / TILE) * sx, fh = (h / camera.zoom / TILE) * sy;
  mmCtx.strokeStyle = 'rgba(232,198,106,0.55)'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
  const k = Math.min(7, fw / 3, fh / 3);
  mmCtx.strokeStyle = '#ffe39a'; mmCtx.lineWidth = 2;
  mmCtx.beginPath();
  mmCtx.moveTo(fx, fy + k); mmCtx.lineTo(fx, fy); mmCtx.lineTo(fx + k, fy);
  mmCtx.moveTo(fx + fw - k, fy); mmCtx.lineTo(fx + fw, fy); mmCtx.lineTo(fx + fw, fy + k);
  mmCtx.moveTo(fx + fw, fy + fh - k); mmCtx.lineTo(fx + fw, fy + fh); mmCtx.lineTo(fx + fw - k, fy + fh);
  mmCtx.moveTo(fx + k, fy + fh); mmCtx.lineTo(fx, fy + fh); mmCtx.lineTo(fx, fy + fh - k);
  mmCtx.stroke();
}

