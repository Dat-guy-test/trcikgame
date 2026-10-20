/**
 * Worker entry: creates rooms and routes WebSocket connections to the room's Durable Object.
 *   POST /api/rooms            body: RoomSettings  ->  { code, token }   (token = the creator's secret, makes them the host)
 *   GET  /api/rooms/:code/info ->  { exists, started } or 404
 *   GET  /api/rooms/:code/ws   ->  WebSocket (see packages/protocol)
 */
import { generateRoomCode, isRoomCode, validateSettings } from '@tarok/protocol';
import type { Env } from './env';
export { Room } from './room';

function randomInt(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % n;
}

function allowedOrigins(env: Env): string[] | null {
  const v = (env.ALLOWED_ORIGIN ?? '*').trim();
  return v === '*' || v === '' ? null : v.split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(env: Env, req: Request): Record<string, string> {
  const list = allowedOrigins(env);
  const origin = req.headers.get('Origin');
  return {
    'access-control-allow-origin': list === null ? '*' : origin && list.includes(origin) ? origin : list[0] ?? '',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = corsHeaders(env, req);
    const list = allowedOrigins(env);
    const origin = req.headers.get('Origin');
    if (list !== null && origin !== null && !list.includes(origin)) return new Response('forbidden', { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/') return new Response('tarok server ok', { headers });

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const text = await req.text();
      if (text.length > 2000) return new Response('too large', { status: 413, headers });
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return new Response('bad json', { status: 400, headers });
      }
      const settings = validateSettings(parsed);
      if (!settings) return new Response('bad settings', { status: 400, headers });
      const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = generateRoomCode(randomInt);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, token, settings }) });
        if (res.status === 409) continue; // code already taken: try another
        if (!res.ok) return new Response('could not create room', { status: 500, headers });
        return Response.json({ code, token }, { headers });
      }
      return new Response('could not create room', { status: 503, headers });
    }

    const m = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{4,8})\/(ws|info)$/);
    if (m && isRoomCode(m[1]!)) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]!));
      const res = await stub.fetch(req);
      if (m[2] === 'info') {
        const out = new Response(res.body, res);
        for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
        return out;
      }
      return res; // WebSocket upgrade
    }

    return new Response('not found', { status: 404, headers });
  },
};
