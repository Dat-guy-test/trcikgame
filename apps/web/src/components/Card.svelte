<!--
  Placeholder card face (CSS + text, no images). This is the single place to swap in real artwork:
  keep the props, replace the markup. Colours come from CSS variables so themes and colour-blind mode keep working.
-->
<script lang="ts">
  import { cardFace, cardName } from '../lib/cardUi';

  let {
    id, size = 'md', selected = false, playable = true, back = false, onclick,
  }: {
    id: number;
    size?: 'sm' | 'md' | 'lg';
    selected?: boolean;
    /** Dimmed when false. */
    playable?: boolean;
    back?: boolean;
    onclick?: () => void;
  } = $props();

  const f = $derived(cardFace(id));
  const cls = $derived(
    `card ${size} ${f.tarock ? 'tarock' : `suit ${f.suit}`} ${f.special ?? ''} ${selected ? 'selected' : ''} ${playable ? '' : 'dim'} ${back ? 'back' : ''}`,
  );
</script>

{#if onclick}
  <button type="button" class={cls} {onclick} aria-label={cardName(id)} aria-pressed={selected} data-card={id} data-playable={playable}>
    {@render face()}
  </button>
{:else}
  <div class={cls} role="img" aria-label={back ? '' : cardName(id)} data-card={id}>
    {@render face()}
  </div>
{/if}

{#snippet face()}
  {#if !back}
    <span class="corner">{f.label}{#if !f.tarock}<i>{f.symbol}</i>{/if}</span>
    <span class="centre">{f.symbol}</span>
    <span class="pts">{f.points}</span>
  {/if}
{/snippet}

<style>
  .card {
    --w: 3.6rem;
    position: relative;
    flex: none;
    width: var(--w);
    aspect-ratio: 5 / 7.4;
    padding: 0;
    border: 1px solid #00000040;
    border-radius: 0.4rem;
    background: var(--card-face);
    color: var(--ink);
    font: 600 0.8rem/1 var(--font);
    display: block;
    text-align: left;
    box-shadow: 0 1px 2px #0005;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .card.sm { --w: 2.3rem; font-size: 0.6rem; border-radius: 0.3rem; }
  .card.lg { --w: 4.6rem; font-size: 1rem; }
  .corner { position: absolute; top: 0.28em; left: 0.34em; display: flex; flex-direction: column; align-items: center; line-height: 1.05; }
  .corner i { font-style: normal; font-size: 0.9em; }
  .centre { position: absolute; inset: 0; display: grid; place-items: center; font-size: 2.2em; opacity: 0.85; }
  .sm .centre { font-size: 1.5em; }
  .pts { display: none; position: absolute; right: 0.3em; bottom: 0.2em; font-size: 0.7em; opacity: 0.7; }
  :global([data-points='1']) .pts { display: block; }

  .spades, .clubs, .diamonds, .hearts { color: var(--suit-black); }
  .suit.spades { color: var(--suit-spades); }
  .suit.clubs { color: var(--suit-clubs); }
  .suit.diamonds { color: var(--suit-diamonds); }
  .suit.hearts { color: var(--suit-hearts); }
  .tarock { color: var(--tarock); background: var(--card-tarock); }
  .tarock.pagat, .tarock.mond, .tarock.szkis { border-color: var(--accent); border-width: 2px; }

  .back { background: repeating-linear-gradient(45deg, var(--card-back-a) 0 6px, var(--card-back-b) 6px 12px); border-color: #fff6; }

  button.card { cursor: pointer; touch-action: manipulation; }
  button.card:hover:not(.dim) { transform: translateY(-3px); }
  button.card.selected { transform: translateY(-0.9rem); box-shadow: 0 0 0 2px var(--accent), 0 4px 8px #0006; }
  .card.dim { filter: grayscale(0.7) brightness(0.8); }
  button.card:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) { .card { transition: none; } }
</style>
