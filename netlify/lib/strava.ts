import { randomBytes, timingSafeEqual } from "node:crypto";
import { encryptedStore, stravaStore, type BlobStore } from "./storage";
import {
  normalizeActivity,
  record,
  monthsAgo,
  localDate,
} from "../../src/activities";
import type { StravaStatus } from "../../src/types";
export { encryptedStore, stravaStore, purgeExpiredSessions } from "./storage";
import { purgeExpiredSessions } from "./storage";

const SCOPES = ["read", "profile:read_all", "activity:read_all"];
const COOKIE = "milemark_strava",
  DAY = 86_400_000,
  ATTEMPT = 600_000;
const DISCONNECTED: StravaStatus = {
  state: "disconnected",
  message: "Connect your personal Strava account with read-only access.",
};
interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
interface Session {
  version: 2;
  expiresAt: number;
  status: StravaStatus;
  pending?: string;
  tokens?: Tokens;
  athlete?: { id: string; name: string };
  refreshingUntil?: number;
}
class ConnectionError extends Error {
  constructor(
    public status: StravaStatus,
    public httpStatus = 502,
  ) {
    super(status.message);
  }
}
function fail(
  code: string,
  message: string,
  state: StravaStatus["state"] = "error",
  httpStatus = 502,
): never {
  throw new ConnectionError({ state, code, message }, httpStatus);
}
export function configuration(env: NodeJS.ProcessEnv) {
  if (
    !env.MILEMARK_APP_ORIGIN ||
    !/^[a-f\d]{64}$/i.test(env.MILEMARK_SESSION_KEY ?? "")
  )
    fail(
      "missing-configuration",
      "Set MILEMARK_APP_ORIGIN and MILEMARK_SESSION_KEY in your local .env file.",
      "setup-required",
      503,
    );
  const url = new URL(env.MILEMARK_APP_ORIGIN);
  // This edition is laptop-only: never silently send credentials to a hosted store.
  if (
    url.origin !== env.MILEMARK_APP_ORIGIN ||
    url.hostname !== "localhost" ||
    url.protocol !== "http:"
  )
    fail(
      "local-only",
      "This personal edition must run at http://localhost:8888.",
      "setup-required",
      503,
    );
  return {
    origin: url.origin,
    key: Buffer.from(env.MILEMARK_SESSION_KEY!, "hex"),
    clientId: env.STRAVA_CLIENT_ID ?? "",
    clientSecret: env.STRAVA_CLIENT_SECRET ?? "",
  };
}
function errorResponse(error: unknown) {
  return error instanceof ConnectionError
    ? error
    : new ConnectionError({
        state: "error",
        code: "connection-failed",
        message:
          "Strava could not complete the request. Your previous data has not been replaced.",
      });
}
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>) {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export function createStravaHandler(
  config: ReturnType<typeof configuration>,
  raw: BlobStore,
  upstream: typeof fetch = fetch,
  now = () => Date.now(),
) {
  const store = encryptedStore(raw, config.key, config.origin);
  const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    });
  const cookie = (id = "") =>
    `${COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${id ? DAY / 1000 : 0}`;
  const back = (result = "returned", headers: HeadersInit = {}) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${config.origin}/?strava=${result}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        ...headers,
      },
    });
  function credentials() {
    if (!/^\d+$/.test(config.clientId) || !config.clientSecret)
      fail(
        "missing-strava-credentials",
        "Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET from your Strava API application to .env, then restart npm run dev. Set its callback domain to localhost.",
        "setup-required",
        503,
      );
  }
  async function request(path: string, init: RequestInit = {}) {
    const response = await limited(() =>
      upstream(`https://www.strava.com${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      }),
    );
    if (response.status === 429)
      throw new ConnectionError(
        {
          state: "rate-limit",
          code: "rate-limit",
          message:
            "Strava’s request limit was reached. Wait before refreshing or loading more history.",
          retryAfter: Number(response.headers.get("retry-after")) || 900,
        },
        429,
      );
    return response;
  }
  async function token(params: Record<string, string>): Promise<Tokens> {
    credentials();
    const response = await request("/oauth/token", {
      method: "POST",
      body: new URLSearchParams({
        ...params,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    if (!response.ok)
      fail(
        "token-rejected",
        "Strava authorization expired or the API credentials were rejected. Check configuration and reconnect.",
        "expired",
        401,
      );
    const data = record(await response.json());
    if (
      typeof data.access_token !== "string" ||
      typeof data.refresh_token !== "string" ||
      typeof data.expires_at !== "number" ||
      data.expires_at * 1000 <= now()
    )
      fail(
        "invalid-token-response",
        "Strava returned an invalid token response. Reconnect.",
      );
    return data as unknown as Tokens;
  }
  async function revoke(tokens?: Tokens) {
    if (!tokens) return true;
    try {
      return (
        await request("/oauth/deauthorize", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
      ).ok;
    } catch {
      return false;
    }
  }
  async function api(path: string, tokens: Tokens) {
    const response = await request(`/api/v3${path}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (response.status === 401)
      fail(
        "authorization-expired",
        "Strava access expired or was revoked. Reconnect to continue.",
        "expired",
        401,
      );
    if (response.status === 403)
      fail(
        "permission-required",
        "Strava denied this data request. Check granted permissions; some zone endpoints also require a subscription.",
        "error",
        403,
      );
    if (response.status === 404)
      fail(
        "not-found",
        "This Strava activity or resource is no longer available.",
        "error",
        404,
      );
    if (!response.ok)
      fail(
        "strava-unavailable",
        "Strava is temporarily unavailable. Try again later.",
      );
    return response.json() as Promise<unknown>;
  }
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url),
      path = url.pathname.slice("/api/strava/".length);
    if (url.origin !== config.origin)
      return json(
        {
          state: "setup-required",
          message: `Open ${config.origin} to connect.`,
        },
        400,
      );
    if (!["GET", "POST", "DELETE"].includes(req.method))
      return json({ message: "Method not allowed." }, 405);
    if (req.method !== "GET" && req.headers.get("origin") !== config.origin)
      return json({ message: "Request origin did not match Milemark." }, 403);
    const id = req.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const name = id && /^[a-f\d]{64}$/.test(id) ? `session/${id}` : undefined;
    try {
      let entry = name ? await store.read<Session>(name) : null;
      let session = entry?.value;
      if (session && (session.version !== 2 || session.expiresAt <= now())) {
        await store.remove(name!);
        session = undefined;
        entry = null;
      }
      let etag = entry?.etag;
      async function persist() {
        if (!name || !etag || !session)
          fail(
            "session-ended",
            "This connection changed in another tab. Reconnect.",
            "expired",
            401,
          );
        const result = await store.write(
          name,
          session,
          session.expiresAt,
          etag,
        );
        if (!result.modified || !result.etag)
          fail(
            "session-ended",
            "The connection ended in another tab. Reconnect.",
            "expired",
            401,
          );
        etag = result.etag;
      }
      if (path === "connect" && req.method === "POST") {
        credentials();
        if (session?.tokens)
          return json(
            {
              state: "error",
              canDisconnect: true,
              message: "Disconnect the existing Strava connection first.",
            },
            409,
          );
        if (name) await store.remove(name);
        const newId = randomBytes(32).toString("hex"),
          state = randomBytes(32).toString("hex");
        await store.write(
          `session/${newId}`,
          {
            version: 2,
            expiresAt: now() + ATTEMPT,
            pending: state,
            status: {
              state: "authorizing",
              message: "Complete sign-in and read-only consent on Strava.",
            },
          } satisfies Session,
          now() + ATTEMPT,
        );
        const authorize = new URL("https://www.strava.com/oauth/authorize");
        authorize.search = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: `${config.origin}/api/strava/callback`,
          response_type: "code",
          approval_prompt: "force",
          scope: SCOPES.join(","),
          state,
        }).toString();
        return json({ authorizationUrl: authorize.href }, 200, {
          "Set-Cookie": cookie(newId),
        });
      }
      if (path === "callback" && req.method === "GET") {
        const state = url.searchParams.get("state");
        if (
          !session?.pending ||
          !state ||
          !/^[a-f\d]{64}$/.test(state) ||
          !timingSafeEqual(Buffer.from(state), Buffer.from(session.pending)) ||
          url.searchParams.getAll("state").length !== 1
        )
          return back("invalid-state");
        delete session.pending;
        await persist();
        try {
          if (url.searchParams.has("error"))
            fail(
              "consent-denied",
              "Strava access was declined. You can connect again.",
              "disconnected",
              403,
            );
          const scopes = (url.searchParams.get("scope") ?? "").split(/[ ,]+/);
          if (
            !["profile:read_all", "activity:read_all"].every((scope) =>
              scopes.includes(scope),
            )
          )
            fail(
              "permissions-required",
              "Approve profile and all-activity read permissions to include private runs. Reconnect to choose them.",
              "disconnected",
              403,
            );
          const code = url.searchParams.get("code");
          if (
            !code ||
            code.length > 4096 ||
            url.searchParams.getAll("code").length !== 1
          )
            fail(
              "invalid-code",
              "Strava did not return a valid authorization code.",
            );
          session.tokens = await token({
            grant_type: "authorization_code",
            code,
          });
          const athlete = record(await api("/athlete", session.tokens));
          if (!/^[1-9]\d*$/.test(String(athlete.id)))
            fail(
              "invalid-athlete",
              "Strava returned an invalid athlete profile.",
            );
          session.athlete = {
            id: String(athlete.id),
            name:
              [athlete.firstname, athlete.lastname]
                .filter((v) => typeof v === "string")
                .join(" ")
                .slice(0, 150) || "Runner",
          };
          session.status = {
            state: "connected",
            message: "Connected to Strava with read-only API access.",
          };
          session.expiresAt = now() + DAY;
          await persist();
        } catch (error) {
          if (session.tokens) {
            await revoke(session.tokens);
            delete session.tokens;
          }
          session.status = errorResponse(error).status;
          await persist();
        }
        return back("returned", { "Set-Cookie": cookie(id) });
      }
      if (path === "connection" && req.method === "DELETE") {
        const revoked = await revoke(session?.tokens);
        if (name) await store.remove(name);
        if (session?.athlete)
          await store.removePrefix(`athlete/${session.athlete.id}/`);
        return json(
          {
            ...DISCONNECTED,
            message: revoked
              ? "Disconnected. Local Strava credentials and activity caches were removed."
              : "Disconnected locally. Remove Milemark in Strava Settings → My Apps to confirm revocation.",
          },
          200,
          { "Set-Cookie": cookie() },
        );
      }
      if (!session) {
        if (path === "status") {
          credentials();
          return json(
            id
              ? {
                  state: "expired",
                  message:
                    "Your local connection session expired. Reconnect Strava.",
                }
              : DISCONNECTED,
            200,
            id ? { "Set-Cookie": cookie() } : {},
          );
        }
        fail(
          "not-connected",
          "Connect Strava before loading activities.",
          "expired",
          401,
        );
      }
      if (
        session.tokens &&
        session.tokens.expires_at * 1000 <= now() + 30_000
      ) {
        if (session.refreshingUntil && session.refreshingUntil > now())
          fail(
            "refreshing",
            "Another request is refreshing Strava access. Try again in a moment.",
            "error",
            409,
          );
        session.refreshingUntil = now() + 30_000;
        await persist();
        try {
          session.tokens = await token({
            grant_type: "refresh_token",
            refresh_token: session.tokens.refresh_token,
          });
          delete session.refreshingUntil;
          try {
            await persist();
          } catch (error) {
            await revoke(session.tokens);
            throw error;
          }
        } catch (error) {
          session.status = errorResponse(error).status;
          delete session.refreshingUntil;
          await persist();
          throw error;
        }
      }
      if (path === "status" && req.method === "GET")
        return json({
          ...session.status,
          athlete: session.athlete,
          canDisconnect: true,
        });
      if (
        !session.tokens ||
        !session.athlete ||
        session.status.state !== "connected"
      )
        fail(
          "not-connected",
          "Reconnect Strava to load your activities.",
          "expired",
          401,
        );
      const tokens = session.tokens,
        athlete = session.athlete;
      async function cached(
        key: string,
        ttl: number,
        load: () => Promise<unknown>,
      ) {
        const cacheKey = `athlete/${athlete.id}/${key}`;
        const old = await store.read<{
          value: unknown;
          freshUntil: number;
          expiresAt: number;
        }>(cacheKey);
        if (
          old &&
          old.value.freshUntil > now() &&
          old.value.expiresAt > now() &&
          url.searchParams.get("refresh") !== "1"
        )
          return old.value.value;
        let value: unknown;
        try {
          value = await load();
        } catch (error) {
          if (error instanceof ConnectionError && error.httpStatus === 404)
            await store.remove(cacheKey);
          throw error;
        }
        // A disconnect during a request must never recreate private cache entries.
        if (!(await store.read<Session>(name!))?.value.tokens)
          fail("session-ended", "The Strava session ended.", "expired", 401);
        await store.write(
          cacheKey,
          { value, freshUntil: now() + ttl, expiresAt: now() + 7 * DAY },
          now() + 7 * DAY,
        );
        if (!(await store.read<Session>(name!))?.value.tokens) {
          await store.remove(cacheKey);
          fail("session-ended", "The Strava session ended.", "expired", 401);
        }
        return value;
      }
      const zones = () =>
        cached("zones", DAY, () => api("/athlete/zones", tokens));
      if (path === "zones" && req.method === "GET") return json(await zones());
      if (path === "activities" && req.method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? 10),
          before = url.searchParams.get("before"),
          after = url.searchParams.get("after");
        if (
          ![10, 100].includes(limit) ||
          [before, after].some(
            (v) =>
              v !== null &&
              (!/^\d{1,11}$/.test(v) ||
                Number(v) > Math.floor(now() / 1000) + 86400),
          )
        )
          fail(
            "invalid-query",
            "Choose a valid activity window and page size.",
            "error",
            400,
          );
        const minAfter = Math.floor(
          new Date(
            `${monthsAgo(localDate(new Date(now())), 6)}T00:00:00+05:30`,
          ).getTime() / 1000,
        );
        const query = new URLSearchParams({
          per_page: String(limit),
          after: String(Math.max(minAfter, Number(after ?? minAfter))),
          ...(before ? { before } : {}),
        });
        return json(
          await cached(`list/${query}`, 300_000, async () => {
            const data = await api(`/athlete/activities?${query}`, tokens);
            if (!Array.isArray(data))
              fail(
                "invalid-activities",
                "Strava returned an invalid activity list.",
              );
            const activities = data.map((v) => ({
              ...normalizeActivity(v),
              expiresAt: now() + DAY,
            }));
            const dates = data
              .map((v) => Date.parse(String(record(v).start_date)) / 1000)
              .filter(Number.isFinite);
            return {
              activities,
              nextBefore:
                data.length === limit && dates.length
                  ? Math.floor(Math.min(...dates))
                  : null,
              fetchedAt: now(),
            };
          }),
        );
      }
      const detail = /^activities\/([1-9]\d{0,19})$/.exec(path);
      if (detail && req.method === "GET")
        return json(
          await cached(`detail/${detail[1]}`, DAY, async () => {
            const data = record(await api(`/activities/${detail[1]}`, tokens));
            if (String(record(data.athlete).id) !== athlete.id)
              fail(
                "wrong-athlete",
                "This activity does not belong to the connected athlete.",
                "error",
                403,
              );
            const warnings: string[] = [];
            async function optional(
              load: () => Promise<unknown>,
              label: string,
            ) {
              try {
                return await load();
              } catch (error) {
                if (
                  !(error instanceof ConnectionError) ||
                  ![403, 404].includes(error.httpStatus)
                )
                  throw error;
                warnings.push(label);
                return {};
              }
            }
            const [streams, athleteZones] = await Promise.all([
              optional(
                () =>
                  api(
                    `/activities/${detail[1]}/streams?keys=time,distance,altitude,heartrate,velocity_smooth,moving,latlng&key_by_type=true`,
                    tokens,
                  ),
                "Sensor streams are unavailable for this activity.",
              ),
              optional(
                zones,
                "Personal heart-rate zones are unavailable; Zone 2 comparisons are withheld.",
              ),
            ]);
            return {
              ...normalizeActivity(data, streams, athleteZones),
              warnings,
              expiresAt: now() + DAY,
            };
          }),
        );
      return json({ message: "Not found." }, 404);
    } catch (error) {
      if (path === "callback") return back("connection-error");
      const failure = errorResponse(error);
      return json(
        failure.status,
        failure.httpStatus,
        failure.status.retryAfter
          ? { "Retry-After": String(failure.status.retryAfter) }
          : {},
      );
    }
  };
}
let lastCleanup = 0;
export async function handleStrava(request: Request) {
  try {
    if (process.env.NETLIFY_DEV !== "true")
      fail(
        "local-only",
        "Run this personal edition locally with npm run dev. Hosted Strava access is disabled.",
        "setup-required",
        503,
      );
    const config = configuration(process.env),
      store = stravaStore();
    if (Date.now() - lastCleanup > 3_600_000) {
      await purgeExpiredSessions(store);
      lastCleanup = Date.now();
    }
    return await createStravaHandler(config, store)(request);
  } catch (error) {
    const failure = errorResponse(error);
    return Response.json(failure.status, {
      status: failure.httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
