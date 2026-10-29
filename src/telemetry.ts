// Pacing and performance telemetry. Cheap enough to leave on: a ring buffer of
// frame intervals, a few counters, and a sample every 30 s of match time.
// `?perf` shows a live overlay; `novaTelemetry()` in the console returns the
// current report; finished matches are kept in localStorage (last 10).

const KEY = 'ozd-telemetry';
const STALL_AFTER = 30;     // seconds without income before a faction counts as stalled
const SAMPLE_EVERY = 30;

export let overlayOn = new URLSearchParams(location.search).has('perf');
export function setOverlay(on: boolean) { overlayOn = on; }

// ---- frames ----
const N = 600;
const frames = new Float32Array(N);
let fi = 0, fcount = 0, lastFrameAt = 0, longFrames = 0;
let renderMs = 0, updateMs = 0;
const ema = (prev: number, v: number) => prev ? prev * 0.95 + v * 0.05 : v;

export function frameDrawn(renderCost: number) {
  const now = performance.now();
  if (lastFrameAt) {
    const d = now - lastFrameAt;
    if (d < 1000) {   // a hidden tab's gap isn't a frame
      frames[fi] = d; fi = (fi + 1) % N; fcount++;
      if (d > 50) longFrames++;
    }
  }
  lastFrameAt = now;
  renderMs = ema(renderMs, renderCost);
}
export function updateTimed(ms: number) { updateMs = ema(updateMs, ms); }

function frameStats() {
  const n = Math.min(fcount, N);
  if (!n) return { p50: 0, p95: 0, worst: 0, fps: 0 };
  const a = Array.from(frames.subarray(0, n)).sort((x, y) => x - y);
  const p50 = a[Math.floor(n * 0.5)], p95 = a[Math.min(n - 1, Math.floor(n * 0.95))];
  return { p50, p95, worst: a[n - 1], fps: 1000 / p50 };
}

// ---- match ----
interface Sample { t: number; units: number; buildings: number; p50: number; p95: number; updateMs: number; renderMs: number }
export interface MatchReport {
  startedAt: number; factions: number; resumed: boolean; viewport: string;
  firstFight: number | null;          // first damage between any two factions (s)
  firstPlayerFight: number | null;    // first time the player hits or is hit
  length: number | null; result: string | null; reason: string | null;
  unitsLost: number[]; buildingsLost: number[]; earned: number[];
  stalls: number[]; stallSec: number[];   // income stalls per faction: count, total seconds
  longFrames: number; samples: Sample[];
}
let m: MatchReport | null = null;
let lastEarn: number[] = [], stalled: boolean[] = [], nextSample = 0, time = 0;

export function startMatch(factions: number, resumed = false, at = 0) {
  m = {
    startedAt: Date.now(), factions, resumed, viewport: `${innerWidth}×${innerHeight}@${devicePixelRatio}`,
    firstFight: null, firstPlayerFight: null, length: null, result: null, reason: null,
    unitsLost: Array(factions).fill(0), buildingsLost: Array(factions).fill(0), earned: Array(factions).fill(0),
    stalls: Array(factions).fill(0), stallSec: Array(factions).fill(0), longFrames: 0, samples: [],
  };
  lastEarn = Array(factions).fill(at); stalled = Array(factions).fill(false);
  nextSample = at + SAMPLE_EVERY; time = at; longFrames = 0;
}

export function fight(a: number, b: number) {
  if (!m || a === b || a < 0 || b < 0) return;
  if (m.firstFight === null) m.firstFight = time;
  if (m.firstPlayerFight === null && (a === 0 || b === 0)) m.firstPlayerFight = time;
}
export function lost(owner: number, kind: 'unit' | 'building') {
  if (!m || owner < 0 || owner >= m.factions) return;
  (kind === 'unit' ? m.unitsLost : m.buildingsLost)[owner]++;
}
export function earned(owner: number, amount: number) {
  if (!m || owner < 0 || owner >= m.factions || amount <= 0) return;
  m.earned[owner] += amount; lastEarn[owner] = time; stalled[owner] = false;
}

/** Called once per simulation step with match time. */
export function tick(t: number, dt: number, unitCount: number, buildingCount: number) {
  if (!m) return;
  time = t;
  for (let o = 0; o < m.factions; o++) {
    if (t - lastEarn[o] < STALL_AFTER) continue;
    if (!stalled[o]) { stalled[o] = true; m.stalls[o]++; m.stallSec[o] += STALL_AFTER; }
    else m.stallSec[o] += dt;
  }
  if (t >= nextSample) {
    nextSample += SAMPLE_EVERY;
    const f = frameStats();
    m.samples.push({ t: Math.round(t), units: unitCount, buildings: buildingCount, p50: +f.p50.toFixed(1), p95: +f.p95.toFixed(1),
      updateMs: +updateMs.toFixed(2), renderMs: +renderMs.toFixed(2) });
  }
}

export function endMatch(result: string, reason: string | null) {
  if (!m || m.result) return;
  m.length = Math.round(time); m.result = result; m.reason = reason; m.longFrames = longFrames;
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MatchReport[];
    all.push(m);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-10)));
  } catch { /* storage may be unavailable */ }
}

export function report(): MatchReport | null {
  return m && { ...m, longFrames, samples: [...m.samples] };
}
export function history(): MatchReport[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

const fmt = (s: number | null) => s === null ? null : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function liveSummary() {
  const f = frameStats();
  return {
    ...f, updateMs, renderMs, longFrames,
    firstFight: fmt(m?.firstPlayerFight ?? null),
    stalls: m?.stalls[0] ?? 0, stallSec: Math.round(m?.stallSec[0] ?? 0),
    losses: m?.unitsLost ?? [],
  };
}

(window as any).novaTelemetry = () => ({ current: report(), live: liveSummary(), history: history() });
(window as any).novaPerf = (on = !overlayOn) => setOverlay(on);
