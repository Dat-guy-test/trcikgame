import { flushSync, mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLang } from '../src/lib/i18n.svelte';
import { settings } from '../src/lib/settings.svelte';
import { setup } from '../src/lib/setup.svelte';
import GameScreen from '../src/screens/GameScreen.svelte';
import Menu from '../src/screens/Menu.svelte';
import Rules from '../src/screens/Rules.svelte';
import Setup from '../src/screens/Setup.svelte';

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
let current: ReturnType<typeof mount> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (C: Component<any>) => {
  document.body.innerHTML = '<div id="t"></div>';
  current = mount(C, { target: document.getElementById('t')! });
  flushSync();
};
afterEach(() => {
  if (current) void unmount(current);
  current = null;
  document.body.innerHTML = '';
});

/** Plays a whole match through the DOM like a (not very clever) human: every control it uses is a real button. */
const seen = new Set<string>();
async function autoplay(maxSteps = 8000): Promise<void> {
  let stalls = 0;
  let round = 0;
  for (let i = 0; i < maxSteps; i++) {
    flushSync();
    if (q('[data-testid=to-menu]')) return;
    const click = (el: HTMLElement | null | undefined): boolean => {
      if (!el || (el as HTMLButtonElement).disabled) return false;
      el.click();
      flushSync();
      return true;
    };
    const phase = q('[data-testid=game]')?.dataset.phase;
    if (phase) seen.add(phase);
    let acted = false;
    if (q('[data-testid=next-round]')) { round++; acted = click(q('[data-testid=next-round]')); }
    else if (q('[data-testid=ready]')) acted = click(q('[data-testid=ready]'));
    else if (phase === 'bidding') {
      // Round 1 of 3: bid Dreier; round 2 of 3: the cheapest contract; otherwise pass / confirm.
      const bid = round % 3 === 1 ? (q('[data-testid="bid-dreier"]') ?? q('[data-testid^="bid-"]')) : round % 3 === 2 ? q('[data-testid^="bid-"]') : null;
      acted = click(bid) || click(q('[data-testid=pass]')) || click(q('[data-testid=confirm]'));
    } else if (phase === 'declare') acted = click(q('[data-testid=declare]'));
    else if (phase === 'contra') acted = click(q('[data-testid=no-contra]'));
    else if (phase === 'kingCall') acted = click(q('[data-testid^="king-"]'));
    else if (phase === 'kingInTalon') acted = click(q('[data-testid=kit-playAlone]'));
    else if (phase === 'take') acted = click(q('[data-testid^="take-pile-"]'));
    else if (phase === 'discard') {
      if (q('[data-testid=discard]') && !(q('[data-testid=discard]') as HTMLButtonElement).disabled) acted = click(q('[data-testid=discard]'));
      else acted = click(q('[data-testid=suggest]'));
    } else if (phase === 'play') {
      const card = q('[data-testid=hand] button[data-playable="true"]');
      if (card) {
        const id = card.dataset.card;
        click(card);
        acted = click(q(`[data-testid=hand] button[data-card="${id}"]`));
      }
    }
    if (acted) stalls = 0;
    else {
      if (++stalls > 800) throw new Error(`stuck in phase ${phase}: ${q('[data-testid=actions]')?.textContent}`);
      await sleep(2);
    }
    await sleep(0);
  }
  throw new Error('match did not finish');
}

describe('menu and settings', () => {
  it('shows the menu and switches language (Polish is loaded on demand)', async () => {
    await loadLang('en');
    render(Menu);
    expect(q('[data-testid=play-local]')!.textContent).toBe('Play locally');
    await loadLang('pl');
    flushSync();
    expect(q('[data-testid=play-local]')!.textContent).toBe('Graj lokalnie');
    await loadLang('en');
  });

  it('the setup screen edits the remembered setup', () => {
    render(Setup);
    const sel = q('[data-testid=players]') as HTMLSelectElement;
    sel.value = '2';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(setup.players).toBe(2);
    expect(document.body.textContent).toContain('2 dummies');
    setup.players = 4;
  });

  it('the rules screen renders docs/rules.md', async () => {
    render(Rules);
    for (let i = 0; i < 50 && !q('[data-testid=rules-text] h1'); i++) await sleep(10);
    expect(q('[data-testid=rules-text] h1')!.textContent).toContain('Tarok');
    expect(qa('[data-testid=rules-text] table').length).toBeGreaterThan(3);
  });
});

describe('a whole match through the DOM', () => {
  const play = async (players: number, rounds: number, timers: boolean) => {
    await loadLang('en');
    Object.assign(setup, { players, winKind: 'rounds', winValue: rounds, failSafeMinutes: null, timers, infiniteContra: false });
    settings.botDelay = 0;
    render(GameScreen);
    if (timers) {
      expect(q('[data-testid=ready]')).not.toBeNull();
      expect(qa('[data-testid=hand] button').length).toBe(0); // card viewing: nothing can be played yet
      expect(qa('[data-testid=hand] [data-card]').length).toBe(12);
    }
    await autoplay();
    expect(q('[data-testid=game]')!.dataset.stage).toBe('finished');
    expect(q('[data-testid=result]')!.textContent).toContain('Match finished');
    const totals = qa('[data-testid=result] tfoot td.total').map((td) => parseInt(td.childNodes[0]?.textContent ?? '0', 10));
    expect(totals.reduce((a, b) => a + b, 0)).toBe(0);
  };

  it('4 players with clocks', async () => {
    await play(4, 6, true);
    for (const p of ['bidding', 'declare', 'take', 'discard', 'play']) expect(seen, p).toContain(p);
    console.log('phases exercised through the DOM:', [...seen].join(', '));
  });
  it('3 players + dummy', () => play(3, 3, false));
  it('2 players + 2 dummies', () => play(2, 4, false));
  it('5 players (a spectator rotates in)', () => play(5, 5, false));
});
