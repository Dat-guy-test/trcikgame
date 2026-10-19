<script lang="ts">
  import type { HostView } from '@tarok/engine';
  import { t, type Key } from '../lib/i18n.svelte';

  let { view, names }: { view: HostView; names: readonly string[] } = $props();

  const placeOf = $derived(new Map(view.placings.map((p) => [p.seat, p.place])));
  const status = (p: number): string =>
    view.participantKinds[p] === 'dummy' ? t('role.dummy')
    : view.queue.includes(p) ? t('score.spectating')
    : view.table.includes(p) ? t('score.playing') : '';
  /** Score change of participant `p` in a finished round. */
  const deltaOf = (r: HostView['rounds'][number], p: number): number | null => {
    const seat = r.table.indexOf(p);
    return seat < 0 ? null : r.deltas[seat]!;
  };
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
</script>

<div class="board" data-testid="scoreboard">
  <table>
    <thead>
      <tr>
        <th>#</th>
        {#each names as n, p (p)}
          <th class:me={p === view.participant}>{n}<small>{status(p)}</small></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each view.rounds as r (r.index)}
        <tr>
          <th title={t(`contract.${r.contract}` as Key)}>{r.index + 1}{#if r.kind === 'reshuffle'}↺{/if}</th>
          {#each names as _, p (p)}
            {@const d = deltaOf(r, p)}
            <td class:pos={d !== null && d > 0} class:neg={d !== null && d < 0}>{d === null ? '–' : sign(d)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <th>{t('score.total')}</th>
        {#each names as _, p (p)}
          <td class="total">{view.standings[p]}{#if view.participantKinds[p] === 'player'}<small>{placeOf.get(p)}.</small>{/if}</td>
        {/each}
      </tr>
    </tfoot>
  </table>
</div>

<style>
  .board { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; font-size: 0.85rem; }
  th, td { padding: 0.3rem 0.45rem; text-align: center; border-bottom: 1px solid #fff2; white-space: nowrap; }
  th small, td small { display: block; font-weight: 400; font-size: 0.65rem; opacity: 0.75; }
  th.me { color: var(--accent); }
  .pos { color: #8fe0a2; } .neg { color: #ff9a8f; }
  .total { font-weight: 700; border-top: 2px solid #fff5; }
  tfoot th { border-top: 2px solid #fff5; }
</style>
