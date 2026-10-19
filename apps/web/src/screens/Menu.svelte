<script lang="ts">
  import { loadLang, t } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
  import { settings } from '../lib/settings.svelte';
</script>

<main class="menu">
  <h1>Tarok</h1>
  <p class="sub">{t('menu.subtitle')}</p>

  <label class="field">
    <span>{t('menu.name')}</span>
    <input data-testid="name" bind:value={settings.name} maxlength="20" placeholder={t('you')} autocomplete="nickname" />
  </label>

  <nav>
    <button class="btn primary big" data-testid="play-local" onclick={() => go('setup')}>{t('menu.local')}</button>
    <button class="btn big" data-testid="play-online" onclick={() => go('online')}>{t('menu.online')}</button>
    <button class="btn big" data-testid="rules" onclick={() => go('rules')}>{t('menu.rules')}</button>
    <button class="btn big" data-testid="options" onclick={() => go('options')}>{t('menu.options')}</button>
  </nav>

  <div class="lang" role="group" aria-label={t('options.language')}>
    <button class="btn small" class:on={settings.lang === 'en'} aria-pressed={settings.lang === 'en'} onclick={() => loadLang('en')}>English</button>
    <button class="btn small" class:on={settings.lang === 'pl'} aria-pressed={settings.lang === 'pl'} onclick={() => loadLang('pl')}>Polski</button>
  </div>
</main>

<style>
  .menu { min-height: 100dvh; display: grid; align-content: center; justify-items: center; gap: 1rem; padding: 1.5rem; }
  h1 { margin: 0; font-size: clamp(2.6rem, 14vw, 4.5rem); font-weight: 700; letter-spacing: 0.02em; color: var(--accent); }
  .sub { margin: -0.6rem 0 0.4rem; opacity: 0.8; text-align: center; max-width: 24rem; }
  .field { display: grid; gap: 0.25rem; width: min(100%, 20rem); font-size: 0.85rem; }
  nav { display: grid; gap: 0.6rem; width: min(100%, 20rem); }
  .lang { display: flex; gap: 0.5rem; }
  .on { background: var(--accent); color: #1b1b1f; }
</style>
