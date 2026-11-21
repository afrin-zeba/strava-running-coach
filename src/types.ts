export type Experience = 'Beginner' | 'Intermediate' | 'Advanced' | 'Returning';
export type Workout = 'Running' | 'Walking' | 'Cycling' | 'Swimming' | 'Strength' | 'Mobility / yoga';
export type Recovery = 'Ready to go' | 'A little tired' | 'Need more recovery';
export type Goal = 'First half marathon' | 'Faster half marathon' | 'Build endurance' | 'Run consistently' | 'Return to running' | 'Custom goal';
export type ThemeMode = 'light' | 'dark' | 'system';
export type ConnectionState = 'demo' | 'disconnected' | 'loading' | 'empty' | 'stale' | 'expired' | 'subscription-required' | 'rate-limit' | 'error';

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
  pace: number;
  elevation: number;
  heartRate?: number;
  maxHeartRate?: number;
  cadence: number;
  effort: 'Easy' | 'Steady' | 'Long run';
  route?: [number, number][];
  streams: { distance: number; pace: number; elevation: number; heartRate?: number }[];
  splits: { km: string; distance: number; time: number; pace: number }[];
  zones?: { name: string; label: string; seconds: number; color: string }[];
  source: 'demo';
}

export interface TrainingDay {
  date: string;
  day: string;
  kind: 'Run' | 'Strength' | 'Recovery' | 'Rest';
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
  source: 'demo';
  days: TrainingDay[];
}
