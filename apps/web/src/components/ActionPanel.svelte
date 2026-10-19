<!-- Everything the human can do right now, derived from `view.legalActions`. No rules logic lives here. -->
<script lang="ts">
  import {
    CONTRACTS, bidValue, isValidDiscardView, isValidTakeView, type Action, type Bid, type BonusKind, type ContractId, type ContraTarget,
  } from '@tarok/engine';
  import { SUIT_SYMBOL, suitName } from '../lib/cardUi';
  import type { Game } from '../lib/game.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import Card from './Card.svelte';
  import Clock from './Clock.svelte';

  let { game, selected = $bindable([]) }: { game: Game; selected: number[] } = $props();

  const v = $derived(game.view);
  const r = $derived(v.round);
  const legal = $derived(v.legalActions);
  const mine = $derived(legal.length > 0);
  const contractName = (c: ContractId) => t(`contract.${c}` as Key);

  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  const bids = $derived(legal.flatMap((a) => (a.type === 'bid' ? [a.bid] : [])));

  /** Bids grouped by contract: the normal bid, Slovenian-method bids (fewer cards), Besser Rufer bonus choices. */
  const bidGroups = $derived.by(() => {
    const byContract = new Map<ContractId, Bid[]>();
    for (const b of bids) byContract.set(b.contract, [...(byContract.get(b.contract) ?? []), b]);
    return [...byContract.entries()]
      .map(([contract, list]) => {
        const def = CONTRACTS[contract];
        return {
          contract,
          needsBonus: def.needsBonusDeclaration,
          main: list.filter((b) => b.take === def.take),
          slovenian: list.filter((b) => b.take < def.take && !def.needsBonusDeclaration),
          value: Math.min(...list.map(bidValue)),
        };
      })
      .sort((a, b) => a.value - b.value);
  });
  const bidder = $derived(r.bidder === null ? '' : game.nameOf(v.table[r.bidder]!));

  // Declarations
  let chosen = $state<BonusKind[]>([]);
  let valat = $state(false);
  const bonusChoices = $derived(legal.flatMap((a) => (a.type === 'declare' && a.bonuses.length === 1 ? [a.bonuses[0]!] : [])));
  const valatChoice = $derived(legal.some((a) => a.type === 'declare' && a.valat));
  const declaring = $derived(r.phase === 'declare');
  $effect(() => {
    if (!declaring) {
      chosen = [];
      valat = false;
    }
  });
  const toggle = (b: BonusKind) => (chosen = chosen.includes(b) ? chosen.filter((x) => x !== b) : [...chosen, b]);

  // Contra
  const LEVEL_KEYS: Key[] = ['contra.0', 'contra.1', 'contra.2', 'contra.3'];
  const contraTargets = $derived(legal.flatMap((a) => (a.type === 'contra' ? [a.target] : [])));
  const targetName = (target: ContraTarget) =>
    target === 'contract' ? t('contra.contract') : target === 'valat' ? t('bonus.valat') : t(`bonus.${target}` as Key);
  const levelName = (target: ContraTarget) => {
    const lv = r.contraLevels[target] ?? 0;
    return `${lv < 4 ? t(LEVEL_KEYS[lv]!) : t('contra.more')} ×${2 ** (lv + 1)}`;
  };

  // Talon
  const piles = $derived(r.talon.piles ?? []);
  const toggleCard = (c: number) => (selected = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const takeOk = $derived(isValidTakeView(r, selected));
  const discardOk = $derived(isValidDiscardView(r, selected));
  const suggestion = $derived(legal.find((a) => a.type === 'discard'));
  const giveUpCost = $derived(r.contract ? CONTRACTS[r.contract].giveUpPerOpponent * 3 : 0);

  const send = (a: Action) => {
    selected = [];
    game.act(a);
  };
  const acting = $derived(v.timers.actingParticipant === v.participant);
  const waitingFor = $derived.by(() => {
    const seat = r.expectedActor;
    return seat === null ? '' : game.nameOf(v.table[seat]!);
  });
</script>

<div class="panel" data-testid="actions">
  <div class="status">
    {#if v.stage === 'viewing'}
      <span>{t('status.viewing')}</span>
      <Clock ms={v.timers.viewMsLeft} />
    {:else if v.stage === 'playing' && !mine}
      <span>{t('status.waiting', { name: waitingFor })}</span>
    {:else if mine}
      <strong>{t('status.yourTurn')}</strong>
      <Clock ms={v.timers.decisionMsLeft} />
      <Clock ms={v.timers.graceMsLeft} label={t('clock.grace')} />
    {/if}
  </div>

  {#if v.stage === 'viewing'}
    {#if v.seat !== null}
      <button class="btn primary" data-testid="ready" disabled={v.ready[v.participant]} onclick={game.ready}>{t('action.ready')}</button>
    {/if}
  {:else if v.stage === 'playing' && mine}
    {#if r.phase === 'bidding'}
      <p class="info">
        {#if r.currentBid}{t('bid.current', { contract: contractName(r.currentBid.contract), who: bidder })}{:else}{t('bid.none')}{/if}
        {#if r.awaitingConfirm}<br />{t('bid.confirmHint')}{/if}
      </p>
      <div class="row">
        {#if has('pass')}<button class="btn" data-testid="pass" onclick={() => send({ type: 'pass' })}>{t('action.pass')}</button>{/if}
        {#if has('confirm')}<button class="btn primary" data-testid="confirm" onclick={() => send({ type: 'confirm' })}>{t('action.confirm')}</button>{/if}
      </div>
      <div class="bids">
        {#each bidGroups as g (g.contract)}
          <div class="bidgroup">
            {#if g.needsBonus}
              <span class="lbl">{contractName(g.contract)} — {t('bid.chooseBonus')}</span>
              <div class="row wrap">
                {#each g.main as b (b.bonuses[0])}
                  <button class="btn small" data-testid="bid-{g.contract}-{b.bonuses[0]}" onclick={() => send({ type: 'bid', bid: b })}>
                    {t(`bonus.${b.bonuses[0]!}` as Key)} <em>{bidValue(b)}</em>
                  </button>
                {/each}
              </div>
            {:else}
              <div class="row wrap">
                {#each g.main as b (b.take)}
                  <button class="btn" data-testid="bid-{g.contract}" onclick={() => send({ type: 'bid', bid: b })}>
                    {contractName(g.contract)} <em>{bidValue(b)}</em>
                  </button>
                {/each}
                {#each g.slovenian as b (b.take)}
                  <button class="btn small" data-testid="bid-{g.contract}-take{b.take}" onclick={() => send({ type: 'bid', bid: b })}>
                    {contractName(g.contract)} <em>{t('bid.take', { n: b.take })}</em>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else if r.phase === 'declare'}
      <p class="info">{t('declare.info')}</p>
      <div class="row wrap">
        {#each bonusChoices as b (b)}
          <button class="btn small" class:on={chosen.includes(b)} aria-pressed={chosen.includes(b)} data-testid="bonus-{b}" onclick={() => toggle(b)}>{t(`bonus.${b}` as Key)}</button>
        {/each}
        {#if valatChoice}
          <button class="btn small" class:on={valat} aria-pressed={valat} data-testid="bonus-valat" onclick={() => (valat = !valat)}>{t('bonus.valat')}</button>
        {/if}
      </div>
      <button class="btn primary" data-testid="declare" onclick={() => send({ type: 'declare', bonuses: chosen, valat })}>
        {chosen.length === 0 && !valat ? t('declare.none') : t('declare.confirm')}
      </button>
    {:else if r.phase === 'contra'}
      <p class="info">{t('contra.info', { contract: r.contract ? contractName(r.contract) : '' })}</p>
      <div class="row wrap">
        <button class="btn" data-testid="no-contra" onclick={() => send({ type: 'noContra' })}>{t('contra.none')}</button>
        {#each contraTargets as target (target)}
          <button class="btn primary" data-testid="contra-{target}" onclick={() => send({ type: 'contra', target })}>
            {targetName(target)}: {levelName(target)}
          </button>
        {/each}
      </div>
    {:else if r.phase === 'kingCall'}
      <p class="info">{t('king.info')}</p>
      <div class="row wrap">
        {#each legal as a (JSON.stringify(a))}
          {#if a.type === 'callKing'}
            <button class="btn suit-{a.suit}" data-testid="king-{a.suit}" onclick={() => send(a)}>
              <span class="sym">{SUIT_SYMBOL[a.suit]}</span> {suitName(a.suit)}
            </button>
          {/if}
        {/each}
      </div>
    {:else if r.phase === 'kingInTalon'}
      <p class="info">{t('kingTalon.info', { suit: r.calledKing ? suitName(r.calledKing) : '' })}</p>
      <div class="piles">
        {#each piles as pile, i (i)}<div class="pile">{#each pile as c (c)}<Card id={c} size="sm" />{/each}</div>{/each}
      </div>
      <div class="row wrap">
        <button class="btn" data-testid="kit-giveUp" onclick={() => send({ type: 'kingInTalon', choice: 'giveUp' })}>{t('kingTalon.giveUp', { n: giveUpCost })}</button>
        <button class="btn primary" data-testid="kit-playAlone" onclick={() => send({ type: 'kingInTalon', choice: 'playAlone' })}>{t('kingTalon.alone')}</button>
        <button class="btn" data-testid="kit-switchToDreier" onclick={() => send({ type: 'kingInTalon', choice: 'switchToDreier' })}>{t('kingTalon.dreier')}</button>
      </div>
    {:else if r.phase === 'take'}
      <p class="info">{t('take.info', { n: r.take })}</p>
      <div class="piles">
        {#each piles as pile, i (i)}
          <div class="pile">
            {#each pile as c (c)}<Card id={c} size="md" selected={selected.includes(c)} onclick={() => toggleCard(c)} />{/each}
            {#if isValidTakeView(r, pile)}
              <button class="btn small" data-testid="take-pile-{i}" onclick={() => send({ type: 'take', cards: [...pile] })}>{t('take.pile', { n: i + 1 })}</button>
            {/if}
          </div>
        {/each}
      </div>
      <button class="btn primary" data-testid="take" disabled={!takeOk} onclick={() => send({ type: 'take', cards: [...selected] })}>
        {t('take.selected', { n: selected.length, total: r.take })}
      </button>
    {:else if r.phase === 'discard'}
      <p class="info">{t('discard.info', { n: r.take })}</p>
      <div class="row wrap">
        {#if suggestion && suggestion.type === 'discard'}
          <button class="btn small" data-testid="suggest" onclick={() => (selected = [...suggestion.cards])}>{t('discard.suggest')}</button>
        {/if}
        <button class="btn primary" data-testid="discard" disabled={!discardOk} onclick={() => send({ type: 'discard', cards: [...selected] })}>
          {t('discard.confirm', { n: selected.length, total: r.take })}
        </button>
      </div>
    {:else if r.phase === 'play'}
      <p class="info">{t('play.info')}</p>
      <button class="btn primary" data-testid="play-selected" disabled={selected.length !== 1} onclick={() => send({ type: 'play', card: selected[0]! })}>
        {t('action.play')}
      </button>
    {/if}
  {/if}
</div>

<style>
  .panel { display: grid; gap: 0.5rem; padding: 0.6rem 0.8rem; background: #0003; border-radius: 0.8rem; }
  .status { display: flex; gap: 0.6rem; align-items: center; justify-content: space-between; min-height: 1.6rem; font-size: 0.9rem; }
  .info { margin: 0; font-size: 0.85rem; opacity: 0.9; }
  .row { display: flex; gap: 0.5rem; }
  .wrap { flex-wrap: wrap; }
  .bids { display: grid; gap: 0.5rem; max-height: 38dvh; overflow-y: auto; }
  .bidgroup { display: grid; gap: 0.25rem; }
  .lbl { font-size: 0.75rem; opacity: 0.8; }
  em { font-style: normal; padding: 0 0.45em; margin-left: 0.3em; border-radius: 1em; background: #0004; font-size: 0.8em; }
  .on { background: var(--accent); color: #1b1b1f; }
  .piles { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; }
  .pile { display: flex; gap: 0.25rem; align-items: center; flex-wrap: wrap; justify-content: center; padding: 0.3rem; border-radius: 0.5rem; background: #0002; }
  .sym { font-size: 1.1em; }
  .suit-hearts .sym, .suit-diamonds .sym { color: #ff8c82; }
</style>
