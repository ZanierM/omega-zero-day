# Omega Zero Day — work split (reskin)

Two agents work in parallel on the reskin, split by **file ownership** so neither
edits the other's files and branches merge cleanly.

| | **Claude (world agent)** | **UI agent** |
|---|---|---|
| Owns | `src/art.ts`, `src/render.ts`, `src/game.ts`, `src/path.ts`, `src/ai.ts` | `index.html`, `src/ui.ts`, `src/main.ts`, `src/input.ts`, `src/audio.ts`, `src/briefing-scene.ts`, `public/*`, new UI-only files |
| Shared, by agreement | `src/config.ts`: the UI agent may change **name/desc strings only**; anything else goes through the user | |

**Temporary ownership change:** for the camera and mouse-controls round, Claude has `src/input.ts` (branch `reskin-input`). The UI agent should leave it alone until that branch is merged into `main`, then it returns to the UI agent.

**Small cross-file change (Claude, `reskin-world-3`):** `src/ui.ts` now re-bakes its icon cache when the render style flips (via `onStyleChange` from `render.ts`), and the selection portrait passes the selected thing's owner and level to `artIconUrl` / `unitIconUrl`. Keep those calls when reworking the build bar or the selection panel.

**Small cross-file change (Claude, `perf-load`):** `initRenderer()` in `render.ts` is now async (it paints the ground in slices so the page stays live), so `startGame` in `src/main.ts` awaits it. Keep the `await` when touching the deploy flow.

**Small cross-file change (Claude, `intent-and-saves`):** save/resume lives in a new `src/save.ts`. `src/main.ts` now auto-pauses and saves when the tab is hidden, autosaves every 20 s of play, clears the slot on game over, restart and a new deploy, and has a `resumeGame()` path behind a new `#resumesave` button in the briefing (`index.html`, styled next to `#deploy`). Keep these when reworking the briefing or the pause menu.

**Base branch from round 2 on: `main`.** `reskin-gunmetal`, `reskin-ui` and `reskin-world` were merged into `main` (PRs #1–#3). Each agent cuts a fresh branch from `main` per round and opens a PR back to `main`.

---

## Round 1 — status

**Done and in `main`**
- Foldable-first mobile layout; refined render style (now the default, `?style=classic` / V for the original)
- Hand-drawn art and Nexus-level detail for every building; new art for Sensor Array, Repair Yard, Skyport, Orbital Uplink
- Defences: new bases, aiming turret heads, modular walls
- UI agent: button hierarchy (gold / blue steel / gunmetal), spaced-caps type scale, machined modal frames, lighter build bar, styled tooltip cards, pixel-art briefing horizon, Strider Hovertank rename, `touchcancel` fix, selection panel only rewritten on change

- Infantry drawn in code (6 types, walk cycle), aircraft as 3D models, full-resolution terrain, in-world UI (selection rings, slim bars, placement ghost, drag box) — PR #4, merged and deployed to https://zanierm.github.io/omega-zero-day/

**Carried over:** effects and ambient life; unit icons for the build bar.

---

## Round 2 — Claude's list (in-world art and rendering)

1. Build-bar icons in the refined style: `artIconUrl` still bakes the old chunky, pixelated art. Bake icons through the refined pipeline, and refresh `defenceIconUrl` to show the new defences.
2. Export `unitIconUrl(defId)` for infantry, vehicles and aircraft from the new code-drawn art (the UI agent wires it in).
3. Effects: muzzle flashes, tracer and rocket trails, refined shells, explosions with debris, smoke and lingering scorch marks.
4. Ambient life: vent steam, extractor smoke, crystal glints, drifting dust, a gentle sway on alien flora.
5. Construction, upgrade and destruction visuals: scaffold or rise-up while building, a flash on upgrade, rubble left behind when a structure dies.
6. Minimap rendering in the refined palette: terrain colours that match the new ground, crisp team-coloured blips, a gold camera frame (the minimap's frame CSS stays the UI agent's).
7. Performance pass on the refined style: the terrain paint (~0.5–1.2 s by map size) currently shows as a black screen after deploy, so make it faster or split it across frames; pre-warm sprites during load to avoid first-sight bake hitches; check sprite memory at 3× bakes and frame time on Fold-class hardware.
8. Decision for the user: once refined is approved, remove the classic code paths and the V toggle, or keep classic as a selectable option (pairs with the UI agent's graphics setting).

## Round 2 — UI agent's list (interface, layout, mobile)

1. **Bug — toast position:** the machined-frame rule sets `#toast { position: relative }`, which overrides the toast's `position: fixed`, so it drops into the page flow and sits on the deck's top edge. Restore fixed positioning (the frame's `::before`/`::after` only need a positioned ancestor, which `fixed` already is).
2. **Bug — double start, and a loading state:** pressing "Commence operation" twice starts the game twice; every base is placed twice on the same spots and the overlapping HQs fight ("Base under attack!" from the first second). Guard the deploy handler in `main.ts` (ignore once started, disable the button). The briefing also hides before the map has finished painting, so players see a black screen for up to ~1 s; keep the briefing up with a "Deploying…" state on the button until `startGame` resolves.
3. **Cover screen landscape (882×344):** the command deck now takes 157 px of 344 (46%), leaving the map 187 px. Slim it back to roughly 110 px or less: meet the 40 px touch targets with width rather than height in this layout, keep the upgrade label on one line, drop non-essential rows.
4. **Cover screen portrait (344×882):** build-button labels are clipped by the build bar's scrollbar. Give the row enough height or move the scrollbar out of the way.
5. **Briefing backdrop:** on desktop and the unfolded Fold the card hides most of the scene (only a strip of the sun shows), and its 3× chunky pixels now clash with the refined in-game look. Make the scene readable around the card (for example a horizon band visible above or below it, or the sun and outpost placed where the card doesn't cover them) and render it at a finer pixel scale.
6. **Graphics setting:** add a "Graphics: Refined / Classic" option to the pause menu, calling `setRefinedStyle()` from `render.ts`, so the style isn't only behind the V debug key. Remember the choice (and the sound setting) in `localStorage`, wrapped in try/catch.
7. **Selection panel:** show a portrait of the selected unit or building using `artIconUrl` (and `unitIconUrl` once it exists), and a slim health bar matching the in-world one.
8. Wire `unitIconUrl(defId)` into `bakeIconHtml` in `ui.ts` for infantry, vehicle and aircraft icons once Claude exports it, through the existing `iconCache`.
9. Accessibility polish: keyboard navigation between build tabs and buttons, sensible focus order in menus, and a `prefers-reduced-motion` rule that calms the pulsing animations (countdown flash, idle-harvester pulse, strike banner).
10. `main.ts` keydown handler: `(e.target as HTMLElement).closest(...)` throws when the event's target is the window or document (no `closest`). Real key presses come from elements so players don't hit it, but guard it the way `input.ts` now does (`e.target instanceof Element ? e.target : null`).

---

## Prompt for the UI agent — round 2 (copy everything below the line)

---

You're continuing the reskin of **Omega Zero Day**, a browser RTS in TypeScript + HTML5 Canvas (Vite, no framework). Repo: https://github.com/ZanierM/omega-zero-day. Your round-1 work (button hierarchy, type scale, machined frames, lighter build bar, tooltip cards, briefing horizon, Strider Hovertank rename, touch fixes) is merged into `main`. Another agent (Claude) is working on the same project at the same time, so follow the ownership rules below exactly.

### Your scope: the interface (unchanged)

You own these files and only these:
- `index.html` (all CSS lives in its `<style>` block, with design tokens on `:root`)
- `src/ui.ts`, `src/main.ts`, `src/input.ts`, `src/audio.ts`, `src/briefing-scene.ts`
- everything in `public/`, and any new UI-only files you create

**Do not edit** `src/art.ts`, `src/render.ts`, `src/game.ts`, `src/path.ts` or `src/ai.ts`: Claude owns them. You may *call* their exports (`artIconUrl`, `setRefinedStyle`, `refinedStyle`, and soon `unitIconUrl`). In `src/config.ts` you may change `name` and `desc` strings only. If you need anything else in a file you don't own, stop and tell the user what you need instead of editing it.

### Setup

Start a fresh branch from `main` (everything from round 1 is merged there):

```bash
cd omega-zero-day-ui
git fetch origin
git switch -c reskin-ui-2 origin/main
npm install
npx vite
```

Commit to `reskin-ui-2` in small, focused commits, push it, and the user will merge it into `main`. If `git push` is refused for a different GitHub account, push with:

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin reskin-ui-2
```

### Visual direction (unchanged)

Gunmetal plates, bronze trim, gold lettering; extend the `:root` tokens rather than hard-coding colours. The in-game art now defaults to a **refined** style (crisp, finely shaded, no chunky pixelation); `?style=classic` or the V key shows the original. Check your UI against the refined style first. Borrow polish techniques from clanfire.online, never its art, theme, branding, layout or text.

### Your task list, in order

1. **Bug — toast position:** the machined-frame rule sets `#toast { position: relative }`, which overrides the toast's `position: fixed`, so the toast drops into the page flow and sits on the command deck's top edge. Restore fixed positioning; the frame's `::before`/`::after` only need a positioned element, which `fixed` already is.
2. **Bug — double start, and a loading state:** pressing "Commence operation" twice starts the game twice. Every base is placed twice on the same spots and the overlapping HQs fight from the first second ("Base under attack!"). Guard the deploy handler in `main.ts`: ignore clicks once a start is under way and disable the button. The briefing also hides before the map has finished painting, so players see a black screen for up to about a second: keep the briefing up with a "Deploying…" state on the button until `startGame` resolves, then hide it.
3. **Cover screen landscape (882×344):** the command deck now takes 157 px of 344 (46%), leaving the map 187 px tall. Slim it back to about 110 px or less: meet the 40 px touch targets with width rather than height in this layout, keep the upgrade label on one line, and drop anything non-essential.
4. **Cover screen portrait (344×882):** build-button labels are clipped by the build bar's scrollbar. Give the row enough height or keep the scrollbar clear of the labels.
5. **Briefing backdrop:** on desktop and the unfolded Fold the briefing card hides most of the scene (only a strip of the sun shows), and its 3× chunky pixels clash with the refined in-game look. Make the scene readable around the card (for example a horizon band visible above or below it, or the sun and outpost placed where the card doesn't cover them) and draw it at a finer pixel scale.
6. **Graphics setting:** add a "Graphics: Refined / Classic" option to the pause menu that calls `setRefinedStyle()` from `render.ts`, so the style isn't only behind the V debug key. Remember the choice and the sound setting in `localStorage`, every read and write wrapped in try/catch, and apply the saved style before the first frame.
7. **Selection panel:** show a small portrait of the selected unit or building (use `artIconUrl(defId)`, and `unitIconUrl(defId)` once it exists) and a slim health bar that matches the in-world one.
8. When Claude exports `unitIconUrl(defId)` from `render.ts`, use it for infantry, vehicle and aircraft icons in `bakeIconHtml` in `ui.ts`, through the existing `iconCache`.
9. Accessibility polish: keyboard navigation between the build tabs and buttons, a sensible focus order in the menus, and a `prefers-reduced-motion` rule that calms the pulsing animations (countdown flash, idle-harvester pulse, orbital-strike banner).

### Rules learned the hard way

- **Never re-bake data-URL images when rebuilding the DOM.** Freshly baked data-URL `<img>`s stalled the next frame for about a second on every build-bar tab switch. Keep every icon going through `iconCache` in `ui.ts`.
- `updateUI()` runs every frame: write to the DOM only when a value changes (as you already do for the selection panel), and avoid layout reads in it.
- Test at all of these sizes (the player's main device is a Galaxy Z Fold): desktop 1280×800, unfolded portrait **884×1104**, unfolded landscape **1104×884**, cover portrait **344×882**, cover landscape **882×344**. Respect `env(safe-area-inset-*)`. No horizontal page scroll at any size. Touch targets at least 40 px.
- Start each test game with a **single** click on "Commence operation" until task 2 is fixed, or you'll see doubled bases.
- Match the surrounding code: terse comments that explain *why*, the same naming and idioms, no new dependencies, no frameworks.

### Before you finish each task

- `npx tsc --noEmit -p .` passes.
- Check it in the browser at desktop size and at least one Fold size, in the refined style, with no console errors.
- Commit and push `reskin-ui-2`, then tell the user what changed and anything you couldn't verify.
