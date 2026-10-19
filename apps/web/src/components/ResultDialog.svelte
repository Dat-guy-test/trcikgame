<script lang="ts">
  import type { Game } from '../lib/game.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
  import Scoreboard from './Scoreboard.svelte';

  let { game }: { game: Game } = $props();

  const v = $derived(game.view);
  const res = $derived(v.round.result);
  const last = $derived(v.rounds[v.rounds.length - 1]);
  const nameAt = (seat: number | null) => (seat === null ? '' : game.nameOf(v.table[seat]!));

  const headline = $derived.by(() => {
    if (!res) return '';
    const who = nameAt(res.declarer);
    const contract = t(`contract.${res.contract}` as Key);
    switch (res.kind) {
      case 'played':
        return t(res.contractWon ? 'result.won' : 'result.lost', { who, contract });
      case 'gaveUp': return t('result.gaveUp', { who, contract });
      case 'forfeit': return t('result.forfeit', { who, contract });
      case 'reshuffle': return t('result.reshuffle', { who });
      default: return t('result.trischaken');
    }
  });
</script>

<div class="backdrop" role="dialog" aria-modal="true" aria-label={t('result.title')} data-testid="result">
  <div class="dialog">
    <h2>{v.finished ? t('result.final') : t('result.title', { n: (last?.index ?? 0) + 1 })}</h2>
    <p class="headline">{headline}</p>

    {#if res?.counted}
      <p>{t('result.counted', { a: res.counted.declarer, b: res.counted.defender })}</p>
    {/if}
    {#if res && res.bonuses.length > 0}
      <ul class="bonuses">
        {#each res.bonuses as b, i (i)}
          <li>
            {t(`bonus.${b.kind}` as Key)} — {t(b.side === 'declarer' ? 'result.declarerSide' : 'result.defenderSide')},
            {t(b.outcome === 'earned' ? 'result.earned' : 'result.lostBonus')}{b.announced ? ` (${t('result.announced')})` : ''}
          </li>
        {/each}
      </ul>
    {/if}
    {#if res?.valat?.achievedBy || res?.valat?.announced}
      <p>{t('bonus.valat')}: {res.valat?.achievedBy ? t(res.valat.achievedBy === 'declarer' ? 'result.declarerSide' : 'result.defenderSide') : t('result.failed')}</p>
    {/if}
    {#if res?.trischaken}
      <p>{t('result.trischakenCounts')}: {res.trischaken.counts.map((c, s) => `${nameAt(s)} ${c}`).join(', ')}</p>
    {/if}

    <Scoreboard view={v} names={game.names} />

    {#if v.winners.length > 0}
      <p class="winner">{t('result.winners', { names: v.winners.map((p) => game.nameOf(p)).join(', ') })}</p>
    {/if}

    <div class="row">
      {#if v.finished}
        <button class="btn primary" data-testid="to-menu" onclick={() => go('menu')}>{t('action.menu')}</button>
        <button class="btn" data-testid="again" onclick={() => location.reload()}>{t('action.again')}</button>
      {:else}
        <button class="btn primary" data-testid="next-round" onclick={game.next}>{t('action.nextRound')}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom)); background: #000a; }
  .dialog { width: min(34rem, 100%); max-height: 100%; overflow-y: auto; padding: 1rem; border-radius: 1rem; background: var(--felt-dark); border: 1px solid #fff3; display: grid; gap: 0.6rem; }
  h2 { margin: 0; font-size: 1.15rem; }
  p, ul { margin: 0; font-size: 0.9rem; }
  .headline { font-size: 1.05rem; font-weight: 600; }
  .winner { color: var(--accent); font-weight: 600; }
  .bonuses { padding-left: 1.1rem; }
  .row { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
