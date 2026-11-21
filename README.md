# Milemark

A mobile-responsive running-coach prototype built with React 19, TypeScript, Vite, Astryx, and Recharts. It contains a six-month synthetic activity history and illustrative coaching previews. No live service requests are made by the application.

## Run locally

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. The default is http://127.0.0.1:5173.

```sh
npm test
npm run build
npm run astryx -- doctor --built dist
```

The build compiles the custom Astryx theme, checks TypeScript, and creates `dist/`. The source theme is `src/theme.ts`; its generated files live in `src/theme-built/`.

## Deploy to Netlify

Connect this directory's Git repository to a Netlify project. `netlify.toml` supplies the build command (`npm run build`), publish directory (`dist`), Node 22 runtime, and SPA redirect. No environment variables are required for the demo. Alternatively, build locally and upload `dist` using Netlify's manual deployment flow.

Deployment is intentionally left to the owner; this task does not create a Netlify site or enable external services.

## Try the UI

- **Data:** select a run in Recent activities, switch the pace/elevation/heart-rate chart, zoom the illustrated route, inspect splits/zones, and load older runs.
- **Analysis:** expand Your training context to edit your goal, experience, availability, equipment, recovery, diet, and race. Generate an illustrative seven-day preview and switch the 1–6-month history window.
- **Connections:** Connect Strava opens a preview. Expand Explore connection states to inspect subscription-required, expired-login, rate-limit, empty, stale, disconnected, and service-error states.
- **Accounts:** switch between two isolated demo profiles. Context is saved on this browser only; account creation and cross-device synchronization are placeholders.
- **Preferences:** use the sidebar's theme selector. Privacy & settings offers the optional shoe cursor and a confirmation before resetting the current profile.

## Storage and integrations

Runner context is stored under a versioned, account-specific localStorage key. Theme, cursor, model choice, and simulated account selection are browser preferences. The synthetic activity service uses a five-minute in-memory cache with request deduplication. Coaching results stay in memory while switching tabs and become stale when profile/model inputs change. No new cache library, Supabase, Redis, or vector database is included.

The OpenRouter key is memory-only and is cleared on refresh, sign-out, or account change. It is not sent anywhere, logged, or stored. Do not enter a real key while evaluating this prototype; it is unnecessary.

The live phase is planned around Netlify Identity, authenticated Netlify Functions, and one private JSON profile per user in Netlify Blobs. It is not implemented here. Blobs uses last-write-wins semantics; simultaneous edits need an explicit product decision before enabling live sync.

Live Strava MCP access for a hosted multi-user app requires an authorized integration path under Strava's current terms. A subscription-required preview is not an actual entitlement check. No custom Strava proxy or MCP wrapper is included.

## Fonts and accessibility

Astryx's bundled Figtree supplies body text. The display font stack starts with Aime and falls back to Georgia because licensed Aime files were not supplied. Add appropriately licensed WOFF2 files under `public/fonts/` and define `@font-face` in `src/styles.css` to activate Aime. Do not copy fonts from the specimen website.

The interface supports light/dark/system appearance, reduced motion, keyboard-operable tabs and controls, modal/drawer focus handling, textual chart summaries, and layouts down to 360 CSS pixels.

## Demo boundaries

The activity snapshot is fixed to 21 November 2026. Routes are illustrative, not navigational maps. All measurements and improvement claims refer to synthetic fixtures. The schedule preview respects available days/time and equipment but is not a personalized training prescription. Injury/restriction/low-recovery input holds running for review; numerical race predictions are withheld. Real coaching, nutrition personalization, OAuth, cloud sync, and live model discovery are deferred, as specified in `PLAN.md`.
