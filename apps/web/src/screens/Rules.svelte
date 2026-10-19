<script lang="ts">
  import { renderMarkdown } from '../lib/md';
  import { t } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';

  // docs/rules.md is the single source of truth; it is loaded only when this screen opens.
  let html = $state('');
  $effect(() => {
    import('../../../../docs/rules.md?raw').then((m) => (html = renderMarkdown(m.default)));
  });
</script>

<main class="screen">
  <div class="bar">
    <button class="btn small" onclick={() => go('menu')}>{t('action.back')}</button>
    <button class="btn small" disabled title={t('rules.pdfSoon')}>PDF</button>
  </div>
  <p class="note">{t('rules.note')}</p>
  <article data-testid="rules-text">{@html html}</article>
</main>

<style>
  .screen { width: min(100%, 46rem); margin: 0 auto; padding: 1rem; min-height: 100dvh; }
  .bar { display: flex; justify-content: space-between; position: sticky; top: 0; padding: 0.4rem 0; background: var(--felt); z-index: 1; }
  .note { opacity: 0.75; font-size: 0.85rem; }
  article { line-height: 1.5; }
  article :global(h1) { font-size: 1.6rem; } article :global(h2) { font-size: 1.3rem; margin-top: 1.6rem; color: var(--accent); }
  article :global(h3) { font-size: 1.1rem; } article :global(h4) { font-size: 1rem; }
  article :global(.tbl) { overflow-x: auto; margin: 0.6rem 0; }
  article :global(table) { border-collapse: collapse; font-size: 0.85rem; }
  article :global(th), article :global(td) { padding: 0.3rem 0.6rem; border: 1px solid #fff3; text-align: left; vertical-align: top; }
  article :global(code), article :global(pre) { background: #0004; border-radius: 0.3rem; padding: 0.1em 0.35em; overflow-x: auto; }
  article :global(pre) { padding: 0.6rem; }
  article :global(hr) { border: 0; border-top: 1px solid #fff3; margin: 1.4rem 0; }
</style>
