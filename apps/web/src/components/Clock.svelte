<script lang="ts">
  import { mmss } from '../lib/format';

  let { ms, label = '', warn = 10_000 }: { ms: number | null; label?: string; warn?: number } = $props();
</script>

{#if ms !== null}
  <span class="clock" class:warn={ms <= warn} role="timer" aria-label={label}>{#if label}<small>{label}</small>{/if}{mmss(ms)}</span>
{/if}

<style>
  .clock { display: inline-flex; gap: 0.35em; align-items: baseline; padding: 0.1em 0.55em; border-radius: 1em; background: #0003; font-variant-numeric: tabular-nums; font-weight: 600; }
  small { font-weight: 400; opacity: 0.8; }
  .warn { background: var(--danger); color: #fff; }
</style>
