import type { StravaStatus } from "./types";
export class StravaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public state?: StravaStatus["state"],
  ) {
    super(message);
  }
}
export async function stravaData<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/strava/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(60_000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The Strava server is unavailable. Open http://localhost:8888 after starting npm run dev.",
    );
  const value = await response.json();
  if (!response.ok)
    throw new StravaApiError(
      typeof value.message === "string"
        ? value.message
        : "Could not load Strava data.",
      response.status,
      value.state,
    );
  return value as T;
}

const states: StravaStatus["state"][] = [
  "disconnected",
  "authorizing",
  "connected",
  "expired",
  "setup-required",
  "provider-error",
  "subscription-required",
  "rate-limit",
  "error",
];

export async function stravaRequest(
  path: "connect" | "status" | "connection",
  method = "GET",
): Promise<StravaStatus & { authorizationUrl?: string }> {
  const response = await fetch(`/api/strava/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    if (!response.ok)
      throw new Error(
        "The Strava connection service is temporarily unavailable. Try again in a moment.",
      );
    throw new Error(
      "The Strava endpoint is unavailable at this address. Open http://localhost:8888. Start the full app with npm run dev if needed.",
    );
  }
  const value = await response.json();
  if (
    response.ok &&
    path === "connect" &&
    typeof value.authorizationUrl === "string"
  ) {
    const url = new URL(value.authorizationUrl);
    if (url.origin !== "https://www.strava.com" || url.pathname !== '/oauth/authorize' || url.username || url.password)
      throw new Error(
        "The server returned an unexpected Strava sign-in address.",
      );
    return value;
  }
  if (!states.includes(value.state) || typeof value.message !== "string")
    throw new Error("Strava connection status could not be read. Try again.");
  return value;
}
