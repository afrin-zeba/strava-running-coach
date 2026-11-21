import type { Activity, Goal, RunnerProfile, Workout } from './types';

export const DEMO_DATE = '2026-11-21';
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const GOALS: Goal[] = ['First half marathon', 'Faster half marathon', 'Build endurance', 'Run consistently', 'Return to running', 'Custom goal'];
export const EXPERIENCES = ['Beginner', 'Intermediate', 'Advanced', 'Returning'] as const;
export const WORKOUTS: Workout[] = ['Running', 'Walking', 'Cycling', 'Swimming', 'Strength', 'Mobility / yoga'];
export const EQUIPMENT = ['Yoga mat', 'Resistance bands', 'Weights', 'Skipping rope', 'Gym'];
export const MODELS = [
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', provider: 'OpenAI', detail: 'Efficient · demo option' },
  { id: 'openai/gpt-6.2-sol', name: 'GPT-6.2 Sol', provider: 'OpenAI', detail: 'Balanced · demo option' },
  { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic', detail: 'Illustrative model option' },
];
export const DEFAULT_PROFILE: RunnerProfile = {
  goal: 'First half marathon', customGoal: '', experience: 'Intermediate', breakDuration: '',
  availability: { Mon: 40, Wed: 45, Fri: 40, Sun: 75 },
  workouts: ['Running', 'Strength', 'Mobility / yoga'], equipment: ['Yoga mat', 'Resistance bands'],
  injuries: '', restrictions: '', diet: 'Mostly home-cooked meals: oats or idli, rice and dal, vegetables, curd, and fruit.',
  dietPreference: 'Vegetarian', allergies: '', avoidedFoods: '', recovery: 'Ready to go',
  race: { name: 'My December half marathon', distance: 21.1, date: '', location: 'Kanteerava Stadium, Bengaluru', target: '' },
};

export function paceLabel(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function durationLabel(seconds: number) {
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
}
export function shortDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

const route: [number, number][] = [[114, 220], [96, 203], [82, 166], [104, 131], [147, 118], [174, 89], [208, 79], [237, 99], [267, 104], [292, 133], [278, 163], [245, 178], [207, 173], [187, 195], [151, 208], [114, 220]];

function makeActivity(index: number, date: string, distance: number, pace: number): Activity {
  const movingTime = Math.round(distance * pace);
  const hasHeartRate = index % 13 !== 3;
  const effort = index % 3 === 0 ? 'Long run' : index % 3 === 1 ? 'Easy' : 'Steady';
  const hrBase = effort === 'Easy' ? 137 : effort === 'Long run' ? 143 : 149;
  const streams = Array.from({ length: 33 }, (_, i) => ({
    distance: Number((distance * i / 32).toFixed(2)),
    pace: Math.round(pace + Math.sin(i * 0.7 + index) * 13 + Math.cos(i * 1.8) * 6),
    elevation: Math.round(904 + Math.sin(i * 0.35 + index) * 9 + Math.cos(i * 0.9) * 3),
    heartRate: hasHeartRate ? Math.round(hrBase + Math.sin(i * 0.5) * 8 + i / 9) : undefined,
  }));
  const heartRates = streams.flatMap(s => s.heartRate === undefined ? [] : [s.heartRate]);
  const elevation = streams.reduce((sum, s, i) => sum + (i ? Math.max(0, s.elevation - streams[i - 1].elevation) : 0), 0);
  const splitDistances = Array.from({ length: Math.ceil(distance) }, (_, i) => Number(Math.min(1, distance - i).toFixed(2)));
  const splits = splitDistances.map((d, i) => ({ km: String(i + 1), distance: d, time: Math.round(d * pace), pace }));
  const correction = movingTime - splits.reduce((sum, s) => sum + s.time, 0);
  splits[splits.length - 1].time += correction;
  const bounds = [121, 145, 160, 175, Infinity];
  const counts = bounds.map((bound, z) => heartRates.filter(hr => hr <= bound && (z === 0 || hr > bounds[z - 1])).length);
  const zoneTimes = counts.map(count => Math.floor(count / Math.max(1, heartRates.length) * movingTime));
  zoneTimes[1] += movingTime - zoneTimes.reduce((sum, seconds) => sum + seconds, 0);
  return {
    id: `run-${index}`, title: effort === 'Easy' ? 'An easy loop around the park' : effort === 'Long run' ? 'A little further, a little steadier' : 'Morning miles in Bengaluru',
    date, distance, movingTime, elapsedTime: movingTime + 85 + index % 5 * 19, pace,
    elevation, heartRate: hasHeartRate ? Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length) : undefined,
    maxHeartRate: hasHeartRate ? Math.max(...heartRates) : undefined,
    cadence: 164 + index % 7, effort,
    route: index % 11 === 4 ? undefined : route.map(([x, y]) => [x + Math.sin(index) * 6, y + Math.cos(index) * 5]),
    streams, splits, zones: hasHeartRate ? ['Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Maximum'].map((label, z) => ({ name: `Z${z + 1}`, label, seconds: zoneTimes[z], color: ['#a4b9bc', '#719b7d', '#dbb56c', '#db8957', '#c46358'][z] })) : undefined,
    source: 'demo',
  };
}

// Synthetic, fixed-date fixtures keep route, splits, and totals consistent across every preview.
export const ACTIVITIES: Activity[] = Array.from({ length: 26 * 3 }, (_, index) => {
  const date = new Date(`${DEMO_DATE}T12:00:00Z`);
  const week = Math.floor(index / 3);
  date.setUTCDate(date.getUTCDate() - week * 7 - [0, 2, 4][index % 3]);
  const distance = Number((index === 0 ? 8.42 : index % 3 === 0 ? 8.3 - week * 0.08 : index % 3 === 1 ? 5.4 - week * 0.035 : 6.2 - week * 0.04).toFixed(2));
  return makeActivity(index, date.toISOString().slice(0, 10), distance, 371 + week * 2 + [0, 12, -6][index % 3]);
});

export function getTrend(activities: Activity[], months: number) {
  const end = new Date(`${DEMO_DATE}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  const selected = activities.filter(a => new Date(`${a.date}T12:00:00Z`) >= start).sort((a, b) => a.date.localeCompare(b.date));
  const weeks = new Map<string, { date: string; distance: number; runs: number; longest: number; easyDistance: number; easyTime: number }>();
  for (const activity of selected) {
    const date = new Date(`${activity.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const key = date.toISOString().slice(0, 10);
    const point = weeks.get(key) ?? { date: key, distance: 0, runs: 0, longest: 0, easyDistance: 0, easyTime: 0 };
    point.distance += activity.distance;
    point.runs++;
    point.longest = Math.max(point.longest, activity.distance);
    if (activity.effort === 'Easy' && activity.heartRate !== undefined) { point.easyDistance += activity.distance; point.easyTime += activity.movingTime; }
    weeks.set(key, point);
  }
  const chart = [...weeks.values()].map(p => ({ ...p, distance: Number(p.distance.toFixed(1)), label: shortDate(p.date), easyPace: p.easyDistance ? Math.round(p.easyTime / p.easyDistance) : null }));
  const easy = selected.filter(a => a.effort === 'Easy' && a.heartRate !== undefined);
  const weightedPace = (runs: Activity[]) => runs.reduce((s, a) => s + a.movingTime, 0) / runs.reduce((s, a) => s + a.distance, 0);
  const first = easy.slice(0, 2), last = easy.slice(-2);
  const improvement = easy.length >= 4 ? Math.round(weightedPace(first) - weightedPace(last)) : null;
  return { selected, chart, improvement, easySamples: easy.length };
}
