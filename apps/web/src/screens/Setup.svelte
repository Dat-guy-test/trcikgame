<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
  import { setup } from '../lib/setup.svelte';

  const bots = $derived(setup.players - 1);
  const dummies = $derived(setup.players === 2 ? 2 : setup.players === 3 ? 1 : 0);
  const unit = $derived(setup.winKind === 'rounds' ? t('setup.unit.rounds') : setup.winKind === 'targetScore' ? t('setup.unit.points') : t('setup.unit.minutes'));
  const clampValue = () => {
    setup.winValue = Math.max(1, Math.floor(Number(setup.winValue) || 1));
  };
  let failSafe = $state(setup.failSafeMinutes !== null);
  $effect(() => {
    setup.failSafeMinutes = failSafe ? (setup.failSafeMinutes ?? 60) : null;
  });
</script>

<main class="screen">
  <h1>{t('setup.title')}</h1>

  <label class="field">
    <span>{t('setup.players')}</span>
    <select data-testid="players" bind:value={setup.players}>
      {#each [2, 3, 4, 5, 6, 7, 8] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
    <small>{t('setup.playersHint', { bots, dummies })}</small>
  </label>

  <label class="field">
    <span>{t('setup.win')}</span>
    <select data-testid="win-kind" bind:value={setup.winKind}>
      <option value="rounds">{t('setup.win.rounds')}</option>
      <option value="targetScore">{t('setup.win.target')}</option>
      <option value="timeLimit">{t('setup.win.time')}</option>
    </select>
  </label>
  <label class="field">
    <span>{unit}</span>
    <input type="number" inputmode="numeric" min="1" data-testid="win-value" bind:value={setup.winValue} onchange={clampValue} />
  </label>

  <label class="check"><input type="checkbox" bind:checked={failSafe} /> {t('setup.failSafe')}</label>
  {#if failSafe}
    <label class="field">
      <span>{t('setup.unit.minutes')}</span>
      <input type="number" inputmode="numeric" min="1" bind:value={setup.failSafeMinutes} />
    </label>
  {/if}
  <label class="check"><input type="checkbox" bind:checked={setup.timers} /> {t('setup.timers')}</label>
  <label class="check"><input type="checkbox" bind:checked={setup.infiniteContra} /> {t('setup.infiniteContra')}</label>

  <div class="row">
    <button class="btn" onclick={() => go('menu')}>{t('action.back')}</button>
    <button class="btn primary" data-testid="start" onclick={() => { clampValue(); go('game'); }}>{t('setup.start')}</button>
  </div>
</main>

<style>
  .screen { display: grid; gap: 0.9rem; width: min(100%, 26rem); margin: 0 auto; padding: 1.2rem; align-content: start; min-height: 100dvh; }
  h1 { margin: 0; font-size: 1.5rem; }
  .field { display: grid; gap: 0.25rem; font-size: 0.9rem; }
  small { opacity: 0.75; }
  .check { display: flex; gap: 0.6rem; align-items: center; min-height: 2.75rem; }
  .row { display: flex; gap: 0.6rem; justify-content: space-between; }
</style>
