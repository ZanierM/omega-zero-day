import { TILE, PLAYER, BUILDINGS } from './config';
import { MAP_W, MAP_H } from './map';
import {
  units, buildings, byId, players, issueOrder, tileOf, canPlace, placeBuilding, packBuilding, translocate,
  entityPos, entityRadius, toast, Unit, fireStrike, superReady,
  jumpTargetAlert, starvedHarvesters, activateAbility, visible, explored,
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

export function controlGroupIds(key: string): number[] {
  return (controlGroups.get(key) ?? []).filter(id => byId.get(id)?.owner === PLAYER);
}

export function saveControlGroup(key: string): boolean {
  const ids = [...selection].filter(id => byId.get(id)?.owner === PLAYER);
  if (!ids.length) return false;
  controlGroups.set(key, ids);
  toast(`Control group ${key} set`);
  return true;
}

export function recallControlGroup(key: string): boolean {
  const ids = controlGroupIds(key);
  if (!ids.length) return false;
  selection.clear();
  for (const id of ids) selection.add(id);
  return true;
}
let usingTouch = false;    // true once any touch happens → disables mouse edge-scroll
let selectMode = false;    // ⛶ toggle: one-finger drag box-selects instead of panning
let lastMouseClick = 0, lastMouseUnit = -1; // for desktop double-click select-type
let pan: { x: number, y: number } | null = null; // middle-button drag in progress

export function startPlacement(defId: string) {
  placement = { defId, tx: 0, ty: 0 };
}
export function cancelPlacement() { placement = null; }

// orbital-strike targeting: holds the launching building's id while the player aims
export let strikeTargeting: number | null = null;
export function startStrikeTargeting(bId: number) {
  strikeTargeting = bId;
}
function fireStrikeAt(wx: number, wy: number) {
  const b = byId.get(strikeTargeting!);
  strikeTargeting = null;
  if (b?.kind === 'building' && superReady(b)) fireStrike(b, wx, wy);
}
// Keeper translocation: the next click picks where the selected Keepers arrive
export let translocating = false;
export function startTranslocate() {
  translocating = true;
  const burrow = selectedUnits().some(u => u.def.ability?.reach === 'explored');
  toast(burrow ? 'Click where they should surface: anywhere you have scouted' : 'Click where they should arrive: somewhere you can see');
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
    if (e.button === 1) {
      // middle button: grab and drag the map (and no browser autoscroll)
      e.preventDefault();
      pan = { x: e.clientX, y: e.clientY };
      vel.x = vel.y = 0;
      return;
    }
    if (e.button === 0) {
      // orbital-strike targeting (and translocation) consume the next click
      if (strikeTargeting !== null) {
        const w = toWorld(mouse.x, mouse.y);
        fireStrikeAt(w.x, w.y);
        return;
      }
      if (translocating) {
        const w = toWorld(mouse.x, mouse.y);
        translocating = false; translocate(selectedUnits(), w.x, w.y);
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

  // window-level so a pan keeps going (and ends) wherever the pointer goes
  window.addEventListener('mousemove', e => {
    if (!pan) return;
    camera.x -= (e.clientX - pan.x) / camera.zoom;
    camera.y -= (e.clientY - pan.y) / camera.zoom;
    pan.x = e.clientX; pan.y = e.clientY;
    clampCamera();
  });

  // window-level so a drag still completes if the button is released off-canvas
  window.addEventListener('mouseup', e => {
    if (e.button === 1) { pan = null; return; }
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
    // the target can be the document or window, which have no closest()
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[role="dialog"]') || (e.key === ' ' && target?.closest('button'))) return;
    keys.add(e.key);
    if (e.key === 'Escape') { placement = null; attackMovePending = false; strikeTargeting = null; translocating = false; }
    // +/- zoom about the middle of the view
    if (e.key === '=' || e.key === '+') zoomAt(1.15, canvas.clientWidth / 2, canvas.clientHeight / 2);
    if (e.key === '-' || e.key === '_') zoomAt(1 / 1.15, canvas.clientWidth / 2, canvas.clientHeight / 2);
    // A = attack-move mode (next left-click orders the attack)
    if ((e.key === 'a' || e.key === 'A') && selectedUnits().some(u => u.def.damage > 0)) {
      attackMovePending = true;
    }
    // S = stop
    if (e.key === 's' || e.key === 'S') {
      for (const u of selectedUnits()) issueOrder(u, { type: 'idle' });
    }
    // P = a Clan building packs up into a Caravan
    if (e.key === 'p' || e.key === 'P') {
      for (const id of [...selection]) { const b = byId.get(id); if (b?.kind === 'building' && b.owner === PLAYER && b.def.packable) packBuilding(b); }
    }
    // Q = trigger the selected units' special ability
    if (e.key === 'q' || e.key === 'Q') {
      if (selectedUnits().some(u => u.def.ability?.target)) startTranslocate();
      else for (const u of selectedUnits()) if (u.def.ability) activateAbility(u);
    }
    // Space = snap camera to the last "under attack" alert
    if (e.key === ' ') {
      const a = jumpTargetAlert();
      if (a) { centerCameraOn(a.x, a.y); e.preventDefault(); }
    }
    // control groups: Ctrl/Cmd+digit assigns, digit recalls
    if (e.key >= '1' && e.key <= '9') {
      if (e.ctrlKey || e.metaKey) {
        saveControlGroup(e.key);
        e.preventDefault();
      } else {
        recallControlGroup(e.key);
      }
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key));
  // a key released while another window had focus never sends keyup: forget
  // everything held when focus leaves, or the camera keeps drifting
  const dropHeld = () => { keys.clear(); pan = null; dragStart = null; selectBox = null; vel.x = vel.y = 0; };
  window.addEventListener('blur', dropHeld);
  document.addEventListener('visibilitychange', () => { if (document.hidden) dropHeld(); });

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
    if (translocating) {
      const w = toWorld(t.x, t.y);
      translocating = false; translocate(selectedUnits(), w.x, w.y);
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

  // A system gesture can end touch without touchend; clear stale pan/long-press state.
  canvas.addEventListener('touchcancel', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    touch = null;
    pinchDist = 0;
    selectBox = null;
  });

  // ⛶ box-select toggle (shown only on touch devices via CSS)
  const selBtn = document.getElementById('selectmode');
  selBtn?.addEventListener('click', () => {
    selectMode = !selectMode;
    selBtn.classList.toggle('active', selectMode);
    selBtn.setAttribute('aria-pressed', String(selectMode));
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

  // desktop wheel, anchored at the cursor. A notched mouse wheel zooms by how
  // far it turned; a trackpad's two-finger swipe pans and its pinch (sent as
  // ctrl+wheel) zooms — zooming on every tiny trackpad event made it lurch
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    const notched = e.deltaMode !== 0 || (!!legacy && legacy % 120 === 0 && e.deltaX === 0);
    const clampZoom = (f: number) => Math.max(0.8, Math.min(1.25, f));
    if (e.ctrlKey) {
      zoomAt(clampZoom(Math.exp(-e.deltaY * 0.01)), mouse.x, mouse.y);
    } else if (notched) {
      const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);   // lines/pages → pixels
      zoomAt(clampZoom(Math.exp(-px * 0.0012)), mouse.x, mouse.y);
    } else {
      camera.x += e.deltaX / camera.zoom;
      camera.y += e.deltaY / camera.zoom;
      clampCamera();
    }
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

// pan speed in screen pixels per second, so it feels the same at every zoom
const PAN_SPEED = 900;
const EDGE = 22;                  // edge-scroll zone, screen px
const EDGE_DELAY = 0.18;          // s the mouse must rest in the zone first...
const EDGE_DELAY_BOTTOM = 0.4;    // ...longer above the deck, which it crosses constantly
const vel = { x: 0, y: 0 };       // world px/s, eased toward the wanted speed
let edgeHold = 0;
let edgeCursor = '';

export function updateCamera(dt: number) {
  // arrow keys only: A, S and Q are unit commands and must not also pan
  let dx = 0, dy = 0;
  if (keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('ArrowRight')) dx += 1;
  if (keys.has('ArrowUp')) dy -= 1;
  if (keys.has('ArrowDown')) dy += 1;

  // edge scroll: mouse only (a resting finger must never crawl the camera),
  // only after a short dwell so passing through the zone does nothing, and
  // faster the deeper the pointer sits in it
  let ex = 0, ey = 0;
  if (mouse.inside && !dragStart && !pan && !usingTouch && document.hasFocus()) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const push = (d: number) => d < EDGE ? 0.4 + 0.6 * (1 - Math.max(0, d) / EDGE) : 0;
    ex = push(w - 1 - mouse.x) - push(mouse.x);
    ey = push(h - 1 - mouse.y) - push(mouse.y);
  }
  edgeCursor = '';
  if (ex || ey) {
    edgeHold += dt;
    const delay = ey > 0 && !ex ? EDGE_DELAY_BOTTOM : EDGE_DELAY;
    if (edgeHold < delay) { ex = ey = 0; }
    else {
      const ramp = Math.min(1, (edgeHold - delay) / 0.3);
      ex *= ramp; ey *= ramp;
      edgeCursor = (ey < 0 ? 'n' : ey > 0 ? 's' : '') + (ex < 0 ? 'w' : ex > 0 ? 'e' : '') + '-resize';
    }
  } else edgeHold = 0;

  let tx = dx + ex, ty = dy + ey;
  const len = Math.hypot(tx, ty);
  if (len > 1) { tx /= len; ty /= len; }
  // ease toward the wanted velocity so starts and stops aren't abrupt
  const k = 1 - Math.exp(-dt * 12);
  vel.x += (tx * PAN_SPEED / camera.zoom - vel.x) * k;
  vel.y += (ty * PAN_SPEED / camera.zoom - vel.y) * k;
  if (Math.abs(vel.x) < 0.5 && !tx) vel.x = 0;
  if (Math.abs(vel.y) < 0.5 && !ty) vel.y = 0;
  const bx = camera.x, by = camera.y;
  camera.x += vel.x * dt;
  camera.y += vel.y * dt;
  clampCamera();
  if (vel.x && camera.x === bx) vel.x = 0;       // hit the map edge
  if (vel.y && camera.y === by) vel.y = 0;
  updateCursor();
}

// ---------- cursor: says what a click will do ----------

const svgCursor = (svg: string, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ${fallback}`;
const reticle = (col: string) => svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none">` +
  `<g stroke="#140806" stroke-width="4"><circle cx="12" cy="12" r="7"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></g>` +
  `<g stroke="${col}" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></g></svg>`, 'crosshair');
const CUR_ATTACK = reticle('#ff5a4a'), CUR_ATTACK_MOVE = reticle('#ffb02e');
const CUR_MOVE = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none">` +
  `<g stroke="#08140c" stroke-width="4"><circle cx="12" cy="12" r="6"/></g><circle cx="12" cy="12" r="6" stroke="#3ddc84" stroke-width="2"/>` +
  `<circle cx="12" cy="12" r="2" fill="#3ddc84" stroke="#08140c" stroke-width="1"/></svg>`, 'crosshair');
let shownCursor = '';

function updateCursor() {
  if (usingTouch || (!mouse.inside && !pan)) return;
  let c: string;
  if (pan) c = 'grabbing';
  else if (strikeTargeting !== null || translocating) c = CUR_ATTACK;
  else if (placement) c = 'crosshair';
  else if (attackMovePending) c = CUR_ATTACK_MOVE;
  else if (dragStart || selectMode) c = 'crosshair';
  else if (edgeCursor) c = edgeCursor;
  else {
    const w = toWorld(mouse.x, mouse.y);
    const hit = entityAt(w.x, w.y);
    const sel = selectedUnits();
    // hostile only counts if the player can actually see it, so the cursor
    // never gives away units hidden in the fog
    const seen = hit && hit.owner !== PLAYER && (hit.kind === 'unit'
      ? visible[idx(tileOf(hit.x), tileOf(hit.y))] === 1
      : explored[idx(hit.tx, hit.ty)] === 1);
    if (seen && sel.some(u => u.def.damage > 0)) c = CUR_ATTACK;
    else if (hit && hit.owner === PLAYER) c = 'pointer';
    else if (sel.length) c = CUR_MOVE;
    else c = 'default';
  }
  if (c !== shownCursor) { canvas.style.cursor = c; shownCursor = c; }
}

export function centerCameraOn(px: number, py: number) {
  camera.x = px - canvas.clientWidth / camera.zoom / 2;
  camera.y = py - canvas.clientHeight / camera.zoom / 2;
  clampCamera();
}
