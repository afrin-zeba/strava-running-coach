import { addDays, isRun, mondayOf, monthsAgo } from "./activities";
import type { Activity, HistoryCoverage } from "./types";
export function liveTrend(
  activities: Activity[],
  months: number,
  today: string,
) {
  const start = monthsAgo(today, months),
    midpoint = (Date.parse(start) + Date.parse(today)) / 2;
  const selected = activities
    .filter((a) => isRun(a) && a.date >= start && a.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weeks = new Map<
    string,
    {
      date: string;
      distance: number;
      runs: number;
      longest: number;
      easyTime: number;
      easyDistance: number;
    }
  >();
  for (const a of selected) {
    const date = mondayOf(a.date),
      p = weeks.get(date) ?? {
        date,
        distance: 0,
        runs: 0,
        longest: 0,
        easyTime: 0,
        easyDistance: 0,
      };
    p.distance += a.distance;
    p.runs++;
    p.longest = Math.max(p.longest, a.distance);
    p.easyTime += a.zone2?.seconds ?? 0;
    p.easyDistance += a.zone2?.distance ?? 0;
    weeks.set(date, p);
  }
  const easy = selected.filter((a) => a.zone2 && a.zone2.distance > 0);
  const first = easy.filter((a) => Date.parse(a.date) < midpoint),
    last = easy.filter((a) => Date.parse(a.date) >= midpoint);
  const pace = (runs: Activity[]) =>
    runs.reduce((s, a) => s + a.zone2!.seconds, 0) /
    runs.reduce((s, a) => s + a.zone2!.distance, 0);
  return {
    selected,
    chart: [...weeks.values()].map((p) => ({
      ...p,
      label: new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(p.date)),
      easyPace: p.easyDistance ? Math.round(p.easyTime / p.easyDistance) : null,
    })),
    improvement:
      first.length >= 2 && last.length >= 2
        ? Math.round(pace(first) - pace(last))
        : null,
    easySamples: easy.length,
  };
}
export function trainingBaseline(
  activities: Activity[],
  today: string,
  coverage: HistoryCoverage | null,
) {
  const end = mondayOf(today),
    start = addDays(end, -28);
  const runs = activities.filter(
    (a) => isRun(a) && a.date >= start && a.date < end,
  );
  const complete =
    !!coverage?.complete &&
    coverage.after <= start &&
    coverage.through >= addDays(end, -1);
  return {
    complete,
    start,
    end,
    runCount: runs.length,
    weeklyMinutes: runs.reduce((s, a) => s + a.movingTime / 60, 0) / 4,
    weeklyDistance: runs.reduce((s, a) => s + a.distance, 0) / 4,
    longest: Math.max(0, ...runs.map((a) => a.distance)),
  };
}
