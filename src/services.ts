import { ACTIVITIES, DAY_NAMES, DEFAULT_PROFILE, DEMO_DATE, EQUIPMENT, EXPERIENCES, GOALS, WORKOUTS } from './data';
import type { Activity, AnalysisResult, RunnerProfile, TrainingDay } from './types';

export const ACCOUNTS = [{ id: 'runner-one', name: 'Demo runner', initials: 'DR' }, { id: 'runner-two', name: 'Second demo runner', initials: 'SR' }];
const PROFILE_PREFIX = 'milemark.profile.v1.';
const RECOVERY = ['Ready to go', 'A little tired', 'Need more recovery'];

export function validateProfile(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Profile is unavailable.';
  const p = value as RunnerProfile;
  if (!GOALS.includes(p.goal) || !EXPERIENCES.includes(p.experience) || !RECOVERY.includes(p.recovery)) return 'Choose a valid goal, experience, and recovery level.';
  const texts = [p.customGoal, p.breakDuration, p.injuries, p.restrictions, p.diet, p.dietPreference, p.allergies, p.avoidedFoods];
  if (texts.some(text => typeof text !== 'string' || text.length > 2000)) return 'Keep each text field under 2,000 characters.';
  if (p.goal === 'Custom goal' && !p.customGoal.trim()) return 'Add your custom goal to save.';
  if (p.experience === 'Returning' && !p.breakDuration.trim()) return 'Add how long you’ve been away to save.';
  if (!p.availability || typeof p.availability !== 'object' || Array.isArray(p.availability) || Object.entries(p.availability).some(([day, mins]) => !DAY_NAMES.includes(day) || !Number.isFinite(mins) || mins < 10 || mins > 240)) return 'Training sessions must be between 10 and 240 minutes.';
  if (!Array.isArray(p.workouts) || !p.workouts.length || p.workouts.some(w => !WORKOUTS.includes(w))) return 'Choose at least one workout type.';
  if (!Array.isArray(p.equipment) || p.equipment.some(e => !EQUIPMENT.includes(e))) return 'Choose equipment from the available options.';
  if (!p.race || [p.race.name, p.race.location, p.race.date, p.race.target].some(v => typeof v !== 'string' || v.length > 2000) || !Number.isFinite(p.race.distance) || p.race.distance <= 0 || p.race.distance > 100) return 'Check your race details.';
  if (p.race.date && (!/^\d{4}-\d{2}-\d{2}$/.test(p.race.date) || !Number.isFinite(Date.parse(p.race.date)) || new Date(`${p.race.date}T12:00:00Z`).toISOString().slice(0, 10) !== p.race.date)) return 'Choose a valid race date.';
  return null;
}

export const profileStorage = {
  load(accountId: string): { profile: RunnerProfile; warning?: string } {
    let value: string | null;
    try { value = localStorage.getItem(PROFILE_PREFIX + accountId); }
    catch { return { profile: structuredClone(DEFAULT_PROFILE), warning: 'Browser storage is unavailable. Changes will last only until refresh.' }; }
    if (value) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (!validateProfile(parsed)) return { profile: parsed as RunnerProfile };
      } catch { /* Keep corrupt stored content intact until the runner explicitly edits or resets it. */ }
      return { profile: structuredClone(DEFAULT_PROFILE), warning: 'Saved context could not be read. Your original saved data has not been changed.' };
    }
    return { profile: structuredClone(DEFAULT_PROFILE) };
  },
  save(accountId: string, profile: RunnerProfile) {
    const error = validateProfile(profile);
    if (error) throw new Error(error);
    localStorage.setItem(PROFILE_PREFIX + accountId, JSON.stringify(profile));
  },
  reset(accountId: string) { localStorage.removeItem(PROFILE_PREFIX + accountId); },
};

export function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const value = localStorage.getItem(`milemark.${key}`); return allowed.includes(value as T) ? value as T : fallback; } catch { return fallback; }
}
export function saveSetting(key: string, value: string) {
  try { localStorage.setItem(`milemark.${key}`, value); return true; } catch { return false; }
}

// shortcut: fixtures only; replace this source with authorized Strava access when live integration is approved.
export function createActivitySource(now = () => Date.now()) {
  const cache = new Map<string, { value?: Activity[]; expiresAt: number; pending?: Promise<Activity[]> }>();
  return {
    async list(accountId: string, refresh = false): Promise<Activity[]> {
      const entry = cache.get(accountId);
      if (entry?.pending) return entry.pending;
      if (!refresh && entry?.value && entry.expiresAt > now()) return entry.value;
      const next = { value: entry?.value, expiresAt: now() + 5 * 60 * 1000, pending: undefined as Promise<Activity[]> | undefined };
      next.pending = new Promise<Activity[]>(resolve => setTimeout(() => resolve(ACTIVITIES), 300)).then(value => {
        if (cache.get(accountId) === next) cache.set(accountId, { value, expiresAt: now() + 5 * 60 * 1000 });
        return value;
      });
      cache.set(accountId, next);
      return next.pending;
    },
    clear(accountId: string) { cache.delete(accountId); },
  };
}
export const activitySource = createActivitySource();

export function fingerprint(profile: RunnerProfile, model: string) { return JSON.stringify([profile, model]); }

export function validatePreview(profile: RunnerProfile, days: TrainingDay[]) {
  if (days.length !== 7 || new Set(days.map(d => d.date)).size !== 7) throw new Error('A preview must contain seven unique days.');
  for (const day of days) {
    if (day.duration < 0 || day.duration > (profile.availability[day.day] ?? 0)) throw new Error('A preview cannot exceed your available time.');
    if (day.equipment.some(e => !profile.equipment.includes(e))) throw new Error('A preview cannot require unavailable equipment.');
    if ((profile.injuries.trim() || profile.restrictions.trim() || profile.recovery === 'Need more recovery') && day.kind === 'Run') throw new Error('Run suggestions require a recovery review first.');
  }
}

export const coachingGenerator = {
  async generate(profile: RunnerProfile, model: string): Promise<AnalysisResult> {
    const error = validateProfile(profile);
    if (error) throw new Error(error);
    if (!Object.keys(profile.availability).length) throw new Error('Choose at least one available day before generating a preview.');
    const monday = new Date(`${DEMO_DATE}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + (8 - monday.getUTCDay()) % 7);
    const needsReview = !!(profile.injuries.trim() || profile.restrictions.trim()) || profile.recovery === 'Need more recovery';
    let session = 0;
    const raceDate = profile.race.date ? new Date(`${profile.race.date}T12:00:00Z`) : null;
    const raceNear = raceDate !== null && Math.abs(raceDate.getTime() - monday.getTime()) / 86400000 <= 10;
    const days: TrainingDay[] = DAY_NAMES.map((day, index) => {
      const date = new Date(monday); date.setUTCDate(date.getUTCDate() + index);
      const base = { day, date: date.toISOString().slice(0, 10), equipment: [] as string[] };
      const available = profile.availability[day];
      if (!available || needsReview) return { ...base, kind: 'Rest', title: needsReview ? 'Recovery comes first' : 'A proper rest day', duration: 0, target: 'No target today', purpose: needsReview ? 'Review your symptoms and restrictions with a qualified professional before using a training plan.' : 'Make space for your next good run. Rest is part of the work.', preparation: 'Keep it comfortable. No catching up on missed training.' };
      session++;
      if (session === 2 && profile.workouts.includes('Strength') && !raceNear) return { ...base, kind: 'Strength', title: 'Build your foundation', duration: Math.min(25, available), target: 'Comfortable, controlled movement', purpose: 'An illustrative strength session alongside your running.', preparation: '5 minutes of gentle movement, then easy bodyweight exercises. Stop if anything hurts.', equipment: profile.equipment.includes('Yoga mat') ? ['Yoga mat'] : [], exercises: ['Bodyweight sit-to-stand · 2 × 8', 'Standing calf raises · 2 × 10', 'Glute bridges · 2 × 8', 'Rest 60 seconds between sets'] };
      if (!profile.workouts.includes('Running')) {
        const title = profile.workouts.includes('Walking') ? 'A comfortable walk' : profile.workouts.includes('Cycling') ? 'An easy spin' : profile.workouts.includes('Swimming') ? 'Easy time in the pool' : 'Gentle mobility';
        return { ...base, kind: 'Recovery', title, duration: Math.min(25, available), target: 'Easy effort · full-sentence conversation', purpose: 'An example based on your selected activities.', preparation: 'Start gently and finish feeling comfortable.' };
      }
      const beginner = profile.experience === 'Beginner' || profile.experience === 'Returning';
      const duration = Math.min(available, raceNear || profile.recovery === 'A little tired' ? 25 : beginner ? 25 : day === 'Sun' ? 45 : 35);
      return { ...base, kind: 'Run', title: beginner ? 'Easy run / walk' : day === 'Sun' && !raceNear ? 'Unhurried Sunday miles' : 'Keep it conversational', duration, distance: beginner ? undefined : Number((duration / (400 / 60)).toFixed(1)), target: beginner ? 'Easy effort · use walk breaks freely' : '6:40–7:10 /km · example only', purpose: raceNear ? 'A lighter example near your selected race date. No last-minute catch-up.' : 'Practice consistency at a comfortable effort. This pace is illustrative, not a personal prescription.', preparation: 'Includes 5 minutes of walking to warm up and 5 minutes to cool down.' };
    });
    validatePreview(profile, days);
    await new Promise(resolve => setTimeout(resolve, 650));
    return { fingerprint: fingerprint(profile, model), generatedAt: new Date().toISOString(), model, source: 'demo', days };
  },
};
