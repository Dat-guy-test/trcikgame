<script lang="ts">
  import { onMount } from 'svelte';
  import { OnlineGame } from '../lib/online.svelte';
  import { t } from '../lib/i18n.svelte';
  import { go, router } from '../lib/router.svelte';
  import { loadToken, roomExists } from '../lib/server';
  import { settings } from '../lib/settings.svelte';
  import GameScreen from './GameScreen.svelte';

  const code = router.param.toUpperCase();
  const game = new OnlineGame();
  let started = false;
  // A newcomer without a name is asked for one first; the creator (who has a token) goes straight in.
  let asking = $state(settings.name.trim() === '' && loadToken(code) === null);
  let copied = $state(false);

  async function begin(): Promise<void> {
    if (started) return;
    started = true;
    if ((await roomExists(code)) === false) return game.fail('notFound');
    game.connect(code, settings.name.trim() || t('you'));
  }
  onMount(() => {
    if (!asking) void begin();
    return () => game.close();
  });

  const link = `${location.origin}${location.pathname}#/room/${code}`;
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the link is shown anyway */
    }
  }

  const lobby = $derived(game.lobby);
  const seats = $derived.by(() => {
    let bots = 0;
    return (lobby?.slots ?? []).map((s) => ({ ...s, label: s.kind === 'bot' ? t('bot.name', { n: ++bots }) : s.kind === 'dummy' ? t('role.dummy') : s.kind === 'open' ? t('room.seatOpen') : (s.name ?? '') }));
  });
  const fatalText = $derived(
    game.fatal === 'notFound' ? t('online.notFound') : game.fatal === 'replaced' ? t('room.error.replaced') : t('online.failed'),
  );
</script>

{#if game.status === 'reconnecting'}<p class="banner" role="status">{t('room.reconnecting')}</p>{/if}
{#if game.notice}<p class="banner warn" role="alert">{t('room.error.generic', { message: game.notice })}</p>{/if}

{#if game.server}
  <GameScreen {game} />
{:else if asking}
  <main class="screen">
    <h1>{t('room.title', { code })}</h1>
    <label class="field">
      <span>{t('menu.name')}</span>
      <input data-testid="join-name" bind:value={settings.name} maxlength="20" placeholder={t('you')} autocomplete="nickname" />
    </label>
    <button class="btn primary" onclick={() => { asking = false; void begin(); }}>{t('room.join')}</button>
    <button class="btn" onclick={() => go('online')}>{t('action.back')}</button>
  </main>
{:else if game.fatal}
  <main class="screen">
    <h1>{t('room.title', { code })}</h1>
    <p class="error" role="alert">{fatalText}</p>
    <button class="btn primary" onclick={() => go('online')}>{t('action.back')}</button>
  </main>
{:else if lobby}
  <main class="screen" data-testid="lobby">
    <h1>{t('room.title', { code })}</h1>
    <div class="share">
      <span>{t('room.share')}</span>
      <input readonly value={link} onfocus={(e) => e.currentTarget.select()} />
      <button class="btn small" onclick={copy}>{copied ? t('room.copied') : t('room.copy')}</button>
    </div>

    <ul class="seats">
      {#each seats as s, i (i)}
        <li class:open={s.kind === 'open'} data-testid="seat-{i}">
          <span class="who">
            {s.label}
            {#if lobby.you.participant === i}<em>{t('seat.you')}</em>{/if}
            {#if s.owner}<em>{t('room.host')}</em>{/if}
            {#if s.kind === 'human' && !s.connected}<em class="off">{t('room.offline')}</em>{/if}
          </span>
          {#if lobby.you.owner && s.kind === 'open'}
            <button class="btn small" onclick={() => game.setSlot(i, 'bot')}>{t('room.makeBot')}</button>
          {:else if lobby.you.owner && s.kind === 'bot'}
            <button class="btn small" onclick={() => game.setSlot(i, 'open')}>{t('room.makeOpen')}</button>
          {/if}
        </li>
      {/each}
    </ul>

    {#if lobby.you.participant === null && !lobby.you.owner}<p>{t('room.spectator')}</p>{/if}
    {#if lobby.you.owner}
      <button class="btn primary big" data-testid="start-room" disabled={seats.some((s) => s.kind === 'open')} onclick={() => game.startGame()}>{t('room.start')}</button>
      {#if seats.some((s) => s.kind === 'open')}<p class="hint">{t('room.needSeats')}</p>{/if}
    {:else}
      <p class="hint">{t('room.waitHost')}</p>
    {/if}
    <button class="btn" onclick={() => go('menu')}>{t('action.menu')}</button>
  </main>
{:else}
  <main class="screen"><p>{t('room.connecting')}</p></main>
{/if}

<style>
  .screen { display: grid; gap: 0.9rem; width: min(100%, 28rem); margin: 0 auto; padding: 1.2rem; align-content: start; min-height: 100dvh; }
  h1 { margin: 0; font-size: 1.5rem; }
  .field { display: grid; gap: 0.25rem; font-size: 0.9rem; }
  .share { display: grid; grid-template-columns: 1fr auto; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
  .share span { grid-column: 1 / -1; opacity: 0.8; }
  .share input { min-width: 0; }
  .seats { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
  .seats li { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.4rem 0.7rem; border-radius: 0.6rem; background: #0003; min-height: 2.75rem; }
  .seats li.open { opacity: 0.7; border: 1px dashed #fff5; }
  .who { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
  em { font-style: normal; font-size: 0.7rem; padding: 0 0.5em; border-radius: 0.6em; background: var(--accent); color: #1b1b1f; }
  em.off { background: var(--danger); color: #fff; }
  .hint { margin: 0; font-size: 0.85rem; opacity: 0.8; }
  .error { margin: 0; color: #ff9a8f; }
  .banner { position: fixed; z-index: 30; top: env(safe-area-inset-top); left: 0; right: 0; margin: 0; padding: 0.3rem; text-align: center; background: var(--accent); color: #1b1b1f; font-size: 0.8rem; }
  .banner.warn { background: var(--danger); color: #fff; top: calc(env(safe-area-inset-top) + 1.8rem); }
</style>
