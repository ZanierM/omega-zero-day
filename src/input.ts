import { TILE, PLAYER, BUILDINGS } from './config';
import { MAP_W, MAP_H } from './map';
import {
  units, buildings, byId, players, issueOrder, tileOf, canPlace, placeBuilding,
  entityPos, entityRadius, toast, Unit,
} from './game';
import { crystal, idx, inBounds } from './map';
import { sfx } from './audio';

export const camera = { x: 0, y: 0 };
export const selection = new Set<number>();
export let selectBox: { x: number, y: number, w: number, h: number } | null = null;
export let placement: { defId: string, tx: number, ty: number } | null = null;
export let attackMovePending = false;          // press A, then left-click a spot
const controlGroups = new Map<string, number[]>(); // '1'..'9' → entity ids

export function startPlacement(defId: string) {
  placement = { defId, tx: 0, ty: 0 };
}
export function cancelPlacement() { placement = null; }

const canvas = document.getElementById('game') as HTMLCanvasElement;
const keys = new Set<string>();
let mouse = { x: 0, y: 0, inside: false };
let dragStart: { x: number, y: number } | null = null;

// Called by ui.ts when a ready building gets placed, to clear the queue slot
export let onBuildingPlaced: () => void = () => {};
export function setOnBuildingPlaced(fn: () => void) { onBuildingPlaced = fn; }

function toWorld(sx: number, sy: number) {
  return { x: sx + camera.x, y: sy + camera.y };
}

function selectedUnits(): Unit[] {
  const out: Unit[] = [];
  for (const id of selection) {
    const e = byId.get(id);
    if (e?.kind === 'unit' && e.owner === PLAYER) out.push(e);
  }
  return out;
}

function entityAt(wx: number, wy: number) {
  for (const u of units) {
    if (Math.hypot(u.x - wx, u.y - wy) <= u.def.radius + 4) return u;
  }
  for (const b of buildings) {
    const tx = tileOf(wx), ty = tileOf(wy);
    if (tx >= b.tx && tx < b.tx + b.def.w && ty >= b.ty && ty < b.ty + b.def.h) return b;
  }
  return null;
}

export function initInput() {
  // Right-click / two-finger click / Ctrl+click all arrive as `contextmenu` —
  // this is the reliable path on macOS trackpads.
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (placement) { placement = null; return; }
    rightClick();
  });
  canvas.addEventListener('mouseenter', () => (mouse.inside = true));
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; selectBox = null; dragStart = null; });

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (placement) {
      const w = toWorld(mouse.x, mouse.y);
      const def = BUILDINGS[placement.defId];
      placement.tx = Math.min(MAP_W - def.w, Math.max(0, tileOf(w.x) - Math.floor(def.w / 2)));
      placement.ty = Math.min(MAP_H - def.h, Math.max(0, tileOf(w.y) - Math.floor(def.h / 2)));
    }
    if (dragStart) {
      selectBox = {
        x: Math.min(dragStart.x, mouse.x), y: Math.min(dragStart.y, mouse.y),
        w: Math.abs(mouse.x - dragStart.x), h: Math.abs(mouse.y - dragStart.y),
      };
    }
  });

  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
      if (placement) {
        if (canPlace(PLAYER, placement.defId, placement.tx, placement.ty)) {
          placeBuilding(placement.defId, PLAYER, placement.tx, placement.ty);
          placement = null;
          onBuildingPlaced();
          sfx('place');
        } else {
          toast('Cannot build there');
          sfx('error');
        }
        return;
      }
      // attack-move: A was pressed — this click is the destination
      if (attackMovePending) {
        attackMovePending = false;
        canvas.style.cursor = 'crosshair';
        const w = toWorld(mouse.x, mouse.y);
        const sel = selectedUnits().filter(u => u.def.damage > 0);
        sel.forEach((u, i) => {
          const ang = (i / Math.max(1, sel.length)) * Math.PI * 2;
          const spread = Math.min(3, Math.floor(i / 4)) * 26;
          issueOrder(u, { type: 'attackMove', x: w.x + Math.cos(ang) * spread, y: w.y + Math.sin(ang) * spread });
        });
        return;
      }
      dragStart = { x: mouse.x, y: mouse.y };
    }
    // note: right-click is handled by the `contextmenu` listener above,
    // which fires for trackpad two-finger clicks and Ctrl+click too
  });

  // window-level so a drag still completes if the button is released off-canvas
  window.addEventListener('mouseup', e => {
    if (e.button !== 0 || !dragStart) return;
    const wasDrag = selectBox && (selectBox.w > 6 || selectBox.h > 6);
    if (wasDrag) {
      selection.clear();
      const x0 = selectBox!.x + camera.x, y0 = selectBox!.y + camera.y;
      const x1 = x0 + selectBox!.w, y1 = y0 + selectBox!.h;
      for (const u of units) {
        if (u.owner === PLAYER && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) selection.add(u.id);
      }
    } else {
      const w = toWorld(mouse.x, mouse.y);
      const hit = entityAt(w.x, w.y);
      selection.clear();
      if (hit && hit.owner === PLAYER) selection.add(hit.id);
    }
    dragStart = null;
    selectBox = null;
  });

  window.addEventListener('keydown', e => {
    keys.add(e.key);
    if (e.key === 'Escape') { placement = null; attackMovePending = false; canvas.style.cursor = 'crosshair'; }
    // A = attack-move mode (next left-click orders the attack)
    if ((e.key === 'a' || e.key === 'A') && selectedUnits().some(u => u.def.damage > 0)) {
      attackMovePending = true;
      canvas.style.cursor = 'cell';
    }
    // S = stop
    if (e.key === 's' || e.key === 'S') {
      for (const u of selectedUnits()) issueOrder(u, { type: 'idle' });
    }
    // control groups: Ctrl/Cmd+digit assigns, digit recalls
    if (e.key >= '1' && e.key <= '9') {
      if (e.ctrlKey || e.metaKey) {
        controlGroups.set(e.key, [...selection]);
        toast(`Control group ${e.key} set`);
        e.preventDefault();
      } else {
        const ids = controlGroups.get(e.key);
        if (ids?.length) {
          selection.clear();
          for (const id of ids) if (byId.has(id)) selection.add(id);
        }
      }
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key));

  // ---------- touch controls (phones / tablets) ----------
  // one-finger drag pans · tap selects or orders · long-press = attack-move
  let touch: { x: number, y: number, sx: number, sy: number, moved: boolean } | null = null;
  let lastTapAt = 0;
  let longPressTimer: number | null = null;

  const touchPos = (e: TouchEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
  };
  const updateGhost = () => {
    if (!placement) return;
    const w = toWorld(mouse.x, mouse.y);
    const def = BUILDINGS[placement.defId];
    placement.tx = Math.min(MAP_W - def.w, Math.max(0, tileOf(w.x) - Math.floor(def.w / 2)));
    placement.ty = Math.min(MAP_H - def.h, Math.max(0, tileOf(w.y) - Math.floor(def.h / 2)));
  };

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length !== 1) { touch = null; return; }
    const p = touchPos(e);
    touch = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
    mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
    updateGhost();
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      if (touch && !touch.moved && !placement && selectedUnits().some(u => u.def.damage > 0)) {
        const w = toWorld(touch.x, touch.y);
        for (const u of selectedUnits()) if (u.def.damage > 0) issueOrder(u, { type: 'attackMove', x: w.x, y: w.y });
        toast('Attack-move');
        touch = null; // consume so the tap doesn't also fire
      }
    }, 500);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!touch || e.touches.length !== 1) return;
    const p = touchPos(e);
    if (Math.hypot(p.x - touch.sx, p.y - touch.sy) > 12) touch.moved = true;
    if (touch.moved && !placement) {
      camera.x -= p.x - touch.x;
      camera.y -= p.y - touch.y;
      clampCamera();
    }
    touch.x = p.x; touch.y = p.y;
    mouse.x = p.x; mouse.y = p.y;
    updateGhost();
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!touch) return;
    const t = touch;
    touch = null;
    if (t.moved) return; // it was a pan
    mouse.x = t.x; mouse.y = t.y;
    // tap: place building / select own thing / order the current selection
    if (placement) {
      if (canPlace(PLAYER, placement.defId, placement.tx, placement.ty)) {
        placeBuilding(placement.defId, PLAYER, placement.tx, placement.ty);
        placement = null;
        onBuildingPlaced();
        sfx('place');
      } else { toast('Cannot build there'); sfx('error'); }
      return;
    }
    const w = toWorld(t.x, t.y);
    const hit = entityAt(w.x, w.y);
    const now = performance.now();
    if (hit && hit.owner === PLAYER && !(selection.size && hit.kind === 'building' && selectedUnits().length)) {
      selection.clear();
      selection.add(hit.id);
    } else if (selection.size > 0) {
      rightClick(); // move / attack / harvest / set rally — same as a right-click
    } else if (now - lastTapAt < 350) {
      selection.clear();
    }
    lastTapAt = now;
  }, { passive: false });

  // minimap click → jump camera
  const mm = document.getElementById('minimap') as HTMLCanvasElement;
  const jump = (e: MouseEvent) => {
    const r = mm.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    camera.x = fx * MAP_W * TILE - canvas.clientWidth / 2;
    camera.y = fy * MAP_H * TILE - canvas.clientHeight / 2;
    clampCamera();
  };
  mm.addEventListener('mousedown', jump);
  mm.addEventListener('mousemove', e => { if (e.buttons & 1) jump(e); });
}

function rightClick() {
  const w0 = toWorld(mouse.x, mouse.y);
  // a single selected production building: right-click sets its rally point
  if (selection.size === 1) {
    const e = byId.get([...selection][0]);
    if (e?.kind === 'building' && e.owner === PLAYER && e.def.produces) {
      e.rallyX = w0.x; e.rallyY = w0.y;
      toast('Rally point set');
      return;
    }
  }
  const sel = selectedUnits();
  if (sel.length === 0) return;
  const w = w0;
  const hit = entityAt(w.x, w.y);

  if (hit && hit.owner !== PLAYER) {
    for (const u of sel) if (u.def.damage > 0) issueOrder(u, { type: 'attack', targetId: hit.id });
    return;
  }
  const tx = tileOf(w.x), ty = tileOf(w.y);
  const onCrystal = inBounds(tx, ty) && crystal[idx(tx, ty)] > 0;
  // spread destinations slightly so groups don't fight for one tile
  sel.forEach((u, i) => {
    const ang = (i / sel.length) * Math.PI * 2;
    const spread = Math.min(3, Math.floor(i / 4)) * 26;
    const dx = Math.cos(ang) * spread, dy = Math.sin(ang) * spread;
    if (u.def.harvester && onCrystal) {
      issueOrder(u, { type: 'harvest', x: w.x, y: w.y });
    } else {
      issueOrder(u, { type: 'move', x: w.x + dx, y: w.y + dy });
    }
  });
}

function clampCamera() {
  camera.x = Math.max(0, Math.min(MAP_W * TILE - canvas.clientWidth, camera.x));
  camera.y = Math.max(0, Math.min(MAP_H * TILE - canvas.clientHeight, camera.y));
}

const SCROLL_SPEED = 700; // px per second
const EDGE = 24;

export function updateCamera(dt: number) {
  let dx = 0, dy = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
  if (mouse.inside && !dragStart) {
    if (mouse.x < EDGE) dx -= 1;
    if (mouse.x > canvas.clientWidth - EDGE) dx += 1;
    if (mouse.y < EDGE) dy -= 1;
    if (mouse.y > canvas.clientHeight - EDGE) dy += 1;
  }
  camera.x += dx * SCROLL_SPEED * dt;
  camera.y += dy * SCROLL_SPEED * dt;
  clampCamera();
}

export function centerCameraOn(px: number, py: number) {
  camera.x = px - canvas.clientWidth / 2;
  camera.y = py - canvas.clientHeight / 2;
  clampCamera();
}
