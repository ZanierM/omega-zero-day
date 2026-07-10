import { MAP_W, MAP_H, isWalkable, inBounds, nearestTile } from './map';

// A* pathfinding on the tile grid, 8-directional.
// Returns a list of tile coordinates (excluding start), or null if unreachable.

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
];

export function findPath(sx: number, sy: number, tx: number, ty: number): { x: number, y: number }[] | null {
  // If the target tile itself is blocked, aim for the nearest walkable tile
  if (!isWalkable(tx, ty)) {
    const alt = nearestTile(tx, ty, 6, isWalkable);
    if (!alt) return null;
    tx = alt.x; ty = alt.y;
  }
  if (sx === tx && sy === ty) return [];

  const size = MAP_W * MAP_H;
  const g = new Float32Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const start = sy * MAP_W + sx, goal = ty * MAP_W + tx;

  // simple binary-ish open list: array of [f, idx], we scan for min (grid is small)
  const open: number[] = [start];
  const f = new Float32Array(size).fill(Infinity);
  g[start] = 0;
  f[start] = Math.hypot(tx - sx, ty - sy);

  let guard = 0;
  while (open.length > 0 && guard++ < 20000) {
    // pop node with lowest f
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path: { x: number, y: number }[] = [];
      let n = cur;
      while (n !== start) {
        path.push({ x: n % MAP_W, y: Math.floor(n / MAP_W) });
        n = parent[n];
      }
      path.reverse();
      return path;
    }
    closed[cur] = 1;
    const cx = cur % MAP_W, cy = Math.floor(cur / MAP_W);
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny) || !isWalkable(nx, ny)) continue;
      // no cutting corners diagonally through blocked tiles
      if (dx !== 0 && dy !== 0 && (!isWalkable(cx + dx, cy) || !isWalkable(cx, cy + dy))) continue;
      const ni = ny * MAP_W + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        f[ni] = ng + Math.hypot(tx - nx, ty - ny);
        parent[ni] = cur;
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  return null;
}
