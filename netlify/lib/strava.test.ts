import { describe, expect, it, vi } from "vitest";
import {
  configuration,
  createStravaHandler,
  encryptedStore,
  purgeExpiredSessions,
} from "./strava";
const origin = "http://localhost:8888";
const config = configuration({
  MILEMARK_APP_ORIGIN: origin,
  MILEMARK_SESSION_KEY: "11".repeat(32),
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: "private-client-secret",
});
function memoryStore() {
  const rows = new Map<
    string,
    { data: string; metadata: Record<string, unknown>; etag: string }
  >();
  let version = 0;
  const raw = {
    getWithMetadata: async (name: string) => rows.get(name) ?? null,
    getMetadata: async (name: string) => rows.get(name) ?? null,
    set: async (
      name: string,
      data: string,
      options: {
        metadata?: Record<string, unknown>;
        onlyIfMatch?: string;
      } = {},
    ) => {
      if (options.onlyIfMatch && rows.get(name)?.etag !== options.onlyIfMatch)
        return { modified: false };
      const etag = String(++version);
      rows.set(name, { data, metadata: options.metadata ?? {}, etag });
      return { modified: true, etag };
    },
    delete: async (name: string) => {
      rows.delete(name);
    },
    list: async function* (options: { prefix?: string } = {}) {
      yield {
        blobs: [...rows.keys()]
          .filter((key) => !options.prefix || key.startsWith(options.prefix))
          .map((key) => ({ key })),
        directories: [],
      };
    },
  } as unknown as Parameters<typeof encryptedStore>[0];
  return { raw, rows };
}
function fixture(
  options: {
    refreshFails?: boolean;
    rateLimit?: boolean;
    wrongOwner?: boolean;
    noZones?: boolean;
    revokeFails?: boolean;
    missing?: boolean;
  } = {},
) {
  const memory = memoryStore();
  let clock = Date.parse("2026-11-24T06:00:00Z");
  const tokenRequests: URLSearchParams[] = [],
    revoked: string[] = [];
  const sample = {
    id: 123,
    name: "My private run",
    start_date: "2026-11-23T01:00:00Z",
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1900,
    sport_type: "Run",
    athlete: { id: options.wrongOwner ? 8 : 7 },
  };
  const upstream = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://www.strava.com");
    expect(init?.redirect).toBe("error");
    if (options.rateLimit && url.pathname.startsWith("/api/"))
      return Response.json(
        {},
        { status: 429, headers: { "Retry-After": "60" } },
      );
    if (url.pathname === "/oauth/token") {
      const params = new URLSearchParams(String(init?.body));
      tokenRequests.push(params);
      expect(params.get("client_secret")).toBe(config.clientSecret);
      if (options.refreshFails && params.get("grant_type") === "refresh_token")
        return Response.json({}, { status: 400 });
      return Response.json({
        access_token: `private-access-${tokenRequests.length}`,
        refresh_token: `private-refresh-${tokenRequests.length}`,
        expires_at: clock / 1000 + 60,
      });
    }
    if (url.pathname === "/oauth/deauthorize") {
      revoked.push(new Headers(init?.headers).get("authorization")!);
      return new Response(null, { status: options.revokeFails ? 503 : 200 });
    }
    if (url.pathname === "/api/v3/athlete")
      return Response.json({
        id: 7,
        firstname: "Personal",
        lastname: "Runner",
      });
    if (url.pathname === "/api/v3/athlete/zones")
      return options.noZones
        ? Response.json({}, { status: 403 })
        : Response.json({
            heart_rate: {
              zones: [
                { min: 0, max: 120 },
                { min: 120, max: 150 },
                { min: 150, max: -1 },
              ],
            },
          });
    if (url.pathname === "/api/v3/athlete/activities")
      return Response.json([sample]);
    if (url.pathname === "/api/v3/activities/123")
      return options.missing
        ? Response.json({}, { status: 404 })
        : Response.json(sample);
    if (url.pathname === "/api/v3/activities/123/streams")
      return Response.json({
        time: { data: [0, 10, 20] },
        distance: { data: [0, 30, 60] },
        heartrate: { data: [130, 135, 140] },
        moving: { data: [true, true, true] },
        latlng: {
          data: [
            [12.9, 77.5],
            [12.91, 77.51],
            [12.92, 77.52],
          ],
        },
      });
    throw new Error("Unexpected upstream URL");
  });
  const handler = createStravaHandler(
    config,
    memory.raw,
    upstream,
    () => clock,
  );
  const request = (
    path: string,
    method = "GET",
    cookie?: string,
    from = origin,
  ) =>
    handler(
      new Request(`${origin}/api/strava/${path}`, {
        method,
        headers: {
          ...(method !== "GET" ? { Origin: from } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      }),
    );
  const start = async () => {
    const response = await request("connect", "POST"),
      body = await response.json();
    return {
      response,
      url: new URL(body.authorizationUrl),
      cookie: response.headers.get("set-cookie")!.split(";")[0],
    };
  };
  const finish = async () => {
    const flow = await start();
    await request(
      `callback?state=${flow.url.searchParams.get("state")}&code=one-use-code&scope=read,profile:read_all,activity:read_all`,
      "GET",
      flow.cookie,
    );
    return flow;
  };
  return {
    ...memory,
    handler,
    request,
    start,
    finish,
    upstream,
    tokenRequests,
    revoked,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}
describe("personal Strava REST integration", () => {
  it("uses normal OAuth with read-only scopes and keeps credentials encrypted", async () => {
    const f = fixture(),
      flow = await f.finish();
    expect(flow.url.pathname).toBe("/oauth/authorize");
    expect(flow.url.searchParams.get("scope")).not.toContain("write");
    expect(flow.url.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/strava/callback`,
    );
    expect(flow.url.href).not.toContain(config.clientSecret);
    expect(flow.response.headers.get("set-cookie")).toContain(
      "HttpOnly; SameSite=Lax",
    );
    const status = await (await f.request("status", "GET", flow.cookie)).json();
    expect(status).toMatchObject({ state: "connected", athlete: { id: "7" } });
    expect(JSON.stringify(status)).not.toContain("private-");
    expect(JSON.stringify([...f.rows.values()])).not.toContain(
      "private-access",
    );
  });
  it("rejects missing credentials without any upstream request", async () => {
    const f = fixture();
    const handler = createStravaHandler(
      { ...config, clientSecret: "" },
      f.raw,
      f.upstream,
    );
    const response = await handler(
      new Request(`${origin}/api/strava/connect`, {
        method: "POST",
        headers: { Origin: origin },
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("missing-strava-credentials");
    expect(f.upstream).not.toHaveBeenCalled();
  });
  it("rejects missing, altered, duplicate or cross-browser callback state", async () => {
    const f = fixture(),
      flow = await f.start(),
      state = flow.url.searchParams.get("state");
    for (const [query, cookie] of [
      [`state=${state}&code=code`, undefined],
      ["state=wrong&code=code", flow.cookie],
      [`state=${state}&state=${state}&code=code`, flow.cookie],
      ["code=code", flow.cookie],
    ])
      expect(
        (await f.request(`callback?${query}`, "GET", cookie)).headers.get(
          "location",
        ),
      ).toContain("invalid-state");
    expect(f.tokenRequests).toHaveLength(0);
  });
  it("claims callbacks once, including concurrent replays", async () => {
    const f = fixture(),
      flow = await f.start();
    const path = `callback?state=${flow.url.searchParams.get("state")}&code=code&scope=profile:read_all,activity:read_all`;
    await Promise.all([
      f.request(path, "GET", flow.cookie),
      f.request(path, "GET", flow.cookie),
    ]);
    expect(f.tokenRequests).toHaveLength(1);
    expect(
      (await f.request(path, "GET", flow.cookie)).headers.get("location"),
    ).toContain("invalid-state");
  });
  it.each(["error=access_denied", "code=code&scope=read"])(
    "handles denied consent or scopes without obtaining tokens: %s",
    async (query) => {
      const f = fixture(),
        flow = await f.start();
      await f.request(
        `callback?state=${flow.url.searchParams.get("state")}&${query}`,
        "GET",
        flow.cookie,
      );
      expect(
        (await (await f.request("status", "GET", flow.cookie)).json()).state,
      ).toBe("disconnected");
      expect(f.tokenRequests).toHaveLength(0);
    },
  );
  it("expires unfinished attempts and old sessions", async () => {
    const f = fixture(),
      flow = await f.start();
    f.advance(600001);
    expect(
      (
        await f.request(
          `callback?state=${flow.url.searchParams.get("state")}&code=code`,
          "GET",
          flow.cookie,
        )
      ).headers.get("location"),
    ).toContain("invalid-state");
    const valid = await f.finish();
    f.advance(86400001);
    expect(
      (await (await f.request("status", "GET", valid.cookie)).json()).state,
    ).toBe("expired");
  });
  it("rotates refresh tokens and does not leak them in status", async () => {
    const f = fixture(),
      flow = await f.finish();
    f.advance(45000);
    const result = await f.request("status", "GET", flow.cookie);
    expect((await result.json()).state).toBe("connected");
    expect(f.tokenRequests[1].get("refresh_token")).toBe("private-refresh-1");
  });
  it("requires reconnection after failed refresh", async () => {
    const f = fixture({ refreshFails: true }),
      flow = await f.finish();
    f.advance(45000);
    const response = await f.request("status", "GET", flow.cookie);
    expect(response.status).toBe(401);
    expect((await response.json()).state).toBe("expired");
  });
  it("protects rotating refresh tokens from simultaneous requests", async () => {
    const f = fixture(),
      flow = await f.finish();
    f.advance(45000);
    await Promise.all([
      f.request("status", "GET", flow.cookie),
      f.request("status", "GET", flow.cookie),
    ]);
    expect(
      f.tokenRequests.filter((p) => p.get("grant_type") === "refresh_token"),
    ).toHaveLength(1);
  });
  it("normalizes and caches ten recent activities and lazily fetched details", async () => {
    const f = fixture(),
      flow = await f.finish();
    const result = await (
      await f.request("activities", "GET", flow.cookie)
    ).json();
    expect(result.activities[0]).toMatchObject({
      source: "strava",
      distance: 5,
      pace: 360,
      detailLoaded: false,
    });
    await f.request("activities", "GET", flow.cookie);
    expect(
      f.upstream.mock.calls.filter(([u]) =>
        String(u).includes("/athlete/activities"),
      ),
    ).toHaveLength(1);
    const detail = await (
      await f.request("activities/123", "GET", flow.cookie)
    ).json();
    expect(detail).toMatchObject({
      detailLoaded: true,
      zone2: { seconds: 20, distance: 0.06 },
    });
    expect(detail.route).toHaveLength(3);
  });
  it("expires summary caches after five minutes", async () => {
    const f = fixture(),
      flow = await f.finish();
    await f.request("activities", "GET", flow.cookie);
    f.advance(300001);
    await f.request("activities", "GET", flow.cookie);
    expect(
      f.upstream.mock.calls.filter(([u]) =>
        String(u).includes("/athlete/activities"),
      ),
    ).toHaveLength(2);
  });
  it("withholds another athlete’s activity and handles unavailable zones", async () => {
    const wrong = fixture({ wrongOwner: true }),
      a = await wrong.finish();
    expect(
      (await wrong.request("activities/123", "GET", a.cookie)).status,
    ).toBe(403);
    const f = fixture({ noZones: true }),
      flow = await f.finish();
    const detail = await (
      await f.request("activities/123", "GET", flow.cookie)
    ).json();
    expect(detail.zone2).toBeUndefined();
    expect(detail.warnings).toHaveLength(1);
  });
  it("returns explicit rate-limit and deleted-resource errors", async () => {
    const f = fixture(),
      flow = await f.finish();
    f.upstream.mockImplementationOnce(async () =>
      Response.json({}, { status: 429, headers: { "Retry-After": "60" } }),
    );
    const r = await f.request("activities", "GET", flow.cookie);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    const deleted = fixture({ missing: true }),
      d = await deleted.finish();
    expect(
      (await deleted.request("activities/123", "GET", d.cookie)).status,
    ).toBe(404);
  });
  it("validates query parameters and prevents arbitrary proxy requests", async () => {
    const f = fixture(),
      flow = await f.finish();
    for (const path of [
      "activities?limit=999",
      "activities?before=not-a-date",
      "activities?after=99999999999",
      "activities/../../athlete",
      "https://evil.example",
    ])
      expect(
        (await f.request(path, "GET", flow.cookie)).status,
      ).toBeGreaterThanOrEqual(400);
  });
  it("disconnects, revokes and deletes only this athlete’s caches", async () => {
    const f = fixture(),
      flow = await f.finish();
    await f.request("activities", "GET", flow.cookie);
    const store = encryptedStore(f.raw, config.key, origin);
    await store.write(
      "athlete/8/unrelated",
      { private: true },
      f.now() + 86400000,
    );
    const response = await f.request("connection", "DELETE", flow.cookie);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(f.revoked).toContain("Bearer private-access-1");
    expect([...f.rows.keys()].some((k) => k.includes("/athlete/7/"))).toBe(
      false,
    );
    expect(await store.read("athlete/8/unrelated")).not.toBeNull();
    expect((await (await f.request("status")).json()).state).toBe(
      "disconnected",
    );
  });
  it("reports failed remote revocation while removing local credentials", async () => {
    const f = fixture({ revokeFails: true }),
      flow = await f.finish();
    expect(
      (await (await f.request("connection", "DELETE", flow.cookie)).json())
        .message,
    ).toContain("confirm revocation");
    expect([...f.rows.keys()].some((k) => k.includes("/session/"))).toBe(false);
  });
  it("rejects cross-origin mutations and unauthenticated data access", async () => {
    const f = fixture(),
      flow = await f.finish();
    expect(
      (
        await f.request(
          "connection",
          "DELETE",
          flow.cookie,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect((await f.request("activities")).status).toBe(401);
  });
  it("does not revive a session disconnected during token exchange", async () => {
    const f = fixture(),
      flow = await f.start(),
      original = f.upstream.getMockImplementation()!;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    f.upstream.mockImplementation(async (u, i) => {
      if (String(u).endsWith("/oauth/token")) {
        entered();
        await gate;
      }
      return original(u, i);
    });
    const pending = f.request(
      `callback?state=${flow.url.searchParams.get("state")}&code=code&scope=profile:read_all,activity:read_all`,
      "GET",
      flow.cookie,
    );
    await started;
    await f.request("connection", "DELETE", flow.cookie);
    release();
    await pending;
    expect([...f.rows.keys()].some((k) => k.includes("/session/"))).toBe(false);
    expect(f.revoked).toContain("Bearer private-access-1");
  });
  it("purges expired data and legacy MCP registrations", async () => {
    const f = fixture(),
      store = encryptedStore(f.raw, config.key, origin);
    await store.write("cache", {}, f.now() - 1);
    await store.write("client", { client_secret: "legacy" });
    await store.write("keep", {}, f.now() + 86400000);
    await purgeExpiredSessions(f.raw, f.now());
    expect(await store.read("cache")).toBeNull();
    expect(await store.read("client")).toBeNull();
    expect(await store.read("keep")).not.toBeNull();
  });
});
describe("encrypted local storage", () => {
  it("detects tampering and cross-session substitution", async () => {
    const { raw, rows } = memoryStore(),
      store = encryptedStore(raw, config.key, origin);
    await store.write("one", { token: "secret" });
    const [name, row] = [...rows.entries()][0];
    expect(row.data).not.toContain("secret");
    rows.set(name.replace("/one", "/two"), row);
    await expect(store.read("two")).rejects.toThrow();
    const bytes = Buffer.from(row.data, "base64");
    bytes[bytes.length - 1] ^= 1;
    rows.set(name, { ...row, data: bytes.toString("base64") });
    await expect(store.read("one")).rejects.toThrow();
  });
  it("requires encryption and a localhost origin", () => {
    expect(() => configuration({})).toThrow();
    expect(() =>
      configuration({
        MILEMARK_APP_ORIGIN: "https://example.com",
        MILEMARK_SESSION_KEY: "11".repeat(32),
      }),
    ).toThrow();
  });
});
