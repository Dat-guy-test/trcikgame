<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { CONTRACTS, discardRulesView } from '@tarok/engine';
  import ActionPanel from '../components/ActionPanel.svelte';
  import Clock from '../components/Clock.svelte';
  import Hand from '../components/Hand.svelte';
  import ResultDialog from '../components/ResultDialog.svelte';
  import Scoreboard from '../components/Scoreboard.svelte';
  import Seat from '../components/Seat.svelte';
  import TalonDisplay from '../components/TalonDisplay.svelte';
  import TrickArea from '../components/TrickArea.svelte';
  import { suitName } from '../lib/cardUi';
  import { Game } from '../lib/game.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
  import { settings } from '../lib/settings.svelte';
  import { setup } from '../lib/setup.svelte';

  const game = new Game($state.snapshot(setup), {
    you: settings.name.trim() || t('you'),
    bot: (n) => t('bot.name', { n }),
    dummy: t('role.dummy'),
  });
  onMount(() => {
    game.start();
    return () => game.destroy();
  });

  const v = $derived(game.view);
  const r = $derived(v.round);
  const mySeat = $derived(v.seat ?? 0);
  const mine = $derived(v.legalActions.length > 0);
  const playSeat = $derived((r.leader + r.trick.length) % 4);
  /** The hand at the bottom: mine, or a dummy I am controlling for this card. */
  const bottomSeat = $derived(r.phase === 'play' && mine ? playSeat : mySeat);
  const bottomCards = $derived(v.seat === null ? [] : (r.hands[bottomSeat] ?? []));
  const activeSeat = $derived(r.phase === 'play' ? playSeat : r.expectedActor);

  /**
   * Cards the human has picked (a card to play, cards to discard or take). It survives clock ticks and bot moves and is only
   * cleared when the situation really changes (key below) or when the player taps away from the cards and buttons.
   * The key is a string so that rebuilding the view every tick does not count as a change.
   */
  let selected = $state<number[]>([]);
  const situation = $derived(`${r.phase}|${v.stage}|${r.tricks.length}|${r.trick.length}|${r.expectedActor}`);
  $effect(() => {
    void situation;
    untrack(() => (selected = []));
  });
  function tapAway(e: MouseEvent): void {
    if (selected.length > 0 && !(e.target as Element).closest('button, input, select, a, [data-keep]')) selected = [];
  }

  const playable = $derived.by(() => {
    if (!mine) return null;
    if (r.phase === 'play') return new Set(v.legalActions.flatMap((a) => (a.type === 'play' ? [a.card] : [])));
    if (r.phase === 'discard') return new Set(discardRulesView(r).eligible);
    return null;
  });
  const interactive = $derived(mine && (r.phase === 'play' || r.phase === 'discard'));

  function pick(card: number): void {
    if (r.phase === 'play') {
      if (selected[0] === card) {
        selected = [];
        game.act({ type: 'play', card });
      } else selected = [card];
    } else if (r.phase === 'discard') {
      selected = selected.includes(card) ? selected.filter((c) => c !== card) : selected.length < r.take ? [...selected, card] : selected;
    }
  }

  const shownTrick = $derived(game.hold?.plays ?? r.trick);
  const tricksWon = (seat: number) => r.tricks.filter((x) => x.winner === seat).length;
  const seatAt = (rel: number) => (mySeat + rel) % 4;

  const def = $derived(r.contract ? CONTRACTS[r.contract] : null);
  const contraSummary = $derived(
    Object.entries(r.contraLevels).filter(([, lv]) => lv > 0).map(([k, lv]) => `${k === 'contract' ? '' : `${t(`bonus.${k}` as Key)} `}×${2 ** lv}`).join(', '),
  );
  const roundsTotal = $derived(game.host.match.config.winCondition.kind === 'rounds' ? game.host.match.config.winCondition.rounds : null);

  let showScore = $state(false);
  let confirmLeave = $state(false);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="game" data-testid="game" data-stage={v.stage} data-phase={r.phase} onclick={tapAway}>
  <header class="top">
    <div class="round">
      {t('game.round', { n: v.roundsPlayed + 1 })}{#if roundsTotal !== null}<small> / {roundsTotal}</small>{/if}
      <Clock ms={v.timers.matchMsLeft} label={t('clock.match')} warn={60_000} />
    </div>
    <div class="contract" data-testid="contract">
      {#if def}
        <strong>{t(`contract.${def.id}` as Key)}</strong>
        {#if r.declarer !== null}<span>{game.nameOf(v.table[r.declarer])}</span>{/if}
        {#if r.calledKing}<span>{t('game.king', { suit: suitName(r.calledKing) })}</span>{/if}
        {#if r.declaredBonuses.length > 0}<span>{r.declaredBonuses.map((b) => t(`bonus.${b}` as Key)).join(', ')}</span>{/if}
        {#if r.declaredValat}<span>{t('bonus.valat')}</span>{/if}
        {#if contraSummary}<span class="contra">{contraSummary}</span>{/if}
      {:else}
        <span>{t('game.bidding')}</span>
      {/if}
    </div>
    <div class="buttons">
      <button class="btn small" data-testid="scores" onclick={() => (showScore = !showScore)} aria-expanded={showScore}>{t('game.scores')}</button>
      <button class="btn small" data-testid="leave" onclick={() => (confirmLeave = true)}>{t('action.menu')}</button>
    </div>
  </header>

  {#if v.endAfterRound}<p class="banner">{t('game.finishing')}</p>{/if}
  {#if v.seat === null}<p class="banner">{t('game.spectating')}</p>{/if}

  <main class="table">
    {#each [2, 1, 3] as rel (rel)}
      {@const s = seatAt(rel)}
      <div class="area a{rel}">
        <Seat seat={s} view={v} name={game.nameOf(v.table[s])} active={activeSeat === s} tricksWon={tricksWon(s)} hideHand={s === bottomSeat} />
      </div>
    {/each}
    <div class="area center">
      {#if r.talon.revealed && r.talon.piles}
        <TalonDisplay piles={r.talon.piles} taken={r.talonTaken} open={r.phase !== 'play'} />
      {/if}
      <TrickArea plays={shownTrick} {mySeat} winner={game.hold?.winner ?? null} />
    </div>
  </main>

  <footer class="bottom">
    <ActionPanel {game} bind:selected />
    {#if v.seat !== null}
      <div class="me">
        <Seat seat={mySeat} view={v} name={game.nameOf(v.participant)} active={activeSeat === mySeat} tricksWon={tricksWon(mySeat)} hideHand={mySeat === bottomSeat} />
        {#if bottomSeat !== mySeat}<p class="control">{t('game.controlling', { name: game.nameOf(v.table[bottomSeat]) })}</p>{/if}
      </div>
      <Hand cards={bottomCards} {playable} {selected} onpick={interactive ? pick : undefined} />
    {/if}
  </footer>

  {#if showScore}
    <div class="sheet" role="dialog" aria-label={t('game.scores')}>
      <Scoreboard view={v} names={game.names} />
      <button class="btn" onclick={() => (showScore = false)}>{t('action.close')}</button>
    </div>
  {/if}

  {#if confirmLeave}
    <div class="sheet" role="alertdialog" aria-label={t('game.leave')}>
      <p>{t('game.leave')}</p>
      <div class="row">
        <button class="btn" onclick={() => (confirmLeave = false)}>{t('action.cancel')}</button>
        <button class="btn primary" data-testid="leave-yes" onclick={() => go('menu')}>{t('action.menu')}</button>
      </div>
    </div>
  {/if}

  {#if (v.stage === 'betweenRounds' || v.stage === 'finished') && !game.hold}
    <ResultDialog {game} />
  {/if}
</div>

<style>
  .game { display: grid; grid-template-rows: auto auto 1fr auto; height: 100dvh; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  .top { display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; padding: 0.4rem 0.6rem; background: #0003; font-size: 0.85rem; }
  .round { display: grid; gap: 0.15rem; }
  .contract { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; justify-content: center; text-align: center; }
  .contract span { opacity: 0.85; }
  .contra { color: var(--accent); }
  .buttons { display: flex; gap: 0.35rem; }
  .banner { margin: 0; padding: 0.25rem; text-align: center; background: var(--accent); color: #1b1b1f; font-size: 0.8rem; }
  .table { display: grid; grid-template-columns: minmax(4.5rem, 1fr) minmax(0, 2.2fr) minmax(4.5rem, 1fr); grid-template-areas: 'top top top' 'left center right'; gap: 0.4rem; padding: 0.5rem; min-height: 0; overflow-y: auto; align-content: start; }
  .a2 { grid-area: top; } .a1 { grid-area: left; } .a3 { grid-area: right; } .center { grid-area: center; display: grid; gap: 0.5rem; place-items: center; align-content: start; }
  .bottom { display: grid; gap: 0.35rem; padding: 0.4rem 0.4rem 0.2rem; background: linear-gradient(transparent, #0005); }
  .me { display: grid; gap: 0.2rem; }
  .control { margin: 0; text-align: center; font-size: 0.8rem; color: var(--accent); }
  .sheet { position: fixed; z-index: 15; left: 0.6rem; right: 0.6rem; top: 20dvh; max-width: 36rem; margin-inline: auto; padding: 1rem; border-radius: 1rem; background: var(--felt-dark); border: 1px solid #fff3; display: grid; gap: 0.7rem; box-shadow: 0 10px 40px #000a; max-height: 70dvh; overflow-y: auto; }
  .row { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
