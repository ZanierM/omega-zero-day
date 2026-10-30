// After Zero Day: an epilogue for the ending you reached, shaded by the choices
// you made on the way (the labs, the Meridian, Okoye), then a slow credits roll.
// Built on demand as its own full-screen layer; it borrows the page's colours.

type Flags = Record<string, string>;

function epilogue(ending: number, f: Flags): { title: string; lines: string[] } {
  const okoye = f.okoye === 'left'
    ? 'Okoye stayed on Cinder with what was left of Kessler\'s people. Her beacon was last heard in the northern vents, still moving.'
    : 'Okoye stood at the rail when the corridor opened. She never asked the question again. She didn\'t have to.';
  const lind = 'Somewhere under the crust, the Lantern shaft is quiet. Lind\'s name is cut into the beacon housing, by the engineers he trained.';
  if (ending === 3) return {
    title: 'The Seed',
    lines: [
      'The heart-crystal rides in the fleet\'s hold, wrapped in the Hollow\'s singing. It hums on the long nights. The sleepers say they dream of green.',
      'Seren\'s people walk the corridors of a ship again, two hundred years after the Meridian came down. The children ask them about the sky.',
      f.labs === 'spared' ? 'Reyes did not come. She stayed with the Hearth to watch the end, and sent her notes up the corridor in the last minute: everything she knew about the Vey, so that someone would.' : 'There were no notes from the Hearth. The labs had burned. What the Vey was, the fleet learns slowly, from the seed itself.',
      okoye, lind,
      'Varga\'s confession is played once a year, on the anniversary. Nobody turns it off.',
      'Helios is gone. Cinder is gone. But something that held a sun steady for a million years is still alive, and it is looking for a new one.',
    ],
  };
  if (ending === 2) return {
    title: 'The Long Dusk',
    lines: [
      'The beacon never fired. The fleet came down instead, one ship at a time, onto the plains around the vents.',
      'The Vey, unbled, held Helios a while longer. Years now. The sky is the colour of a forge, and the crops come up anyway.',
      f.labs === 'spared' ? 'Reyes runs the first school on Cinder. The first lesson is that the ground is alive. The second is how to listen to it.' : 'The Hearth rebuilt the labs from nothing. They do not let Helion people inside them, and nobody blames them.',
      f.meridian === 'protected' ? 'The Hollow come up out of the rock at dusk to trade. The colonists have started learning their old slang. Seren laughs at the accents.' : 'The Hollow do not come up any more. The tunnels under the Meridian are sealed, and the colonists do not go near them.',
      okoye, lind,
      'Helion\'s board stood trial in the open, under the dying sun, in front of forty thousand people who had just woken up. It took a year. The verdict took an hour.',
      'The star will still die. But not today, and not yet.',
    ],
  };
  return {
    title: 'Last Light',
    lines: [
      'The beacon burned the vents dry, and the fleet rode the corridor out with nothing behind it but light.',
      'Forty thousand sleepers woke on the far side, and the first thing every one of them heard was Varga\'s voice, on an open channel, telling them what it had cost.',
      f.labs === 'spared' ? 'Reyes\'s last broadcast was a recording of the Vey singing. The fleet keeps it in the archive. Most people only play it once.' : 'Nothing came up the corridor from the Hearth. The labs had burned, and with them the only proof of what was down there.',
      f.meridian === 'protected' ? 'The Hollow stood on the vents to the end, holding the line for people who were leaving them behind.' : 'The Hollow were never seen again. Not on Cinder, and not in any record the company kept.',
      okoye, lind,
      'Helion\'s board was arrested on the far side. The trial was short. The guilt is longer.',
    ],
  };
}

const CREDITS = [
  ['OMEGA ZERO DAY', ''],
  ['A game by', 'ZanierM'],
  ['Built with', 'Claude Code'],
  ['', ''],
  ['Adm. Ines Varga', 'Ark-fleet command'],
  ['Sgt. Mara Okoye', 'Helion ground lead'],
  ['Dr. Teodor Lind', 'Flux engineering'],
  ['Marshal Dieter Kessler', 'The Kessler Collective'],
  ['Speaker Ama Reyes', 'The Hearth Clans'],
  ['Vessa Kol', 'The Ashen Clans'],
  ['Seren', 'Elder of the Hollow'],
  ['The Keeper', 'The makers of the Vey'],
  ['Lantern', 'You'],
  ['', ''],
  ['', 'For everyone who stayed to watch the sun go out.'],
  ['', 'Thank you for playing.'],
];

/** Full-screen epilogue then credits; `done` runs when the player leaves. */
export function showEpilogue(ending: number, flags: Flags, done: () => void) {
  const ep = epilogue(ending, flags);
  const root = document.createElement('div');
  root.id = 'epilogue';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'background:radial-gradient(ellipse at 50% 120%, rgba(255,120,40,.22), rgba(0,0,0,0) 60%), #07060a;color:#eee2c8;'
    + 'padding:max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));overflow:hidden;font-family:var(--body, system-ui)';
  const style = document.createElement('style');
  style.textContent = `
    #epilogue h2 { font-family: var(--head, system-ui); font-size: clamp(26px, 5vw, 44px); letter-spacing: .12em; text-transform: uppercase; color: var(--gold, #e8c66a); margin: 0 0 18px; text-align: center; }
    #epilogue .ep { max-width: 640px; width: 100%; overflow-y: auto; max-height: 70vh; scrollbar-width: thin; scrollbar-color: rgba(232,198,106,.35) transparent; }
    #epilogue .ep p { font-size: clamp(15px, 2.2vw, 18px); line-height: 1.6; margin: 0 0 14px; opacity: 0; animation: epIn 1.6s ease forwards; }
    #epilogue .roll { position: absolute; left: 0; right: 0; top: 100%; text-align: center; animation: epRoll 38s linear forwards; }
    #epilogue .roll div { margin: 0 0 22px; }
    #epilogue .roll b { display: block; font-family: var(--head, system-ui); letter-spacing: .1em; color: var(--gold, #e8c66a); font-size: 15px; text-transform: uppercase; }
    #epilogue .roll span { font-size: 16px; opacity: .85; }
    #epilogue .roll .big b { font-size: clamp(28px, 6vw, 48px); }
    #epilogue .bar { position: absolute; bottom: max(18px, env(safe-area-inset-bottom)); display: flex; gap: 10px; }
    #epilogue button { min-height: 44px; padding: 10px 22px; font-weight: 900; cursor: pointer; border-radius: 4px; border: 2px solid var(--edge-hi, #c49a4a);
      background: linear-gradient(180deg, var(--gold-hi, #ffe9a8), var(--gold, #e8c66a) 48%, var(--edge-hi, #c49a4a)); color: #22180a; }
    @keyframes epIn { to { opacity: 1; } }
    @keyframes epRoll { to { transform: translateY(-100%) translateY(-100vh); } }
    @media (prefers-reduced-motion: reduce) { #epilogue .ep p { animation: none; opacity: 1; } #epilogue .roll { animation-duration: 90s; } }`;
  root.appendChild(style);

  const page = document.createElement('div');
  page.className = 'ep';
  page.innerHTML = `<h2>${ep.title}</h2>` + ep.lines.map((l, i) => `<p style="animation-delay:${0.4 + i * 1.4}s">${l}</p>`).join('');
  root.appendChild(page);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const next = document.createElement('button');
  next.textContent = 'Credits ▸';
  bar.appendChild(next);
  root.appendChild(bar);

  const leave = () => { root.remove(); done(); };
  const rollCredits = () => {
    page.remove();
    const roll = document.createElement('div');
    roll.className = 'roll';
    roll.innerHTML = CREDITS.map(([k, v], i) => `<div class="${i === 0 ? 'big' : ''}">${k ? `<b>${k}</b>` : ''}${v ? `<span>${v}</span>` : ''}</div>`).join('')
      + '<div><span>Every mission stays open in the campaign list. Choose differently, and see what else Cinder could have been.</span></div>';
    root.insertBefore(roll, bar);
    roll.addEventListener('animationend', leave);
    next.textContent = 'Back to the campaign';
    next.onclick = leave;
  };
  next.onclick = rollCredits;
  document.body.appendChild(root);
  next.focus();
}
