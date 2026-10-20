<script lang="ts">
  import type { HostView } from '@tarok/engine';
  import { t } from '../lib/i18n.svelte';
  import Clock from './Clock.svelte';
  import Hand from './Hand.svelte';

  let {
    seat, view, name, active = false, tricksWon = 0, hideHand = false, playable = null, selected = [], onpick,
  }: {
    seat: number;
    view: HostView;
    name: string;
    active?: boolean;
    tricksWon?: number;
    /** The hand is shown elsewhere (bottom of the screen). */
    hideHand?: boolean;
    /** Cards of this seat the human may play (a controlled dummy). `null` = not interactive. */
    playable?: ReadonlySet<number> | null;
    selected?: readonly number[];
    onpick?: (card: number) => void;
  } = $props();

  const r = $derived(view.round);
  const participant = $derived(view.table[seat]!);
  const isDummy = $derived(view.participantKinds[participant] === 'dummy');
  const open = $derived(r.hands[seat]);
  const time = $derived(view.timers.banksMs[participant] ?? null);
  const roles = $derived.by(() => {
    const out: string[] = [];
    if (r.declarer === seat) out.push(t('role.declarer'));
    if (r.partner === seat) out.push(t('role.partner'));
    if (r.startingPlayer === seat && r.phase === 'bidding') out.push(t('role.starter'));
    if (isDummy) out.push(t('role.dummy'));
    return out;
  });
</script>

<section class="seat" class:active data-testid="seat-{seat}">
  <header>
    <strong>{name}</strong>
    {#each roles as role (role)}<span class="badge">{role}</span>{/each}
  </header>
  <div class="meta">
    <span>{t('seat.cards', { n: r.handSizes[seat] ?? 0 })}</span>
    {#if tricksWon > 0}<span>{t('seat.tricks', { n: tricksWon })}</span>{/if}
    {#if !isDummy}<Clock ms={time} warn={60_000} label={t('clock.time')} />{/if}
  </div>
  {#if open && open.length > 0 && !hideHand}
    <Hand cards={open} size="sm" {playable} {selected} {onpick} />
  {/if}
</section>

<style>
  .seat { padding: 0.35rem 0.5rem; border-radius: 0.6rem; background: #0002; min-width: 0; text-align: center; border: 2px solid transparent; }
  .seat.active { border-color: var(--accent); background: #0004; }
  header { display: flex; flex-wrap: wrap; gap: 0.25rem; justify-content: center; align-items: center; font-size: 0.85rem; }
  strong { overflow-wrap: anywhere; }
  .badge { font-size: 0.65rem; padding: 0 0.4em; border-radius: 0.5em; background: var(--accent); color: #1b1b1f; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; font-size: 0.72rem; opacity: 0.9; margin-top: 0.15rem; }
</style>
