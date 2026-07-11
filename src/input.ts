import { TILE, PLAYER, BUILDINGS } from './config';
import { MAP_W, MAP_H } from './map';
import {
  units, buildings, byId, players, issueOrder, tileOf, canPlace, placeBuilding,
  entityPos, entityRadius, toast, Unit, fireStrike, superReady,
  jumpTargetAlert, starvedHarvesters,
} from './game';
import { crystal, idx, inBounds } from './map';
import { sfx } from './audio';

export const camera = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.5, MAX_ZOOM = 2.4;
export const selection = new Set<number>();
export let selectBox: { x: number, y: number, w: number, h: number } | null = null;
export let placement: { defId: string, tx: number, ty: number } | null = null;
export let attackMovePending = false;          // press A, then left-click a spot
const controlGroups = new Map<string, number[]>(); // '1'..'9' → entity ids
let usingTouch = false;    // true once any touch happens → disables mouse edge-scroll
let selectMode = false;    // ⛶ toggle: one-finger drag box-selects instead of panning
let lastMouseClick = 0, lastMouseUnit = -1; // for desktop double-click select-type

export function startPlacement(defId: string) {
  placement = { defId, tx: 0, ty: 0 };
}
export function cancelPlacement() { placement = null; }

// orbital-strike targeting: holds the launching building's id while the player aims
export let strikeTargeting: number | null = null;
export function startStrikeTargeting(bId: number) {
  strikeTargeting = bId;
  canvas.style.cursor = 'crosshair';
}
function fireStrikeAt(wx: number, wy: number) {
  const b = byId.get(strikeTargeting!);
  strikeTargeting = null;
  if (b?.kind === 'building' && superReady(b)) fireStrike(b, wx, wy);
}
// world point the player is currently aiming a strike at (for the reticle), or null
export function strikeAim(): { x: number, y: number } | null {
  return strikeTargeting !== null ? toWorld(mouse.x, mouse.y) : null;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const keys = new Set<string>();
let mouse = { x: 0, y: 0, inside: false };
let dragStart: { x: number, y: number } | null = null;

// Called by ui.ts when a ready building gets placed, to clear the queue slot
export let onBuildingPlaced: () => void = () => {};
export function setOnBuildingPlaced(fn: () => void) { onBuildingPlaced = fn; }

function toWorld(sx: number, sy: number) {
  return { x: sx / camera.zoom + camera.x, y: sy / camera.zoom + camera.y };
}

// zoom around a screen point, keeping the world under it fixed
function zoomAt(factor: number, screenX: number, screenY: number) {
  const before = toWorld(screenX, screenY);
  camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
  camera.x = before.x - screenX / camera.zoom;
  camera.y = before.y - screenY / camera.zoom;
  clampCamera();
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
      // orbital-strike targeting consumes the next click
      if (strikeTargeting !== null) {
        const w = toWorld(mouse.x, mouse.y);
        fireStrikeAt(w.x, w.y);
        return;
      }
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
      const a = toWorld(selectBox!.x, selectBox!.y);
      const b = toWorld(selectBox!.x + selectBox!.w, selectBox!.y + selectBox!.h);
      for (const u of units) {
        if (u.owner === PLAYER && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) selection.add(u.id);
      }
    } else {
      const w = toWorld(mouse.x, mouse.y);
      const hit = entityAt(w.x, w.y);
      const now = performance.now();
      const dbl = hit && hit.kind === 'unit' && hit.id === lastMouseUnit && now - lastMouseClick < 350;
      selection.clear();
      if (dbl && hit && hit.kind === 'unit') {
        // double-click a unit → select all of that type you own (like SC/RA2)
        for (const u of units) if (u.owner === PLAYER && u.def.id === hit.def.id) selection.add(u.id);
      } else if (hit && hit.owner === PLAYER) {
        selection.add(hit.id);
      }
      lastMouseUnit = hit && hit.kind === 'unit' ? hit.id : -1;
      lastMouseClick = now;
    }
    dragStart = null;
    selectBox = null;
  });

  window.addEventListener('keydown', e => {
    keys.add(e.key);
    if (e.key === 'Escape') { placement = null; attackMovePending = false; strikeTargeting = null; canvas.style.cursor = 'crosshair'; }
    // A = attack-move mode (next left-click orders the attack)
    if ((e.key === 'a' || e.key === 'A') && selectedUnits().some(u => u.def.damage > 0)) {
      attackMovePending = true;
      canvas.style.cursor = 'cell';
    }
    // S = stop
    if (e.key === 's' || e.key === 'S') {
      for (const u of selectedUnits()) issueOrder(u, { type: 'idle' });
    }
    // Space = snap camera to the last "under attack" alert
    if (e.key === ' ') {
      const a = jumpTargetAlert();
      if (a) { centerCameraOn(a.x, a.y); e.preventDefault(); }
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
  // one-finger drag pans · tap selects / orders · long-press = attack-move.
  // The ⛶ button flips to box-select: a one-finger drag rubber-bands a selection.
  // Double-tap a unit selects every unit of that type.
  let touch: { x: number, y: number, sx: number, sy: number, moved: boolean } | null = null;
  let lastTapAt = 0;
  let lastTapId = -1;
  let longPressTimer: number | null = null;
  let pinchDist = 0; // >0 while two fingers are down

  const touchPos = (e: TouchEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
  };
  const pinchInfo = (e: TouchEvent) => {
    const r = canvas.getBoundingClientRect();
    const ax = e.touches[0].clientX - r.left, ay = e.touches[0].clientY - r.top;
    const bx = e.touches[1].clientX - r.left, by = e.touches[1].clientY - r.top;
    return { dist: Math.hypot(bx - ax, by - ay), mx: (ax + bx) / 2, my: (ay + by) / 2 };
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
    usingTouch = true;
    if (e.touches.length >= 2) {
      // two fingers → pinch-zoom; cancel any in-progress single-finger gesture
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      touch = null; selectBox = null;
      pinchDist = pinchInfo(e).dist;
      return;
    }
    if (e.touches.length !== 1) { touch = null; selectBox = null; return; }
    const p = touchPos(e);
    touch = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
    // note: we set mouse.x/y for world-projection, but never mouse.inside —
    // that flag drives mouse edge-scroll, which must stay off during touch
    mouse.x = p.x; mouse.y = p.y;
    updateGhost();
    if (longPressTimer) clearTimeout(longPressTimer);
    if (!selectMode) {
      longPressTimer = window.setTimeout(() => {
        if (touch && !touch.moved && !placement && selectedUnits().some(u => u.def.damage > 0)) {
          const w = toWorld(touch.x, touch.y);
          for (const u of selectedUnits()) if (u.def.damage > 0) issueOrder(u, { type: 'attackMove', x: w.x, y: w.y });
          toast('Attack-move');
          touch = null; // consume so the tap doesn't also fire
        }
      }, 500);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length >= 2 && pinchDist > 0) {
      const pi = pinchInfo(e);
      if (pi.dist > 0) { zoomAt(pi.dist / pinchDist, pi.mx, pi.my); pinchDist = pi.dist; }
      return;
    }
    if (!touch || e.touches.length !== 1) return;
    const p = touchPos(e);
    if (Math.hypot(p.x - touch.sx, p.y - touch.sy) > 12) touch.moved = true;
    if (touch.moved && !placement) {
      if (selectMode) {
        selectBox = {
          x: Math.min(touch.sx, p.x), y: Math.min(touch.sy, p.y),
          w: Math.abs(p.x - touch.sx), h: Math.abs(p.y - touch.sy),
        };
      } else {
        camera.x -= (p.x - touch.x) / camera.zoom;
        camera.y -= (p.y - touch.y) / camera.zoom;
        clampCamera();
      }
    }
    touch.x = p.x; touch.y = p.y;
    mouse.x = p.x; mouse.y = p.y;
    updateGhost();
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (e.touches.length < 2) pinchDist = 0;
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!touch) { selectBox = null; return; }
    const t = touch;
    touch = null;

    // box-select drag completed
    if (selectMode && t.moved && selectBox && (selectBox.w > 6 || selectBox.h > 6)) {
      const a = toWorld(selectBox.x, selectBox.y);
      const b = toWorld(selectBox.x + selectBox.w, selectBox.y + selectBox.h);
      const x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
      selection.clear();
      for (const u of units) {
        if (u.owner === PLAYER && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) selection.add(u.id);
      }
      selectBox = null;
      if (selection.size) sfx('click');
      return;
    }
    selectBox = null;
    if (t.moved) return; // it was a pan

    mouse.x = t.x; mouse.y = t.y;
    if (strikeTargeting !== null) {
      const w = toWorld(t.x, t.y);
      fireStrikeAt(w.x, w.y);
      return;
    }
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
    const isDbl = now - lastTapAt < 350;
    if (hit && hit.owner === PLAYER) {
      if (isDbl && hit.kind === 'unit' && lastTapId === hit.id) {
        // double-tap a unit → select every unit of that type you own
        selection.clear();
        for (const u of units) if (u.owner === PLAYER && u.def.id === hit.def.id) selection.add(u.id);
      } else if (selection.size && hit.kind === 'building' && selectedUnits().length) {
        rightClick(); // units selected + tapped own building → order there
      } else {
        selection.clear();
        selection.add(hit.id);
      }
      lastTapId = hit.kind === 'unit' ? hit.id : -1;
    } else if (selection.size > 0) {
      rightClick(); // move / attack / harvest / set rally
      lastTapId = -1;
    } else {
      if (isDbl) selection.clear();
      lastTapId = -1;
    }
    lastTapAt = now;
  }, { passive: false });

  // ⛶ box-select toggle (shown only on touch devices via CSS)
  const selBtn = document.getElementById('selectmode');
  selBtn?.addEventListener('click', () => {
    selectMode = !selectMode;
    selBtn.classList.toggle('active', selectMode);
    canvas.style.cursor = selectMode ? 'cell' : 'crosshair';
  });

  // idle-harvester button: cycle to the next starved harvester and select it
  let idleCycle = 0;
  document.getElementById('idlebtn')?.addEventListener('click', () => {
    const idle = starvedHarvesters();
    if (!idle.length) return;
    const u = idle[idleCycle % idle.length];
    idleCycle++;
    selection.clear(); selection.add(u.id);
    centerCameraOn(u.x, u.y);
  });

  // minimap click → jump camera
  const mm = document.getElementById('minimap') as HTMLCanvasElement;
  const jump = (clientX: number, clientY: number) => {
    const r = mm.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width, fy = (clientY - r.top) / r.height;
    camera.x = fx * MAP_W * TILE - canvas.clientWidth / camera.zoom / 2;
    camera.y = fy * MAP_H * TILE - canvas.clientHeight / camera.zoom / 2;
    clampCamera();
  };
  mm.addEventListener('mousedown', e => jump(e.clientX, e.clientY));
  mm.addEventListener('mousemove', e => { if (e.buttons & 1) jump(e.clientX, e.clientY); });
  mm.addEventListener('touchstart', e => { e.preventDefault(); jump(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  mm.addEventListener('touchmove', e => { e.preventDefault(); jump(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

  // desktop: mouse-wheel zoom, anchored at the cursor
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, mouse.x, mouse.y);
  }, { passive: false });
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
  const viewW = canvas.clientWidth / camera.zoom, viewH = canvas.clientHeight / camera.zoom;
  camera.x = Math.max(0, Math.min(Math.max(0, MAP_W * TILE - viewW), camera.x));
  camera.y = Math.max(0, Math.min(Math.max(0, MAP_H * TILE - viewH), camera.y));
}

const SCROLL_SPEED = 700; // px per second
const EDGE = 24;

export function updateCamera(dt: number) {
  let dx = 0, dy = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
  // edge-scroll is a mouse-only affordance — on touch you drag to pan, and a
  // finger resting near an edge must never make the camera crawl on its own
  if (mouse.inside && !dragStart && !usingTouch) {
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
  camera.x = px - canvas.clientWidth / camera.zoom / 2;
  camera.y = py - canvas.clientHeight / camera.zoom / 2;
  clampCamera();
}
