import { afterEach, describe, expect, it, vi } from "vitest";
import { stravaRequest } from "./strava";

afterEach(() => vi.unstubAllGlobals());

describe("Strava browser connection boundary", () => {
  it("uses same-origin cookies and returns provider failures without redirecting", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            state: "provider-error",
            code: "issuer-mismatch",
            message: "Provider configuration needs correction.",
          },
          { status: 502 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await stravaRequest("connect", "POST")).toMatchObject({
      state: "provider-error",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/strava/connect",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
  });

  it("explains when the frontend-only server is being used", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html></html>", {
            headers: { "Content-Type": "text/html" },
          }),
        ),
    );
    await expect(stravaRequest("status")).rejects.toThrow(
      "Open http://localhost:8888",
    );
  });

  it("does not misclassify a backend startup or gateway failure as the wrong server", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Gateway unavailable", {
            status: 502,
            headers: { "Content-Type": "text/plain" },
          }),
        ),
    );
    await expect(stravaRequest("status")).rejects.toThrow(
      "temporarily unavailable",
    );
  });

  it("accepts only official Strava login URLs and valid status responses", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValueOnce(
      Response.json({ authorizationUrl: "https://evil.example/login" }),
    );
    await expect(stravaRequest("connect", "POST")).rejects.toThrow(
      "unexpected",
    );
    fetcher.mockResolvedValueOnce(
      Response.json({
        authorizationUrl:
          "https://www.strava.com/oauth/authorize?state=example",
      }),
    );
    expect((await stravaRequest("connect", "POST")).authorizationUrl).toContain(
      "https://www.strava.com/",
    );
    fetcher.mockResolvedValueOnce(
      Response.json({ access_token: "should-never-be-rendered" }),
    );
    await expect(stravaRequest("status")).rejects.toThrow("could not be read");
  });
});
