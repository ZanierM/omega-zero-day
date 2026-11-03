// The pre-mission scene box: characters talk one line at a time, with a large
// portrait, before the mission clock starts. Click / Space / Enter advances (or
// finishes the line being typed), Back steps back, Esc or Skip ends it.

import { SPEAKERS, SceneLine } from './campaign/runner';

const box = document.getElementById('scene')!;
const head = document.getElementById('scenetitle')!;
const place = document.getElementById('sceneplace')!;
const portrait = document.getElementById('sceneportrait')!;
const who = document.getElementById('scenewho')!;
const text = document.getElementById('scenetext')!;
const prog = document.getElementById('sceneprog')!;
const backBtn = document.getElementById('sceneback') as HTMLButtonElement;
const nextBtn = document.getElementById('scenenext') as HTMLButtonElement;
const skipBtn = document.getElementById('sceneskip') as HTMLButtonElement;

const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CPS = 70;   // typing speed, characters per second

export function playScene(scene: { title: string; place: string; lines: SceneLine[] }): Promise<void> {
  if (!scene.lines.length) return Promise.resolve();
  return new Promise(resolve => {
    let i = 0, shown = 0, typer = 0;
    const full = () => scene.lines[i].text;

    const stopTyping = () => { if (typer) { clearInterval(typer); typer = 0; } };
    const finishLine = () => { stopTyping(); shown = full().length; text.textContent = full(); };
    const show = () => {
      const line = scene.lines[i];
      const narrator = line.who === 'narrator';
      const sp = narrator ? null : SPEAKERS[line.who as keyof typeof SPEAKERS];
      box.className = narrator ? 'narrator' : line.who;
      portrait.hidden = narrator;
      if (sp) {
        portrait.style.borderColor = sp.color;
        portrait.innerHTML = sp.portrait ? `<img src="portraits/${sp.portrait}" alt="">` : `<span>${sp.name.split(' ').pop()![0]}</span>`;
        who.style.color = sp.color;
        who.innerHTML = `${sp.name}<small>${sp.role}</small>`;
      } else who.textContent = '';
      prog.textContent = `${i + 1} / ${scene.lines.length}`;
      backBtn.disabled = i === 0;
      nextBtn.textContent = i === scene.lines.length - 1 ? 'Begin ▸' : 'Next ▸';
      stopTyping();
      if (instant) { finishLine(); return; }
      shown = 0; text.textContent = '';
      typer = window.setInterval(() => {
        shown = Math.min(full().length, shown + 2);
        text.textContent = full().slice(0, shown);
        if (shown >= full().length) stopTyping();
      }, 2000 / CPS);
    };
    const close = () => {
      stopTyping();
      box.hidden = true;
      removeEventListener('keydown', onKey, true);
      box.removeEventListener('click', onClick);
      backBtn.onclick = nextBtn.onclick = skipBtn.onclick = null;
      resolve();
    };
    const next = () => {
      if (shown < full().length) { finishLine(); return; }
      if (i >= scene.lines.length - 1) { close(); return; }
      i++; show();
    };
    const back = () => { if (i > 0) { i--; show(); } };
    // capture phase, so the game's own keys (Esc = pause, Space = last alert) never see these
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;   // let focus move between the buttons
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        // a focused button handles its own Enter/Space as a click
        if (!(e.target instanceof HTMLButtonElement)) { e.preventDefault(); next(); }
      }
    };
    // clicking anywhere on the scene (other than a button) advances
    const onClick = (e: MouseEvent) => { if (!(e.target instanceof Element && e.target.closest('button'))) next(); };

    head.textContent = scene.title;
    place.textContent = scene.place;
    backBtn.onclick = back;
    nextBtn.onclick = next;
    skipBtn.onclick = close;
    addEventListener('keydown', onKey, true);
    box.addEventListener('click', onClick);
    box.hidden = false;
    show();
    nextBtn.focus();
  });
}
