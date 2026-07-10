// The map is sized at game start: bigger battles get a bigger map.

export let MAP_W = 60;
export let MAP_H = 60;

// terrain: 0 = ground, 1 = rock (impassable)
export let terrain: Uint8Array;
// crystal amount per tile (credits worth remaining)
export let crystal: Uint16Array;
// building occupancy: -1 free, otherwise building entity id
export let occupied: Int32Array;
// ground tint variation for rendering
export let tint: Uint8Array;

export const idx = (x: number, y: number) => y * MAP_W + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export function isWalkable(x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const i = idx(x, y);
  return terrain[i] === 0 && occupied[i] === -1;
}

// Deterministic-ish pseudo random with seed so maps are varied but debuggable
let seed = Date.now() % 100000;
export function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed % 10000) / 10000;
}

function blob(cx: number, cy: number, r: number, fn: (x: number, y: number) => void) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inBounds(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r * (0.7 + rand() * 0.4)) fn(x, y);
    }
}

// Base corners in tile coords: player SW, enemies NE / NW / SE
export function basePositions(numEnemies: number): { x: number, y: number }[] {
  const m = 8;
  const spots = [
    { x: m, y: MAP_H - m - 3 },              // player, bottom-left
    { x: MAP_W - m - 3, y: m },              // enemy 1, top-right
    { x: m, y: m },                          // enemy 2, top-left
    { x: MAP_W - m - 3, y: MAP_H - m - 3 },  // enemy 3, bottom-right
  ];
  return spots.slice(0, numEnemies + 1);
}

export function generateMap(numEnemies: number) {
  const size = numEnemies >= 3 ? 90 : numEnemies === 2 ? 76 : 60;
  MAP_W = size; MAP_H = size;
  terrain = new Uint8Array(MAP_W * MAP_H);
  crystal = new Uint16Array(MAP_W * MAP_H);
  occupied = new Int32Array(MAP_W * MAP_H).fill(-1);
  tint = new Uint8Array(MAP_W * MAP_H);

  for (let i = 0; i < terrain.length; i++) tint[i] = Math.floor(rand() * 4);

  const bases = basePositions(numEnemies);

  // Rock formations scattered around, away from every base
  const rockCount = Math.floor(MAP_W * MAP_H / 260);
  for (let n = 0; n < rockCount; n++) {
    const x = 8 + Math.floor(rand() * (MAP_W - 16));
    const y = 8 + Math.floor(rand() * (MAP_H - 16));
    if (bases.some(b => Math.hypot(x - (b.x + 1), y - (b.y + 1)) < 15)) continue;
    blob(x, y, 2 + Math.floor(rand() * 3), (tx, ty) => { terrain[idx(tx, ty)] = 1; });
  }

  // Crystal fields: one near each base, several near the middle
  const fields: [number, number, number][] = [];
  for (const b of bases) {
    // offset the field toward the map center so it's outside the base footprint
    const cx = b.x + (b.x < MAP_W / 2 ? 8 : -6);
    const cy = b.y + (b.y < MAP_H / 2 ? 8 : -6);
    fields.push([cx, cy, 5]);
  }
  const centers = 2 + numEnemies;
  for (let i = 0; i < centers; i++) {
    fields.push([
      Math.floor(MAP_W * (0.3 + rand() * 0.4)),
      Math.floor(MAP_H * (0.3 + rand() * 0.4)),
      5 + Math.floor(rand() * 3),
    ]);
  }
  for (const [fx, fy, r] of fields) {
    blob(fx, fy, r, (x, y) => {
      const i = idx(x, y);
      if (terrain[i] === 0) crystal[i] = 400 + Math.floor(rand() * 600);
    });
  }
}

// Find nearest tile matching a predicate via expanding ring search
export function nearestTile(fromX: number, fromY: number, maxR: number, pred: (x: number, y: number) => boolean): { x: number, y: number } | null {
  if (pred(fromX, fromY)) return { x: fromX, y: fromY };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = fromX + dx, y = fromY + dy;
        if (inBounds(x, y) && pred(x, y)) return { x, y };
      }
  }
  return null;
}
