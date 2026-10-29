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

  // open list: binary min-heap on f; a node re-pushed with a better f leaves a
  // stale entry behind, which is skipped once the node is closed
  const f = new Float32Array(size).fill(Infinity);
  g[start] = 0;
  f[start] = Math.hypot(tx - sx, ty - sy);
  const open = new MinHeap(f);
  open.push(start);

  let guard = 0;
  while (open.size > 0 && guard++ < 20000) {
    const cur = open.pop();
    if (closed[cur]) continue;
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
        open.push(ni);
      }
    }
  }
  return null;
}

// min-heap of node indices; each entry keeps the f[] value it was pushed with
class MinHeap {
  private a: number[] = [];
  private k: number[] = [];
  constructor(private f: Float32Array) {}
  get size() { return this.a.length; }
  push(n: number) {
    const a = this.a, k = this.k, key = this.f[n];
    let i = a.length;
    a.push(n); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p]; k[i] = k[p]; i = p;
    }
    a[i] = n; k[i] = key;
  }
  pop(): number {
    const a = this.a, k = this.k, top = a[0];
    const n = a.pop()!, key = k.pop()!;
    if (a.length > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i, mk = key;
        if (l < a.length && k[l] < mk) { m = l; mk = k[l]; }
        if (r < a.length && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        a[i] = a[m]; k[i] = k[m]; i = m;
      }
      a[i] = n; k[i] = key;
    }
    return top;
  }
}
