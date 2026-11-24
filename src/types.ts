export type Experience = 'Beginner' | 'Intermediate' | 'Advanced' | 'Returning';
export type Workout = 'Running' | 'Walking' | 'Cycling' | 'Swimming' | 'Strength' | 'Mobility / yoga';
export type Recovery = 'Ready to go' | 'A little tired' | 'Need more recovery';
export type Goal = 'First half marathon' | 'Faster half marathon' | 'Build endurance' | 'Run consistently' | 'Return to running' | 'Custom goal';
export type ThemeMode = 'light' | 'dark' | 'system';
export type ConnectionState = 'demo' | 'disconnected' | 'loading' | 'empty' | 'stale' | 'expired' | 'subscription-required' | 'rate-limit' | 'error';

export interface StravaStatus {
  state: 'disconnected' | 'authorizing' | 'connected' | 'expired' | 'setup-required' | 'provider-error' | 'subscription-required' | 'rate-limit' | 'error';
  message: string;
  code?: string;
  canDisconnect?: boolean;
  athlete?: { id: string; name: string };
  retryAfter?: number;
}

export interface RunnerProfile {
  goal: Goal;
  customGoal: string;
  experience: Experience;
  breakDuration: string;
  availability: Record<string, number>;
  workouts: Workout[];
  equipment: string[];
  injuries: string;
  restrictions: string;
  diet: string;
  dietPreference: string;
  allergies: string;
  avoidedFoods: string;
  recovery: Recovery;
  race: { name: string; distance: number; date: string; location: string; target: string };
}

export interface Activity {
  id: string;
  title: string;
  date: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  pace?: number;
  elevation?: number;
  heartRate?: number;
  maxHeartRate?: number;
  cadence?: number;
  effort: 'Easy' | 'Steady' | 'Long run' | 'Unclassified';
  sportType?: string;
  detailLoaded?: boolean;
  warnings?: string[];
  expiresAt?: number;
  zone2?: { seconds: number; distance: number };
  route?: [number, number][];
  streams: { time?: number; distance: number; pace?: number; elevation?: number; heartRate?: number }[];
  splits: { km: string; distance: number; time: number; pace: number }[];
  zones?: { name: string; label: string; seconds: number; color: string }[];
  source: 'demo' | 'strava';
}

export interface TrainingDay {
  date: string;
  day: string;
  kind: 'Run' | 'Strength' | 'Recovery' | 'Rest' | 'Cross-training';
  workout?: Workout;
  title: string;
  duration: number;
  distance?: number;
  target: string;
  purpose: string;
  preparation: string;
  equipment: string[];
  exercises?: string[];
}

export interface AnalysisResult {
  fingerprint: string;
  generatedAt: string;
  model: string;
  source: 'demo' | 'openrouter';
  days: TrainingDay[];
  improvement?: { factId: string; explanation: string }[];
  diet?: { title: string; suggestion: string; timing: string }[];
  projections?: { condition: string; possibility: string; uncertainty: string }[];
  motivation?: { text: string; factId: string | null };
  facts?: { id: string; label: string; value: number; unit: string }[];
  coverage?: string;
  validUntil?: number;
}

export interface ModelOption { id: string; name: string; detail: string; contextLength: number }
export interface ActivityPage { activities: Activity[]; nextBefore: number | null; fetchedAt: number }
export interface HistoryCoverage { after: string; through: string; complete: boolean }
