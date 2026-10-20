<script lang="ts">
  import type { Component } from 'svelte';
  import { router, type Route } from './lib/router.svelte';
  import Menu from './screens/Menu.svelte';

  // Screens other than the menu are separate chunks: the engine and the bots only load when a game starts.
  const loaders: Record<Exclude<Route, 'menu'>, () => Promise<{ default: Component }>> = {
    setup: () => import('./screens/Setup.svelte'),
    options: () => import('./screens/Options.svelte'),
    rules: () => import('./screens/Rules.svelte'),
    online: () => import('./screens/Online.svelte'),
    game: () => import('./screens/GameScreen.svelte'),
  };

  let Screen = $state.raw<Component | null>(null);
  let loadedFor = $state<Route>('menu');

  $effect(() => {
    const route = router.route;
    if (route === 'menu') {
      Screen = null; // or Menu component
    } else if (route === 'room') {
      //CORRECT: Execute the import, but do NOT return the Promise
      import('./screens/GameScreen.svelte').then(m => {
        Screen = m.default;
      });
    }
  });
</script>

{#key loadedFor}
  {#if router.route === 'menu'}
    <Menu />
  {:else if Screen && loadedFor === router.route}
    <Screen />
  {/if}
{/key}
