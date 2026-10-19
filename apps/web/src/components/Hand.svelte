<script lang="ts">
  import { sortHand } from '../lib/cardUi';
  import Card from './Card.svelte';

  let {
    cards, playable = null, selected = [], size = 'md', onpick,
  }: {
    cards: readonly number[];
    /** Cards that may be picked; `null` = all. Others are dimmed. */
    playable?: ReadonlySet<number> | null;
    selected?: readonly number[];
    size?: 'sm' | 'md' | 'lg';
    onpick?: (card: number) => void;
  } = $props();

  const sorted = $derived(sortHand(cards));
</script>

<div class="hand {size}" data-testid="hand">
  {#each sorted as c (c)}
    {@const ok = playable === null || playable.has(c)}
    <div class="slot">
      <Card id={c} {size} selected={selected.includes(c)} playable={ok} onclick={onpick && ok ? () => onpick(c) : undefined} />
    </div>
  {/each}
</div>

<style>
  .hand { display: flex; padding: 1.1rem 0.8rem 0.4rem; overflow-x: auto; scrollbar-width: none; min-height: 5.6rem; }
  .hand.sm { padding-top: 0.2rem; min-height: 0; }
  .hand::-webkit-scrollbar { display: none; }
  /* Overlap so 12-15 cards fit on a phone; the strip scrolls if they still do not. */
  .slot { margin-left: -1.45rem; flex: none; }
  .hand.sm .slot { margin-left: -1.2rem; }
  @media (min-width: 900px) { .slot { margin-left: -0.9rem; } .hand.sm .slot { margin-left: -0.8rem; } }
  .hand:not(.sm) { justify-content: safe center; }
  .hand:not(.sm) .slot:first-child { margin-left: 0; }
</style>
