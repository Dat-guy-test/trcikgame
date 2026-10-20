# Hosting for testing

The game has two parts that can be hosted separately:

| Part | What it does | Where (free) |
|---|---|---|
| **Web app** (`apps/web`) | The whole game UI. Local play against bots works with this part alone. | GitHub Pages (or Cloudflare Pages, Netlify, Vercel) |
| **Room server** (`apps/server`) | Online rooms: lobby, rules authority, bots, clocks, reconnects. | Cloudflare Workers + Durable Objects (free plan) |

The web app is a static site (relative asset paths, hash routing), so it works from any folder, including a GitHub Pages project
site such as `https://your-name.github.io/tarok/`.

## 1. Web app on GitHub Pages

1. Push the repository to GitHub (default branch `main`).
2. Repository **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
3. Push to `main` (or run the "Deploy to GitHub Pages" workflow by hand). `.github/workflows/pages.yml` installs, checks the i18n keys,
   builds, checks the 50 KB bundle budget and publishes `apps/web/dist`.
4. Open `https://<user>.github.io/<repo>/`.

That is enough for local play (2 to 8 players with bots). For online rooms continue with step 2.

Without GitHub Actions: `pnpm build`, then upload the contents of `apps/web/dist` to any static host
(Cloudflare Pages: build command `pnpm build`, output directory `apps/web/dist`; Netlify: same; or drag the folder into Netlify Drop).

## 2. Room server on Cloudflare (free)

1. Create a free Cloudflare account (no card needed for Workers).
2. In the repository: `pnpm install`, then `cd apps/server` and `pnpm exec wrangler login`.
3. Edit `apps/server/wrangler.toml`: set `ALLOWED_ORIGIN` to the origin of your site, for example `https://your-name.github.io`
   (comma-separate several; `*` allows any site and is fine for a first test).
4. `pnpm cf:deploy` (or `pnpm server:deploy` from the repo root). Wrangler prints the URL, for example
   `https://tarok-server.your-subdomain.workers.dev`.
5. Check it: opening that URL in a browser shows `tarok server ok`.

The server uses a SQLite-backed Durable Object per room, which is available on the Workers free plan. Rooms that nobody touched for 24 hours
delete themselves.

## 3. Connect the web app to the server

Pick one:

- **Build-time:** repository **Settings -> Secrets and variables -> Actions -> Variables**, add `VITE_SERVER_URL` with the Workers URL, and re-run the Pages workflow.
- **At run time (no rebuild):** open the site, **Play online -> Server address**, paste the URL. It is remembered in that browser. Handy for testing.

## 4. Trying online play

1. Open the site, **Play online**, enter a name, choose the number of players and press **Create a room**.
2. Share the invite link (or the 5-letter code). Others open it, type a name and sit down at a free seat.
3. As host, turn free seats into bots with **Make bot**, then **Start game**.
4. Closing a tab does not lose the seat: reopen the same link in the same browser. After 20 seconds offline a bot plays for you until you are back.

## Local development

```
pnpm install
pnpm server:dev        # room server on http://localhost:8787 (wrangler dev)
pnpm dev               # web app on http://localhost:5173 (talks to localhost:8787 by default)
```

To test with phones on the same Wi-Fi use `pnpm --filter @tarok/web dev --host`, and enter `http://<your-computer-ip>:8787` as the server address.
(Pages served over https can only talk to https/wss servers, so use the deployed Worker there.)

## Limits to know about

- Free Workers plan: 100,000 requests per day and a daily Durable Object duration budget. A WebSocket message counts as a request at a reduced rate;
  a handful of test tables is far below the limits.
- No accounts: the secret that lets you rejoin a seat is stored in the browser (`localStorage`). Another device needs a new seat.
- No rate limiting or moderation yet. Do not publish the server URL widely before adding Cloudflare rate-limiting rules.
