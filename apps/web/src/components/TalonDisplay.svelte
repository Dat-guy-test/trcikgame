<!-- The revealed Talon, visible to every player: which cards the declarer took and which went to the defenders. -->
<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import Card from './Card.svelte';

  let { piles, taken, open = true }: { piles: readonly (readonly number[])[]; taken: readonly number[] | null; open?: boolean } = $props();
</script>

<details class="talon" {open} data-testid="talon" data-keep>
  <summary>{t('talon.title')}{#if taken !== null}<small> · {taken.length > 0 ? t('talon.taken') : t('talon.left')}</small>{/if}</summary>
  <div class="piles">
    {#each piles as pile, i (i)}
      <div class="pile">
        {#each pile as c (c)}
          {@const isTaken = taken?.includes(c) ?? false}
          <span class="c" class:taken={isTaken} class:left={taken !== null && !isTaken} data-taken={isTaken}><Card id={c} size="sm" /></span>
        {/each}
      </div>
    {/each}
  </div>
</details>

<style>
  .talon { text-align: center; font-size: 0.8rem; }
  summary { cursor: pointer; padding: 0.25rem 0.5rem; list-style: none; opacity: 0.9; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸ '; } details[open] summary::before { content: '▾ '; }
  small { opacity: 0.8; }
  .piles { display: grid; gap: 0.3rem; justify-items: center; }
  .pile { display: flex; gap: 0.2rem; }
  .c { display: inline-flex; border-radius: 0.35rem; }
  .c.taken { box-shadow: 0 0 0 2px var(--accent); }
  .c.left { opacity: 0.55; }
</style>
