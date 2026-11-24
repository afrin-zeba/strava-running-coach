import type { Activity } from "./types";

export const isRun = (a: Activity) =>
  !a.sportType || ["Run", "TrailRun", "VirtualRun"].includes(a.sportType);
export const localDate = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monthsAgo(date: string, months: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(
    Math.min(
      Number(date.slice(8)),
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return d.toISOString().slice(0, 10);
}
export const mondayOf = (date: string) =>
  addDays(date, -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7);
export const numeric = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const nonnegative = (v: unknown) => {
  const n = numeric(v);
  return n !== undefined && n >= 0 ? n : undefined;
};
export function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function normalizeActivity(
  value: unknown,
  streamData?: unknown,
  zoneData?: unknown,
): Activity {
  const raw = record(value),
    streams = record(streamData);
  if (
    !/^[1-9]\d*$/.test(String(raw.id)) ||
    nonnegative(raw.distance) === undefined ||
    nonnegative(raw.moving_time) === undefined ||
    typeof raw.start_date !== "string" ||
    !Number.isFinite(Date.parse(raw.start_date))
  )
    throw new Error("Strava returned an invalid activity.");
  const distance = Number(raw.distance) / 1000;
  const sportType =
    typeof raw.sport_type === "string"
      ? raw.sport_type
      : typeof raw.type === "string"
        ? raw.type
        : "Unknown";
  const activity: Activity = {
    id: String(raw.id),
    title:
      typeof raw.name === "string"
        ? raw.name.slice(0, 250)
        : "Untitled activity",
    date: localDate(new Date(raw.start_date)),
    distance,
    movingTime: Number(raw.moving_time),
    elapsedTime: nonnegative(raw.elapsed_time) ?? Number(raw.moving_time),
    pace: distance > 0 ? Number(raw.moving_time) / distance : undefined,
    elevation: nonnegative(raw.total_elevation_gain),
    heartRate: nonnegative(raw.average_heartrate),
    maxHeartRate: nonnegative(raw.max_heartrate),
    cadence:
      nonnegative(raw.average_cadence) === undefined
        ? undefined
        : Number(raw.average_cadence) *
          (["Run", "TrailRun", "VirtualRun"].includes(sportType) ? 2 : 1),
    sportType,
    effort: "Unclassified",
    source: "strava",
    detailLoaded: streamData !== undefined,
    streams: [],
    splits: [],
  };
  const data = (key: string) => array(record(streams[key]).data);
  const time = data("time"),
    metres = data("distance"),
    hr = data("heartrate"),
    altitude = data("altitude"),
    velocity = data("velocity_smooth"),
    moving = data("moving"),
    latlng = data("latlng");
  const bounds = array(record(record(zoneData).heart_rate).zones)
    .map(record)
    .filter(
      (z) => numeric(z.min) !== undefined && numeric(z.max) !== undefined,
    );
  const zones = bounds.map((z, i) => ({
    name: `Z${i + 1}`,
    label: `${z.min}–${Number(z.max) < 0 ? "∞" : z.max} bpm`,
    seconds: 0,
    color: `var(--chart-zone-${i + 1}, var(--color-accent))`,
  }));
  let z2seconds = 0,
    z2distance = 0;
  for (let i = 0; i < time.length; i++) {
    const d = nonnegative(metres[i]);
    if (d !== undefined && i % Math.max(1, Math.ceil(time.length / 500)) === 0)
      activity.streams.push({
        time: nonnegative(time[i]),
        distance: d / 1000,
        heartRate: nonnegative(hr[i]),
        elevation: numeric(altitude[i]),
        pace: Number(velocity[i]) > 0 ? 1000 / Number(velocity[i]) : undefined,
      });
    const dt = Number(time[i + 1]) - Number(time[i]),
      ds = Number(metres[i + 1]) - Number(metres[i]);
    if (
      !Number.isFinite(dt) ||
      !Number.isFinite(ds) ||
      dt <= 0 ||
      dt > 60 ||
      ds <= 0 ||
      moving[i] === false ||
      numeric(hr[i]) === undefined
    )
      continue;
    const zone = bounds.findIndex(
      (z) =>
        Number(hr[i]) >= Number(z.min) &&
        (Number(z.max) < 0 || Number(hr[i]) < Number(z.max)),
    );
    if (zone >= 0) zones[zone].seconds += dt;
    if (zone === 1) {
      z2seconds += dt;
      z2distance += ds / 1000;
    }
  }
  if (z2seconds > 0 && z2distance > 0 && isRun(activity))
    activity.zone2 = { seconds: z2seconds, distance: z2distance };
  if (zones.some((z) => z.seconds > 0)) activity.zones = zones;
  const coordinates = latlng.filter(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      numeric(p[0]) !== undefined &&
      numeric(p[1]) !== undefined &&
      Math.abs(Number(p[0])) <= 90 &&
      Math.abs(Number(p[1])) <= 180,
  ) as [number, number][];
  if (coordinates.length > 1)
    activity.route = coordinates.filter(
      (_, i) =>
        i % Math.max(1, Math.ceil(coordinates.length / 1000)) === 0 ||
        i === coordinates.length - 1,
    );
  activity.splits = array(raw.splits_metric).flatMap((v, i) => {
    const s = record(v),
      d = nonnegative(s.distance),
      t = nonnegative(s.moving_time);
    return d && t !== undefined
      ? [
          {
            km: String(i + 1),
            distance: d / 1000,
            time: t,
            pace: t / (d / 1000),
          },
        ]
      : [];
  });
  return activity;
}

export function routePoints(activity: Activity) {
  if (!activity.route?.length) return "";
  if (activity.source === "demo")
    return activity.route.map((p) => p.join(",")).join(" ");
  const scale = Math.cos((activity.route[0][0] * Math.PI) / 180);
  const coords = activity.route.map(([lat, lon]) => [lon * scale, -lat]);
  const xs = coords.map((p) => p[0]),
    ys = coords.map((p) => p[1]);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  const zoom = Math.min(
    340 / Math.max(width, 0.000001),
    240 / Math.max(height, 0.000001),
  );
  return coords
    .map(
      ([x, y]) =>
        `${200 + (x - left - width / 2) * zoom},${150 + (y - top - height / 2) * zoom}`,
    )
    .join(" ");
}
