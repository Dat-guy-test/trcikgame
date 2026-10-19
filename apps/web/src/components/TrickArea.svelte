<script lang="ts">
  import type { Play } from '@tarok/engine';
  import Card from './Card.svelte';

  let { plays, mySeat, winner = null }: { plays: readonly Play[]; mySeat: number; winner?: number | null } = $props();

  /** 0 = bottom (me), 1 = left, 2 = top, 3 = right. */
  const rel = (seat: number) => (seat - mySeat + 4) % 4;
  const bySlot = $derived([0, 1, 2, 3].map((r) => plays.find((p) => rel(p.player) === r) ?? null));
</script>

<div class="trick" data-testid="trick">
  {#each bySlot as p, r (r)}
    <div class="slot s{r}" class:won={p !== null && winner === p.player}>
      {#if p}<Card id={p.card} size="md" />{/if}
    </div>
  {/each}
</div>

<style>
  .trick { display: grid; grid-template: 1fr 1fr 1fr / 1fr 1fr 1fr; place-items: center; width: min(100%, 14rem); aspect-ratio: 1; margin: auto; }
  .slot { display: grid; place-items: center; }
  .s0 { grid-area: 3 / 2; } .s1 { grid-area: 2 / 1; } .s2 { grid-area: 1 / 2; } .s3 { grid-area: 2 / 3; }
  .slot :global(.card) { --w: 3rem; }
  .won :global(.card) { box-shadow: 0 0 0 3px var(--accent), 0 2px 6px #0007; }
</style>
