<!-- Online only, on the score screen: propose one match option change and vote on the running proposal. -->
<script lang="ts">
  import type { OptionChange } from '@tarok/engine';
  import type { GameLike } from '../lib/gamelike';
  import { t, type Key } from '../lib/i18n.svelte';

  let { game }: { game: GameLike } = $props();

  type WinKind = 'rounds' | 'targetScore' | 'timeLimit' | 'none';
  const UNIT: Record<Exclude<WinKind, 'none'>, Key> = { rounds: 'setup.unit.rounds', targetScore: 'setup.unit.points', timeLimit: 'setup.unit.minutes' };
  const FLAGS = ['slovenian', 'bonuses', 'infiniteContra'] as const;

  const v = $derived(game.view);
  const room = $derived(game.roomSettings ?? null);
  const vote = $derived(game.vote ?? null);
  const me = $derived(v.participant);
  const isVoter = (p: number): boolean => v.controllers[p] === 'human' && v.participantKinds[p] === 'player';
  const eligible = $derived(v.seat !== null && isVoter(me));
  const voters = $derived(v.controllers.map((_, p) => p).filter(isVoter));

  const current = (k: (typeof FLAGS)[number]): boolean =>
    !room ? true : k === 'infiniteContra' ? room.infiniteContra : room[k] !== false;
  const winText = (kind: WinKind, value: number): string => (kind === 'none' ? t('setup.win.none') : `${t(UNIT[kind])}: ${value}`);
  const describe = (c: OptionChange): string =>
    c.key === 'win'
      ? t('vote.winTo', { what: winText(c.kind, c.value) })
      : t(c.value ? 'opt.enable' : 'opt.disable', { name: t(`opt.${c.key}` as Key) });

  let winKind = $state<WinKind>('rounds');
  let winValue = $state(8);
  const proposeWin = () => game.propose?.({ key: 'win', kind: winKind, value: winKind === 'none' ? 1 : Math.max(1, Math.floor(Number(winValue) || 1)) });
</script>

<section class="vote" data-testid="option-vote">
  {#if vote}
    <p><strong>{t('vote.running', { who: game.nameOf(vote.proposer), what: describe(vote.change) })}</strong></p>
    <p>
      {t('vote.status', { yes: voters.filter((p) => vote.votes[p] === true).length, total: voters.length })}
      · {t('vote.timeLeft', { n: Math.ceil((game.voteMsLeft ?? 0) / 1000) })}
    </p>
    {#if eligible}
      <div class="row">
        <button class="btn primary" data-testid="vote-approve" disabled={vote.votes[me] === true} onclick={() => game.castVote?.(true)}>{t('vote.approve')}</button>
        <button class="btn" data-testid="vote-reject" onclick={() => game.castVote?.(false)}>{t('vote.reject')}</button>
      </div>
    {/if}
  {:else}
    {#if game.voteResult}
      <p data-testid="vote-result">{t(game.voteResult.passed ? 'vote.passed' : 'vote.failed')} ({describe(game.voteResult.change)})</p>
    {/if}
    {#if eligible}
      <details>
        <summary>{t('vote.title')}</summary>
        <p class="hint">{t('vote.hint')}</p>
        <div class="row wrap">
          {#each FLAGS as k (k)}
            <button class="btn small" data-testid="propose-{k}" onclick={() => game.propose?.({ key: k, value: !current(k) })}>
              {t(current(k) ? 'opt.disable' : 'opt.enable', { name: t(`opt.${k}` as Key) })}
            </button>
          {/each}
        </div>
        <div class="row wrap win">
          <select bind:value={winKind} aria-label={t('vote.win')}>
            <option value="rounds">{t('setup.win.rounds')}</option>
            <option value="targetScore">{t('setup.win.target')}</option>
            <option value="timeLimit">{t('setup.win.time')}</option>
            <option value="none">{t('setup.win.none')}</option>
          </select>
          {#if winKind !== 'none'}<input type="number" min="1" inputmode="numeric" bind:value={winValue} aria-label={t('vote.win')} />{/if}
          <button class="btn small" data-testid="propose-win" onclick={proposeWin}>{t('vote.propose')}</button>
        </div>
      </details>
    {/if}
  {/if}
</section>

<style>
  .vote { display: grid; gap: 0.4rem; font-size: 0.9rem; }
  .vote p { margin: 0; }
  .hint { opacity: 0.75; font-size: 0.8rem; margin: 0.3rem 0; }
  .row { display: flex; gap: 0.5rem; }
  .wrap { flex-wrap: wrap; }
  .win { margin-top: 0.4rem; align-items: center; }
  .win input { width: 6rem; }
  summary { cursor: pointer; min-height: 2.75rem; display: flex; align-items: center; }
</style>
