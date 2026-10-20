<script lang="ts">
  import { createRoom, getServerUrl, saveToken, setServerUrl } from '../lib/server';
  import { t } from '../lib/i18n.svelte';
  import { go } from '../lib/router.svelte';
  import { settings } from '../lib/settings.svelte';
  import { setup } from '../lib/setup.svelte';

  // Room settings start from the last local setup; they are only used for the room being created.
  let players = $state(setup.players);
  let winKind = $state(setup.winKind);
  let winValue = $state(setup.winValue);
  let timers = $state(setup.timers);
  let infiniteContra = $state(setup.infiniteContra);
  let server = $state(getServerUrl());
  let code = $state('');
  let busy = $state(false);
  let error = $state('');
  const bots = $derived(players - 1);
  const dummies = $derived(players === 2 ? 2 : players === 3 ? 1 : 0);
  const unit = $derived(winKind === 'rounds' ? t('setup.unit.rounds') : winKind === 'targetScore' ? t('setup.unit.points') : t('setup.unit.minutes'));

  async function create(): Promise<void> {
    if (!server.trim()) return void (error = t('online.noServer'));
    setServerUrl(server);
    busy = true;
    error = '';
    try {
      const value = Math.max(1, Math.floor(Number(winValue) || 1));
      const room = await createRoom({ players, winKind, winValue: value, failSafeMinutes: null, infiniteContra, timers });
      saveToken(room.code, room.token);
      go('room', room.code);
    } catch {
      error = t('online.failed');
    } finally {
      busy = false;
    }
  }

  function join(): void {
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (!server.trim()) return void (error = t('online.noServer'));
    setServerUrl(server);
    go('room', c);
  }
</script>

<main class="screen">
  <h1>{t('menu.online')}</h1>
  <p class="intro">{t('online.intro')}</p>

  <label class="field">
    <span>{t('menu.name')}</span>
    <input bind:value={settings.name} maxlength="20" placeholder={t('you')} autocomplete="nickname" />
  </label>

  <section class="box">
    <h2>{t('online.settings')}</h2>
    <label class="field">
      <span>{t('setup.players')}</span>
      <select data-testid="online-players" bind:value={players}>
        {#each [2, 3, 4, 5, 6, 7, 8] as n (n)}<option value={n}>{n}</option>{/each}
      </select>
      <small>{t('setup.playersHint', { bots, dummies })}</small>
    </label>
    <label class="field">
      <span>{t('setup.win')}</span>
      <select bind:value={winKind}>
        <option value="rounds">{t('setup.win.rounds')}</option>
        <option value="targetScore">{t('setup.win.target')}</option>
        <option value="timeLimit">{t('setup.win.time')}</option>
      </select>
    </label>
    <label class="field">
      <span>{unit}</span>
      <input type="number" inputmode="numeric" min="1" bind:value={winValue} />
    </label>
    <label class="check"><input type="checkbox" bind:checked={timers} /> {t('setup.timers')}</label>
    <label class="check"><input type="checkbox" bind:checked={infiniteContra} /> {t('setup.infiniteContra')}</label>
    <button class="btn primary" data-testid="create-room" disabled={busy} onclick={create}>{busy ? t('online.creating') : t('online.create')}</button>
  </section>

  <section class="box">
    <label class="field">
      <span>{t('online.code')}</span>
      <input data-testid="room-code" bind:value={code} maxlength="8" autocapitalize="characters" autocomplete="off" style="text-transform: uppercase" />
    </label>
    <button class="btn" data-testid="join-room" onclick={join}>{t('online.join')}</button>
  </section>

  <details>
    <summary>{t('online.server')}</summary>
    <input class="wide" bind:value={server} placeholder="https://…workers.dev" autocapitalize="none" autocomplete="off" spellcheck="false" />
  </details>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button class="btn" onclick={() => go('menu')}>{t('action.back')}</button>
</main>

<style>
  .screen { display: grid; gap: 0.9rem; width: min(100%, 26rem); margin: 0 auto; padding: 1.2rem; align-content: start; min-height: 100dvh; }
  h1 { margin: 0; font-size: 1.5rem; }
  h2 { margin: 0; font-size: 1.05rem; }
  .intro { margin: 0; opacity: 0.85; font-size: 0.9rem; }
  .box { display: grid; gap: 0.7rem; padding: 0.8rem; border-radius: 0.8rem; background: #0003; }
  .field { display: grid; gap: 0.25rem; font-size: 0.9rem; }
  small { opacity: 0.75; }
  .check { display: flex; gap: 0.6rem; align-items: center; min-height: 2.75rem; }
  .wide { width: 100%; margin-top: 0.4rem; }
  summary { cursor: pointer; min-height: 2.75rem; display: flex; align-items: center; }
  .error { margin: 0; color: #ff9a8f; }
</style>
