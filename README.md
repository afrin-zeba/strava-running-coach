# Milemark

A personal running coach with a responsive React interface, Strava REST activity data, and OpenRouter-powered coaching. It runs on your laptop at **http://localhost:8888**.

## Features

- **Data:** recent activities, distance, pace, moving/elapsed time, elevation, heart rate, cadence, kilometre splits, recorded GPS traces, sensor charts and personal heart-rate zones where available.
- **Progress:** selectable 1–6-month history, weekly volume, consistency, longest runs and calculated Zone 2 pace comparisons. Missing or incomplete data is labeled.
- **Training context:** saved goals, experience, return-from-break duration, availability, workouts, equipment, injuries/recovery, current diet, restrictions and race details.
- **AI coaching:** one structured OpenRouter request generates a seven-day schedule, explanations of calculated progress, diet modifications, conditional projections and an understated motivation card.
- **Guardrails:** enforce available time, selected workouts/equipment, recovery review, conservative beginner/returning sessions, and recent training-volume limits. Reject unsupported numerical claims and incompatible diet suggestions.
- **Settings:** light/dark/system theme, mobile navigation, optional shoe cursor, masked OpenRouter key and searchable live model catalog with pricing.
- **Demo mode:** explicit synthetic activities and a free illustrative schedule work without connecting accounts. Adding an OpenRouter key in demo mode sends synthetic activity summaries plus your entered context for AI generation.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| UI and charts | Astryx 0.7.17, Recharts |
| Local backend | Netlify CLI and Functions, Node.js |
| Strava access | Standard OAuth and REST API; no MCP SDK |
| Credentials and activity cache | AES-256-GCM-encrypted local Netlify Blobs emulator |
| Training context | Athlete-specific browser localStorage |
| Coaching | Browser fetch to OpenRouter, JSON Schema output and runtime validation |
| Tests | Vitest, mocked HTTP integration tests and server-rendered UI checks |

## Run locally

Requires Node.js **22.13 or newer** and npm.

```sh
npm ci
cp .env.example .env
```

Set these server-only values in `.env`:

```dotenv
MILEMARK_APP_ORIGIN=http://localhost:8888
MILEMARK_SESSION_KEY=<64-character hexadecimal encryption key>
STRAVA_CLIENT_ID=<your Strava API client ID>
STRAVA_CLIENT_SECRET=<your Strava API client secret>
```

Generate the encryption key locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env`, use `VITE_` prefixes for secrets, or paste credentials into chat. `.env` and `.netlify/` are ignored by Git. Keep the existing encryption key when restarting; replacing it invalidates encrypted sessions and caches.

Start the complete app:

```sh
npm run dev
```

Open **[http://localhost:8888](http://localhost:8888)**. Port 5173 is only the internal Vite frontend; it cannot handle Strava requests. Netlify runs offline from its hosting control plane and emulates storage locally. Strava and OpenRouter calls still require internet access. Hosted Strava requests are explicitly disabled in this personal edition.

## Connect Strava

1. Create an API application at [Strava API Settings](https://www.strava.com/settings/api).
2. Set its **Authorization Callback Domain** to `localhost`.
3. Add the client ID and secret to `.env`; restart `npm run dev` after changing them.
4. In the sidebar choose **Connect Strava → Sign in with Strava**.
5. Approve profile and all-activity read access to include private runs.

The callback URL is `http://localhost:8888/api/strava/callback`. Sign-in uses Strava's regular OAuth endpoints, not its MCP registration service. Tokens are exchanged and refreshed on the local server; the browser receives an opaque HttpOnly session cookie. Authentication, missing scope, rate-limit and service errors have separate messages. There is no blanket MCP-subscription requirement; individual endpoints can still depend on Strava permissions or subscription features.

The dashboard initially fetches ten activities and loads details/streams for selected runs. **Fetch 10 more activities** loads older pages. Analysis loads the selected history and the four-week baseline. **Load Zone 2 stream history** additionally fetches run streams; this can consume many Strava API requests. Two upstream requests run concurrently at most, and rate limits stop the operation with an actionable message. Incomplete history stays labeled and can be refreshed manually.

## Generate coaching

1. Save your training and dietary context in **Analysis**.
2. Confirm your exact race date; the December half-marathon date is deliberately not assumed.
3. Enter your OpenRouter key in the sidebar and explicitly select a model. Models must advertise structured-output support; catalog prices are shown per million input/output tokens.
4. For live data, finish loading the selected history. Press **Generate coaching**.

One request, capped at 6,000 output tokens, generates all five sections. There are no automatic paid retries. Bad credentials, insufficient credits, rate limits, truncated/malformed responses, and failed safety validation leave the previous result intact. Review generated guidance before using it.

**What OpenRouter receives:** saved training/diet context, race distance/date/target, dated activity measurements, calculated facts, baseline limits and history coverage. The payload explicitly excludes Strava tokens/client secrets, athlete IDs, activity IDs/titles, race name/location and GPS coordinates. OpenRouter and the selected external provider process this context; a locally running app does **not** mean local AI inference.

The key stays only in tab memory and clears on refresh, sign-out, disconnect or profile-source change. Generated text is rendered as text, never executable HTML. The model catalog is public and can load without your key.

## How calculations and guardrails work

- **Zone 2:** use current personal zone boundaries with aligned recorded time, distance and heart-rate intervals. Exclude stopped/nonmoving intervals, invalid data and gaps longer than a minute. Compute pace from recorded zone distance and time before downsampling display charts.
- **Comparison:** split the selected timeline in half and require at least two qualifying runs per half. Compare distance-weighted Zone 2 pace. Weather, terrain and fatigue are not controlled; this is not a causal fitness assessment.
- **Baseline:** use the last four complete Monday–Sunday weeks, including zero-run weeks. Current partial-week training is excluded. Coverage must include the entire baseline before it is treated as complete.
- **First plan:** running time and distance cannot exceed that baseline's weekly averages, and no run may exceed its recent longest run. Numerical pace targets cannot be faster than observed running averages. Beginner/returning sessions are short and effort-based. Without adequate history, only conservative short run/walk guidance without distance/pace targets is accepted.
- **Recovery:** injury/restriction text or “Need more recovery” holds exercise suggestions for review. This app does not diagnose injuries or prescribe rehabilitation.
- **Diet:** validate listed exclusions and common allergen families, dietary preferences and restrictive/medical claims. These checks are conservative, not a comprehensive allergen detector; verify actual ingredients. Calorie prescriptions are withheld.
- **Projections/motivation:** model prose cannot introduce numerical predictions, fabricated statistics, guarantees or attributions. Referenced calculated facts are displayed separately.

## Storage and caching

| Data | Location and lifetime |
|---|---|
| Training context | Browser localStorage, separately keyed by athlete ID; persists until reset |
| Strava client credentials/encryption key | Ignored local `.env`; server only |
| OAuth attempts | Encrypted local Blobs; expire after 10 minutes |
| Strava access/refresh tokens | Encrypted local Blobs; application session expires after 24 hours |
| Recent activity pages | Encrypted local cache; fresh for 5 minutes |
| Activity details/streams and athlete zones | Encrypted local cache; fresh for 24 hours |
| Strava cache retention | At most 7 days; expired entries are purged on server startup and hourly during requests |
| Live activity display | Expires after 24 hours without refresh; expired readings are removed from tab state |
| OpenRouter model catalog | Tab memory, up to 24 hours |
| Coaching results | Tab memory, up to 24 hours or input/source expiry, whichever comes first |
| OpenRouter key | Tab memory only |

Closed-app local files are purged on the next run; no background service is installed. No Supabase, hosted database, Netlify Identity account, or cloud profile synchronization is used.

On first connection, valid existing edited context is copied into the athlete profile only if no profile already exists; original demo context is preserved. A corrupt athlete record is not overwritten. Disconnect removes that session and its athlete activity caches, attempts Strava revocation and preserves independently entered context. If revocation cannot be confirmed, remove the app in **Strava Settings → My Apps**. Browser sessions have isolated cookies; concurrent token refreshes and disconnects use conditional writes.

Coaching fingerprints include model, timeline, planning dates, profile and relevant activities. Changed inputs mark results stale; expired results are removed. Source keys and credentials are never part of an LLM prompt.

## Commands and project structure

| Command | Purpose |
|---|---|
| `npm run dev` | Full local app on port 8888 |
| `npm run dev:netlify` | Same full local app |
| `npm run dev:ui` | Frontend-only Vite on port 5173 |
| `npm test` | Automated tests |
| `npm run typecheck` | Frontend and backend TypeScript |
| `npm run build` | Compile theme, check types, build frontend into dist |
| `npm run preview` | Preview frontend production assets; no OAuth backend |
| `npx astryx doctor --built dist` | Validate Astryx setup and built assets |

`src/App.tsx` coordinates connection, profile and activity state. `src/activities.ts` normalizes measurements and projects routes; `src/metrics.ts` calculates progress and baselines; `src/coaching.ts` handles OpenRouter, prompt shaping, validation and result caching. `src/views/` contains the existing Data, Analysis and context-editor views. `netlify/lib/` contains REST OAuth, encrypted storage and backend tests; `netlify/functions/` exposes the local API and cleanup function.

Aimé requires separately licensed font files; the current display fallback remains in use. There are no repository credentials or automatically deployed services.

## External constraint and live verification

Strava’s published policy restricts using regular API data as LLM context, including derived summaries, unless separately authorized. Personal use does not create a documented exception. This implementation is not a claim of Strava approval. Read [Strava API Policy §5.3](https://www.strava.com/legal/api_policy) before using that integration.

Live account sync requires your own Strava client credentials. Real inference requires your own OpenRouter key and credits. Automated tests use mocked providers and synthetic activity records; they do not establish live provider authorization or the suitability of an individual training or diet plan.
