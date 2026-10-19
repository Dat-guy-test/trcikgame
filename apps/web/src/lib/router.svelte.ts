/** Tiny hash router: #/ #/setup #/options #/rules #/online #/game */
export type Route = 'menu' | 'setup' | 'options' | 'rules' | 'online' | 'game';
const ROUTES = ['setup', 'options', 'rules', 'online', 'game'] as const;

const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r === h) ?? 'menu';
};

export const router = $state<{ route: Route }>({ route: parse() });

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    router.route = parse();
  });
}

export function go(route: Route): void {
  location.hash = route === 'menu' ? '#/' : `#/${route}`;
}
