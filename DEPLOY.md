# Deploying (free)

The app ships as **one** Render web service: the build compiles the Angular
client, and the Express + Socket.IO server serves those static files from its
own origin. One service, no CORS, WebSockets work, $0.

## One-time setup

1. Push this repo to GitHub (already done:
   `https://github.com/jvanderz22/jvanderz-scrum-poker`).
2. Go to <https://dashboard.render.com> → **New +** → **Blueprint**.
3. Connect the GitHub repo. Render finds [`render.yaml`](render.yaml) and shows
   a service named `jvanderz-scrum-poker` on the **Free** plan. Click **Apply**.
4. First build takes a few minutes. When it's live you get
   `https://jvanderz-scrum-poker.onrender.com` — the subdomain matches the
   service `name` in `render.yaml`, as long as no other Render account has
   claimed it. If it's taken, Render appends a random suffix; rename the service
   in `render.yaml` and re-apply to try another.

That URL is the whole app. Create a room, share the link, done.

`autoDeploy` is on, so every push to the default branch redeploys.

## What the blueprint does

| Step | Command |
| --- | --- |
| Build client | `npm --prefix client ci --include=dev && npm --prefix client run build:deploy` |
| Build server | `npm --prefix server ci --omit=dev` |
| Start | `npm --prefix server start` |
| Health check | `GET /api/health` |

`build:deploy` runs [`client/scripts/generate-env.js`](client/scripts/generate-env.js),
which writes `src/app/env.ts`. With no `API_BASE` env var it writes `''`, so the
client talks to its own origin.

## Free-plan caveats

- **Cold starts.** The service sleeps after ~15 min idle; the next hit wakes it
  in ~30–60s. Fine for scheduled planning sessions, sluggish for a surprise one.
- **Rooms are in-memory.** A sleep, restart, or deploy wipes every room. This is
  by design (`server/server.js` keeps nothing on disk).
- 750 free instance-hours/month across the account.

## Splitting client and server later

If you outgrow the single service (e.g. want the client on a CDN):

1. Deploy `server/` as its own Render web service. Set `CLIENT_ORIGIN` to the
   client's URL.
2. Host `client/` anywhere static (Cloudflare Pages, Netlify, Vercel). Build
   command `npm run build:deploy`, publish dir `dist/scrum-poker-client/browser`,
   and set `API_BASE` to the server's URL (scheme optional — the script adds
   `https://`). Add a SPA rewrite so `/room/:id` serves `index.html`.
