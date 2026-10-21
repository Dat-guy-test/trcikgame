/** Durable Object: one instance per room. A thin adapter around RoomCore (sockets, storage, one alarm). */
import { DurableObject } from 'cloudflare:workers';
import { secureDeck } from '@tarok/engine';
import { validateSettings, type ServerMessage } from '@tarok/protocol';
import type { Env } from './env';
import { RoomCore, newRoomData, type RoomData, type RoomEnv } from './roomCore';

/** A room nobody has touched for this long is deleted. */
const IDLE_DELETE_MS = 24 * 3600 * 1000;

function hex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const roomEnv: RoomEnv = {
  now: () => Date.now(),
  randomToken: () => hex(16),
  randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
  deck: secureDeck,
};

export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private sockets = new Map<string, WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const data = await ctx.storage.get<RoomData>('room');
      if (data) this.core = this.makeCore(data);
    });
  }

  private makeCore(data: RoomData): RoomCore {
    return new RoomCore(
      data,
      {
        send: (id: string, msg: ServerMessage) => {
          try {
            this.sockets.get(id)?.send(JSON.stringify(msg));
          } catch {
            /* the socket is closing */
          }
        },
        close: (id: string) => {
          try {
            this.sockets.get(id)?.close(1000, 'replaced');
          } catch {
            /* already closed */
          }
          this.sockets.delete(id);
        },
      },
      roomEnv,
      (d) => void this.ctx.storage.put('room', d),
    );
  }

  override async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;

    if (path.endsWith('/init') && req.method === 'POST') {
      if (this.core) return new Response('exists', { status: 409 });
      const body = (await req.json()) as { code: string; token: string; settings: unknown };
      const settings = validateSettings(body.settings);
      if (!settings) return new Response('bad settings', { status: 400 });
      const data = newRoomData(body.code, settings, body.token, Date.now());
      this.core = this.makeCore(data);
      await this.ctx.storage.put('room', data);
      this.reschedule();
      return new Response('ok');
    }

    if (path.endsWith('/info')) {
      return this.core ? Response.json({ exists: true, started: this.core.data.host !== null }) : new Response('not found', { status: 404 });
    }

    if (path.endsWith('/ws')) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      const core = this.core;
      if (!core) return new Response('not found', { status: 404 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      const id = crypto.randomUUID();
      this.sockets.set(id, server);
      core.connect(id);
      server.addEventListener('message', (ev: MessageEvent) => {
        try {
          if (typeof ev.data === 'string') core.handle(id, ev.data);
        } catch (e) {
          console.error('room message failed', e);
        }
        this.reschedule();
      });
      const gone = () => {
        if (this.sockets.delete(id)) {
          core.disconnect(id);
          this.reschedule();
        }
      };
      server.addEventListener('close', gone);
      server.addEventListener('error', gone);
      this.reschedule();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  private reschedule(): void {
    const core = this.core;
    if (!core) return;
    const next = core.nextAlarm();
    const cleanup = core.data.touched + IDLE_DELETE_MS;
    void this.ctx.storage.setAlarm(next === null ? cleanup : Math.min(next, cleanup));
  }

  override async alarm(): Promise<void> {
    const core = this.core;
    if (!core) return;
    if (core.connectionCount === 0 && Date.now() >= core.data.touched + IDLE_DELETE_MS) {
      this.core = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    try {
      core.alarm();
    } catch (e) {
      console.error('room alarm failed', e);
    }
    this.reschedule();
  }
}
