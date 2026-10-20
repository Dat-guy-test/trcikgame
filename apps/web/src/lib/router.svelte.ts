/** Tiny hash router: #/ #/setup #/options #/rules #/online #/game #/room/CODE */
export type Route = 'menu' | 'setup' | 'options' | 'rules' | 'online' | 'game' | 'room';
const ROUTES = ['setup', 'options', 'rules', 'online', 'game', 'room'] as const;

const parse = (): { route: Route; param: string } => {
  const [name = '', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: ROUTES.find((r) => r === name) ?? 'menu', param };
};

export const router = $state<{ route: Route; param: string }>(parse());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const p = parse();
    router.route = p.route;
    router.param = p.param;
  });
}

export function go(route: Route, param = ''): void {
  location.hash = route === 'menu' ? '#/' : `#/${route}${param ? `/${param}` : ''}`;
}
