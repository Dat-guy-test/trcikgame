<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
</script>

<main class="screen">
  <h1>{t('menu.online')}</h1>
  <p>{t('online.soon')}</p>
  <div class="form" aria-disabled="true">
    <button class="btn" disabled>{t('online.create')}</button>
    <input disabled placeholder={t('online.code')} />
    <button class="btn" disabled>{t('online.join')}</button>
  </div>
  <button class="btn primary" onclick={() => go('menu')}>{t('action.back')}</button>
</main>

<style>
  .screen { display: grid; gap: 1rem; width: min(100%, 26rem); margin: 0 auto; padding: 1.2rem; align-content: center; min-height: 100dvh; }
  h1 { margin: 0; font-size: 1.5rem; }
  .form { display: grid; gap: 0.6rem; opacity: 0.6; }
</style>
