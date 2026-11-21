import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITIES, DEFAULT_PROFILE, getTrend, paceLabel } from './data';
import { coachingGenerator, createActivitySource, profileStorage, validatePreview, validateProfile } from './services';
import type { RunnerProfile } from './types';

const freshProfile = (): RunnerProfile => structuredClone(DEFAULT_PROFILE);
const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('synthetic activity consistency', () => {
  it('keeps distance, split duration, and zones aligned for every sample', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(70);
    for (const run of ACTIVITIES) {
      expect(run.splits.reduce((sum, s) => sum + s.distance, 0)).toBeCloseTo(run.distance, 2);
      expect(run.splits.reduce((sum, s) => sum + s.time, 0)).toBe(run.movingTime);
      expect(run.streams.at(-1)?.distance).toBe(run.distance);
      if (run.zones) expect(run.zones.reduce((sum, z) => sum + z.seconds, 0)).toBe(run.movingTime);
    }
    expect(ACTIVITIES.some(a => !a.route)).toBe(true);
    expect(ACTIVITIES.some(a => a.heartRate === undefined)).toBe(true);
  });
  it('compares only available history and never invents an improvement', () => {
    expect(getTrend(ACTIVITIES, 6).selected.length).toBeGreaterThan(getTrend(ACTIVITIES, 1).selected.length);
    expect(getTrend(ACTIVITIES.slice(0, 1), 6).improvement).toBeNull();
    expect(getTrend(ACTIVITIES.map(a => ({ ...a, heartRate: undefined })), 6).improvement).toBeNull();
    expect(getTrend([], 3).chart).toEqual([]);
    expect(paceLabel(359.7)).toBe('6:00');
  });
});

describe('runner profiles', () => {
  it('stores profiles separately and resets only the selected account', () => {
    const a = freshProfile(); a.diet = 'Profile one meals';
    const b = freshProfile(); b.diet = 'Profile two meals';
    profileStorage.save('one', a); profileStorage.save('two', b);
    expect(profileStorage.load('one').profile.diet).toBe(a.diet);
    expect(profileStorage.load('two').profile.diet).toBe(b.diet);
    profileStorage.reset('one');
    expect(profileStorage.load('two').profile.diet).toBe(b.diet);
    expect(profileStorage.load('one').profile.diet).toBe(DEFAULT_PROFILE.diet);
  });
  it('handles corrupt storage without overwriting the original', () => {
    memory.set('milemark.profile.v1.one', '{bad json');
    expect(profileStorage.load('one').warning).toBeTruthy();
    expect(memory.get('milemark.profile.v1.one')).toBe('{bad json');
  });
  it('rejects malformed profiles and unfinished conditional fields', () => {
    expect(validateProfile({ ...freshProfile(), experience: 'Returning' })).toContain('away');
    expect(validateProfile({ ...freshProfile(), goal: 'Custom goal' })).toContain('custom goal');
    expect(validateProfile({ ...freshProfile(), availability: { Mon: 999 } })).toContain('240');
    expect(validateProfile({ ...freshProfile(), workouts: [] })).toContain('workout');
    expect(validateProfile({ ...freshProfile(), race: { ...DEFAULT_PROFILE.race, date: '2026-02-31' } })).toContain('valid race date');
    expect(validateProfile(null)).toBeTruthy();
    expect(validateProfile({ ...freshProfile(), diet: 4 })).toBeTruthy();
  });
  it('surfaces storage failures rather than pretending context was saved', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
    expect(profileStorage.load('one').warning).toContain('unavailable');
    expect(() => profileStorage.save('one', freshProfile())).toThrow('quota');
  });
});

describe('demo activity cache', () => {
  it('deduplicates requests, reuses fresh results, and expires by account', async () => {
    vi.useFakeTimers(); let now = 1000;
    const source = createActivitySource(() => now);
    let firstDone = false, secondDone = false;
    const a = source.list('one').then(v => { firstDone = true; return v; });
    const b = source.list('one').then(v => { secondDone = true; return v; });
    await vi.advanceTimersByTimeAsync(300);
    expect(await a).toBe(await b); expect(firstDone && secondDone).toBe(true);
    expect(await source.list('one')).toBe(ACTIVITIES);
    now += 300001;
    let expiredDone = false;
    const expired = source.list('one').then(() => { expiredDone = true; });
    await Promise.resolve(); expect(expiredDone).toBe(false);
    await vi.advanceTimersByTimeAsync(300); await expired;
    source.clear('one');
    let clearedDone = false;
    const cleared = source.list('one').then(() => { clearedDone = true; });
    await Promise.resolve(); expect(clearedDone).toBe(false);
    await vi.advanceTimersByTimeAsync(300); await cleared;
  });
});

describe('illustrative schedule constraints', () => {
  async function generate(p: RunnerProfile) {
    const pending = coachingGenerator.generate(p, 'demo-model');
    await vi.advanceTimersByTimeAsync(650);
    return pending;
  }
  it('includes seven unique days without exceeding availability or equipment', async () => {
    vi.useFakeTimers(); const p = freshProfile();
    const result = await generate(p);
    expect(result.days).toHaveLength(7);
    expect(result.days[0].date).toBe('2026-11-23');
    expect(result.source).toBe('demo');
    expect(result.days.filter(d => d.kind !== 'Rest')).toHaveLength(4);
    expect(() => validatePreview(p, result.days)).not.toThrow();
    for (const d of result.days) expect(d.duration).toBeLessThanOrEqual(p.availability[d.day] ?? 0);
  });
  it('holds running for injury, restrictions, or low recovery', async () => {
    vi.useFakeTimers();
    for (const change of [{ injuries: 'Knee pain' }, { restrictions: 'No running yet' }, { recovery: 'Need more recovery' as const }]) {
      const result = await generate({ ...freshProfile(), ...change });
      expect(result.days.every(d => d.kind === 'Rest')).toBe(true);
    }
  });
  it('uses effort rather than a precise pace for a returning runner', async () => {
    vi.useFakeTimers(); const p = { ...freshProfile(), experience: 'Returning' as const, breakDuration: '6 months' };
    const result = await generate(p);
    expect(result.days.filter(d => d.kind === 'Run').every(d => d.duration <= 25 && d.distance === undefined && d.target.includes('walk breaks'))).toBe(true);
  });
  it('rejects an externally supplied schedule that exceeds available time', async () => {
    vi.useFakeTimers(); const p = freshProfile(); const result = await generate(p);
    result.days[0].duration = 999;
    expect(() => validatePreview(p, result.days)).toThrow('available time');
  });
});
