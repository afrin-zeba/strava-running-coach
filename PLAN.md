# Responsive running coach: UI-first implementation plan

## 1. Summary and decisions

Build a complete, interactive running-coach UI with realistic demo data. **Strava connection, OpenRouter inference, authentication, and cloud synchronization remain clearly labeled placeholders in this first release.**

The application will have exactly two main tabs: **Data** and **Analysis**. Account controls and integration settings live in the sidebar.

Use **React 19, TypeScript, Vite, Astryx, plain CSS, and Recharts**. Produce a static build for Netlify. Install Astryx’s published packages; it was not found in this workspace or on the command path. [Astryx setup](https://astryx.atmeta.com/docs/getting-started).

Runner context will eventually sync across devices through an account. Simulate that behavior in the first UI release. For the live phase, use **Netlify Identity for authentication, Netlify Functions for authenticated profile access, and Netlify Blobs for one JSON profile per user**, replacing Supabase. Functions derive the profile key from the verified user identity. [Netlify Identity](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/overview/), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

**Production integration constraint:** Strava requires a subscription for its official MCP, but its current policy also limits MCP use to personal access and restricts AI use of regular API data. The publicly hosted version needs an authorized integration path before enabling live Strava. Do not build a replacement Strava MCP wrapper. [MCP setup](https://support.strava.com/en-us/articles/15401531-how-do-i-connect-strava-to-an-ai-assistant), [API policy](https://www.strava.com/legal/api_policy).

## 2. UI and interactions

### Application shell

- Persistent left sidebar on desktop; slide-out drawer on mobile.
- Compact header containing the two tabs, account menu, and connection status.
- Minimal footer with privacy, data controls, and integration attribution.
- Light, dark, and system themes, with saved preference.
- Warm neutral surfaces, charcoal text, restrained orange accents, fine borders, and generous spacing.
- Reuse Astryx controls and theme tokens rather than introducing another component library.

Use **Aimé** through a shared font token and licensed WOFF2 files. Until those files are available, use Georgia as an explicit temporary fallback. [Aimé specimen](https://www.familytype.co/typefaces/aime), [Licensing](https://www.familytype.co/licensing).

Use native scrolling, smooth anchor navigation, and subtle parallax on decorative running-track artwork. Keep charts and forms stationary. Respect reduced-motion settings. Make the running-shoe cursor optional on desktop, preserving standard text and control cursors.

### Sidebar

Include:

- Strava connect/disconnect placeholder and status.
- Masked OpenRouter key field with reveal and clear controls.
- Searchable model selector, using a small labeled demonstration catalog initially.
- Theme control.
- Account/sign-in placeholder, sync status, and saved-data controls.

Never persist a real OpenRouter key in the prototype. Keep entered values in memory and clear them on sign-out or refresh.

### Data tab

Use a coherent six-month synthetic activity history, including at least ten recent activities.

| Area | Content and behavior |
|---|---|
| Runner summary | Athlete identity, recent volume, activity count, history coverage, last update |
| Latest run | Distance, moving/elapsed time, pace, elevation gain, average/max heart rate, cadence where available |
| Route | Responsive route preview with start/end markers |
| Run charts | Pace, elevation, heart rate, splits, and zone distribution |
| Recent activities | Latest ten activities, selection, and load more |
| Data availability | Clearly identify missing sensors, unavailable zones, or incomplete history |

Selecting an activity updates all related statistics and charts together. Missing measurements display “Unavailable,” never zero or fabricated values.

Support disconnected, loading, empty, stale, expired-authentication, subscription-required, rate-limit, and service-error states.

For a confirmed subscription failure, display:

> **Strava subscription required**
>
> Connect an account with an active Strava subscription, then try again.

Do not classify every failed connection as a subscription failure.

### Analysis tab: runner context

Place an expandable context editor above the coaching results. After completion, collapse it into a readable summary with an Edit action.

Collect:

- Available workout days and time available per day.
- Preferred activities: running, walking, cycling, swimming, strength, and mobility/yoga.
- Available equipment: none, mat, bands, weights, skipping rope, or gym.
- Injuries, current discomfort, and exercise restrictions.
- Current diet, dietary preference, allergies, and foods avoided.
- Fatigue/recovery check-in.
- Four-position experience slider: beginner, intermediate, advanced, returning.
- Required break-duration textbox when “returning” is selected.

Goal presets:

- Finish my first half marathon.
- Improve my half-marathon time.
- Build endurance.
- Run consistently.
- Return to running.
- Custom goal with free text.

Race goals reveal event name, distance, date, location, and optional finish-time target. Prefill half marathon and **Kanteerava Stadium, Bengaluru**. Leave the exact December date/year unconfirmed and editable; show no countdown until confirmed.

Save context automatically with visible saving/saved/error states. In the prototype, identify saves as **“Saved on this device · cloud sync preview.”**

### Five coaching sections

| Section | Required presentation |
|---|---|
| Improvement tracker | Dropdown for 1–6 months; weekly distance, consistency, longest run, and comparable easy-effort pace visuals; one concise explanation with history coverage |
| Running coach | Seven dated daily cards including rest; workout purpose, distance/duration, target pace range or effort, warm-up/cool-down; expandable strength exercises with sets/reps and equipment |
| Diet coach | Practical modifications to current meals; training-day fueling, recovery, long-run nutrition, and race-week food guidance |
| Future projections | Conditional scenarios, assumptions, uncertainty, and actions that could support progress |
| Motivation card | Restrained original encouragement or accurate personal progress facts |

Desktop shows a weekly training grid; mobile shows a vertical daily agenda. Charts include readable summaries and do not rely on color alone.

“Generate coaching preview” displays illustrative fixture results. Context changes mark them stale. Clearly state that live personalized generation is not yet connected.

## 3. Persistence, interfaces, and caching

Keep implementation boundaries small:

- `RunnerProfile`: availability, experience, goals/race, restrictions, diet, equipment.
- `Activity`: normalized measurements, optional chart/route data, provenance, timestamps.
- `AnalysisResult`: five outputs, input fingerprint, model, generation time, demo/live status.
- `ConnectionState`: connection, subscription, authentication, and service states.

Use three narrow interfaces: **profile storage**, **activity source**, and **coaching generator**. Implement browser-backed demo storage and fixtures first; avoid a general agent framework.

For the live account phase:

- Store one private runner profile per authenticated user using Netlify Identity, Functions, and Blobs.
- Enforce ownership in authenticated Functions, not only frontend code.
- Clear private in-memory data on sign-out and prevent one account’s cached results appearing for another.
- Keep OpenRouter credentials out of profile storage.
- Treat self-entered context separately from transient Strava data.
- Netlify Blobs uses last-write-wins behavior; simultaneous edits from two devices may overwrite each other.

Proposed cache freshness targets, subject to authorized Strava access:

| Resource | Freshness | Invalidation |
|---|---|---|
| Latest ten activities | 5 minutes | Manual refresh or new activity |
| Activity details | 1 hour | Source update/deletion |
| Route and sensor streams | 24 hours | Activity update/deletion |
| Athlete settings/zones | 24 hours | Settings change or reconnect |
| OpenRouter model catalog | 24 hours | Refresh or unavailable selection |
| Derived charts | Until source inputs change | Activity, zone, or timeline changes |
| Coaching results | Until inputs change or plan expires | Context, activity, model, prompt, or planning-week change |

Use request deduplication and stale-while-revalidate within permitted retention. Fetch older history only when needed; ten recent activities cannot support every six-month comparison.

Cache keys must include user identity, relevant inputs, and version. Never include API keys. Expire dependent results when their source data expires.

Strava currently limits caching to seven days and requires deletion handling. Apply the applicable retention rules to source and derived data; these cache suggestions do not authorize a restricted integration. [Strava retention rules](https://www.strava.com/legal/api_policy).

## 4. Live-generation behavior and guardrails

Enable live integration only after verifying authorized hosted access, authentication requirements, browser connectivity, and available MCP tools.

Then connect OpenRouter directly from the browser using the user’s key. Populate model choices from its catalog, display capability/pricing information, and require explicit model selection. Validate structured responses before rendering. [Model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

Generation flow:

1. Calculate factual statistics in application code.
2. Show what context and aggregate measurements will be sent.
3. Generate the five sections from the selected model.
4. Validate structure and training constraints before displaying the result.
5. Preserve the last valid result if generation fails.

Do not send raw GPS routes or unnecessary identity to the LLM. Do not trigger paid regeneration merely from opening a tab or moving a slider.

Guardrails:

- Respect availability, restrictions, equipment, recent training, and recovery.
- Never ramp training to force an unrealistic race goal.
- Check weekly load and individual long-run progression; do not present a universal percentage rule as guaranteed safe. [Running-load research](https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/).
- Use effort targets when precise pace lacks support.
- Require adequate heart-rate data and consistent zones before claiming Zone 2 improvement.
- With insufficient history, explain limitations and request a baseline.
- Account for race proximity, taper, and recovery without cramming missed sessions.
- Keep language encouraging and specific; support rest without guilt.
- Respect dietary restrictions; avoid aggressive calorie restriction, injury diagnosis, or guaranteed outcomes.
- Suppress unsupported numerical projections and invented motivational statistics.

The prototype demonstrates these states; implementing and evaluating live coaching belongs to the integration phase.

## 5. Ponytail execution and acceptance

Use **one Sol lead plus two Luna Max subagents**, with shared contracts fixed before parallel implementation. Reuse the workers for later tasks.

| Owner | Model | Responsibility |
|---|---|---|
| Lead | GPT-6.2 Sol, medium | Scaffold, contracts, dependencies, integration, critical review, final checks |
| UI subagent | GPT-6 Luna, max | Astryx shell, sidebar, themes, context/account UI, responsive layout |
| Data subagent | GPT-6 Luna, max | Activity fixtures, explorer, charts, persistence helpers |
| Reused Luna workers | Same agents | Analysis sections, weekly agenda, preview/error states, focused tests and responsive fixes |

Give workers bounded tasks and relevant contracts/files rather than duplicating the full conversation. The lead owns shared files and dependency installation. Subagents work in separate feature areas. [GPT-6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).

Luna was absent from this chat’s available subagent model list when checked. The implementation session must verify availability. If unavailable, use the single Sol lead sequentially rather than silently replacing Luna with additional Sol agents.

### Implementation order

1. Scaffold, define shared contracts, establish theme and synthetic data.
2. Build shell/context, Data, and Analysis in parallel.
3. Integrate persistence and state handling.
4. Validate mobile/desktop layouts, accessibility, and production build.
5. Deliver source and Netlify hosting instructions.

### Acceptance checks

- Both tabs work at 360px width without page overflow.
- Light/dark/system themes and reduced motion work.
- Activity selection and all six timeline options update correctly.
- Saved context survives refresh; returning/race fields validate correctly.
- Mock accounts cannot see each other’s saved context.
- Cloud synchronization, login, and generated results are explicitly identified as previews.
- Missing data, subscription failure, expired connection, and generation failures remain distinct.
- No real credentials are persisted and no integration requests occur in demo mode.
- Keyboard navigation, drawer focus, touch targets, and chart summaries work.
- Type checking, focused behavior tests, browser smoke checks, and production build pass.

**Deferred:** real authentication/sync, Strava, OpenRouter inference, and deployment. Main dependencies are an authorized Strava integration path and licensed Aimé files.
