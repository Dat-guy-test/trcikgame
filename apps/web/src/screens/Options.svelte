<script lang="ts">
  import { loadLang, t } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
  import { settings, type Lang } from '../lib/settings.svelte';
</script>

<main class="screen">
  <h1>{t('menu.options')}</h1>

  <label class="field">
    <span>{t('menu.name')}</span>
    <input bind:value={settings.name} maxlength="20" placeholder={t('you')} />
  </label>
  <label class="field">
    <span>{t('options.language')}</span>
    <select value={settings.lang} onchange={(e) => loadLang(e.currentTarget.value as Lang)}>
      <option value="en">English</option>
      <option value="pl">Polski</option>
    </select>
  </label>
  <label class="check"><input type="checkbox" bind:checked={settings.showPoints} /> {t('options.points')}</label>
  <label class="check"><input type="checkbox" bind:checked={settings.colorblind} /> {t('options.colorblind')}</label>
  <label class="field">
    <span>{t('options.botSpeed')}</span>
    <select bind:value={settings.botDelay}>
      <option value={1200}>{t('options.slow')}</option>
      <option value={600}>{t('options.normal')}</option>
      <option value={150}>{t('options.fast')}</option>
      <option value={0}>{t('options.instant')}</option>
    </select>
  </label>
  <button class="btn primary" onclick={() => go('menu')}>{t('action.back')}</button>
</main>

<style>
  .screen { display: grid; gap: 0.9rem; width: min(100%, 26rem); margin: 0 auto; padding: 1.2rem; align-content: start; min-height: 100dvh; }
  h1 { margin: 0; font-size: 1.5rem; }
  .field { display: grid; gap: 0.25rem; font-size: 0.9rem; }
  .check { display: flex; gap: 0.6rem; align-items: center; min-height: 2.75rem; }
</style>
