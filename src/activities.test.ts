import { describe, expect, it } from "vitest";
import {
  normalizeActivity,
  routePoints,
  localDate,
  monthsAgo,
  addDays,
} from "./activities";
import { liveTrend, trainingBaseline } from "./metrics";
import type { Activity } from "./types";
const raw = {
  id: 42,
  name: "Recorded run",
  start_date: "2026-11-23T20:00:00Z",
  distance: 5000,
  moving_time: 1800,
  elapsed_time: 1900,
  sport_type: "Run",
  average_cadence: 85,
};
const stream = {
  time: { data: [0, 10, 20, 30, 120] },
  distance: { data: [0, 30, 60, 90, 500] },
  heartrate: { data: [130, 135, 160, 130, 130] },
  moving: { data: [true, true, true, true, true] },
  latlng: {
    data: [
      [12.9, 77.5],
      [12.91, 77.51],
    ],
  },
};
const zones = {
  heart_rate: {
    zones: [
      { min: 0, max: 120 },
      { min: 120, max: 150 },
      { min: 150, max: -1 },
    ],
  },
};
describe("recorded activity measurements", () => {
  it("converts units and dates without inventing sensor fields", () => {
    const a = normalizeActivity(raw);
    expect(a).toMatchObject({
      distance: 5,
      movingTime: 1800,
      pace: 360,
      cadence: 170,
      date: "2026-11-24",
      source: "strava",
      detailLoaded: false,
    });
    expect(a.elevation).toBeUndefined();
    expect(a.heartRate).toBeUndefined();
    expect(a.route).toBeUndefined();
    expect(a.zones).toBeUndefined();
    expect(normalizeActivity({ ...raw, distance: 0 }).pace).toBeUndefined();
  });
  it("calculates Zone 2 from aligned recorded intervals and excludes sensor gaps", () => {
    const a = normalizeActivity(raw, stream, zones);
    expect(a.zone2).toEqual({ seconds: 20, distance: 0.06 });
    expect(a.zones?.map((z) => z.seconds)).toEqual([0, 20, 10]);
    expect(normalizeActivity(raw, stream).zone2).toBeUndefined();
    const projected = routePoints(a)
      .split(" ")
      .map((p) => p.split(",").map(Number));
    expect(
      projected.every(([x, y]) => x >= 30 && x <= 370 && y >= 30 && y <= 270),
    ).toBe(true);
  });
  it("handles missing sensors and malformed upstream data", () => {
    expect(normalizeActivity(raw, {}, zones).zone2).toBeUndefined();
    expect(() => normalizeActivity({ ...raw, distance: undefined })).toThrow();
    expect(() => normalizeActivity({ ...raw, start_date: "bad" })).toThrow();
  });
  it("uses Bengaluru dates and calendar-safe month boundaries", () => {
    expect(localDate(new Date("2026-11-23T20:00:00Z"))).toBe("2026-11-24");
    expect(monthsAgo("2026-03-31", 1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
describe("evidence-based progress", () => {
  const run = (date: string, pace: number): Activity => ({
    ...normalizeActivity({ ...raw, start_date: `${date}T00:00:00Z` }),
    date,
    zone2: { seconds: pace * 3, distance: 3 },
  });
  it("requires two qualifying runs per half and weights actual zone distance", () => {
    const rows = [
      run("2026-11-01", 420),
      run("2026-11-05", 400),
      run("2026-11-18", 380),
      run("2026-11-22", 380),
    ];
    expect(liveTrend(rows, 1, "2026-11-24").improvement).toBe(30);
    expect(liveTrend(rows.slice(1), 1, "2026-11-24").improvement).toBeNull();
    expect(
      liveTrend(
        rows.map((a) => ({ ...a, zone2: undefined })),
        1,
        "2026-11-24",
      ).improvement,
    ).toBeNull();
  });
  it("uses four complete weeks, including zero-run weeks and excluding the current week", () => {
    const rows = [run("2026-11-01", 400), run("2026-11-24", 400)];
    const c = { after: "2026-10-20", through: "2026-11-24", complete: true };
    expect(trainingBaseline(rows, "2026-11-24", c)).toMatchObject({
      complete: true,
      runCount: 1,
      weeklyMinutes: 7.5,
      weeklyDistance: 1.25,
      longest: 5,
    });
    expect(
      trainingBaseline(rows, "2026-11-24", { ...c, complete: false }).complete,
    ).toBe(false);
  });
});
