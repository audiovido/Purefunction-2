export type Role = 'coach' | 'client';

export type CoachTab =
  | 'clients'
  | 'assessment'
  | 'workout-builder'
  | 'library'
  | 'progress'
  | 'reports';

export type ClientTab = 'today' | 'progress';

export interface RomMovement {
  id: string;
  name: string;
  left: number;
  right: number;
  normalMax?: number;
}

export interface InBodyData {
  weight: number;
  skeletalMuscleMass: number;
  bodyFatMass: number;
  bodyFatPercent: number;
  visceralFatLevel: number;
  bmr: number;
  inBodyScore: number;
  segments: {
    leftArm: number;
    rightArm: number;
    trunk: number;
    leftLeg: number;
    rightLeg: number;
  };
  printoutUploaded: boolean;
  printoutFileName?: string;
}

export interface PriTestItem {
  id: string;
  name: string;
  category: 'Pelvis' | 'Ribcage' | 'Shoulder';
  leftResult: string;
  rightResult: string;
  status: 'Asymmetric' | 'Neutral' | 'Improved';
  notes: string;
}

export interface GaitPostureItem {
  id: string;
  view: 'Anterior' | 'Lateral' | 'Posterior' | 'Dynamic Gait';
  checkpoint: string;
  finding: string;
  severity: 'Optimal' | 'Mild' | 'Moderate';
}

export interface StrengthTestItem {
  id: string;
  exercise: string;
  loadKg: number;
  reps: number;
}

export interface VideoAssessmentItem {
  id: string;
  title: string;
  angle: string;
  duration: string;
  keyCue: string;
  week0Score: number;
  currentScore: number;
}

export interface Exercise {
  id: string;
  name: string;
  bodyPart: 'Hips' | 'Lower' | 'Upper' | 'Core';
  plane: 'Sagittal' | 'Frontal' | 'Transverse';
  equipment: 'Bodyweight' | 'Dumbbell' | 'Barbell' | 'Cable / Band' | 'Foam Roller';
  phase: 'Reposition' | 'Integrate' | 'Strength' | 'Performance';
  illustrationType:
    | 'hip-lift'
    | 'goblet-squat'
    | 'clam'
    | 'hip-rotation'
    | 'rdl'
    | 'belly-lift'
    | 'split-squat'
    | 'landmine-press'
    | 'wall-squat'
    | 'pallof-press';
  durationSec: number;
  cues: string[];
  breathingPattern: string;
  whyItMatters: string;
}

export interface WorkoutSetLog {
  setNumber: number;
  kg: number;
  reps: number;
  completed: boolean;
}

export interface WorkoutExerciseBlock {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  targetReps: number;
  loadKg: number;
  restSec: number;
  cue: string;
  lastTimeLoadKg: number;
  lastTimeRepsPerSet: number[]; // e.g., [8, 8, 8] -> all hit if >= targetReps
  loggedSets: WorkoutSetLog[];
}

export interface DayWorkout {
  dayKey: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  dayLabel: string;
  title: string;
  focus: string;
  durationMin: number;
  isRestDay?: boolean;
  blocks: WorkoutExerciseBlock[];
}

export interface ProgressSeriesPoint {
  week: number;
  squat1RM: number;
  rdl1RM: number;
  bench1RM: number;
  muscleMass: number;
  fatMass: number;
  bodyFatPercent: number;
  hipIrAsymmetry: number;
  shoulderIrAsymmetry: number;
  ankleAsymmetry: number;
  adherenceCompleted: number;
  adherenceTotal: number;
}

export interface MonthlyReportData {
  month: 1 | 2 | 3;
  weeksLabel: string;
  phaseCompleted: string;
  nextPhase: string;
  coachSummary: string;
  nextPhaseFocus: string[];
  metrics: {
    weightKg: { week0: number; current: number; unit: string };
    muscleMassKg: { week0: number; current: number; unit: string };
    bodyFatPct: { week0: number; current: number; unit: string };
    hipIrAsymmetryPct: { week0: number; current: number; unit: string };
    squat1RmKg: { week0: number; current: number; unit: string };
    adherencePct: { week0: number; current: number; unit: string };
  };
}

export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  avatarId: string;
  phaseNumber: 1 | 2 | 3 | 4;
  phaseName: 'Reposition' | 'Foundations' | 'Integrate' | 'Strength' | 'Performance';
  currentWeek: number;
  adherenceCompleted: number;
  adherenceTotal: number;
  nextAssessmentDays: number;
  unreadMessages: number;
  inBody: InBodyData;
  rom: RomMovement[];
  priTests: PriTestItem[];
  gaitPosture: GaitPostureItem[];
  strengthTests: StrengthTestItem[];
  videos: VideoAssessmentItem[];
  weeklyWorkouts: DayWorkout[];
  progressHistory: ProgressSeriesPoint[];
  monthlyReports: Record<1 | 2 | 3, MonthlyReportData>;
}

/**
 * Asymmetry formula specified by user:
 * asymmetry % = |L - R| / max(L, R) * 100
 */
export function calculateAsymmetryPercent(left: number, right: number): number {
  const l = Math.max(0, Number(left) || 0);
  const r = Math.max(0, Number(right) || 0);
  const maxVal = Math.max(l, r);
  if (maxVal === 0) return 0;
  return Math.round((Math.abs(l - r) / maxVal) * 100);
}

/**
 * Suggested load rule specified by user:
 * +2.5 kg if all target reps were hit last time.
 */
export function getSuggestedLoad(block: WorkoutExerciseBlock): {
  suggestedKg: number;
  allRepsHitLastTime: boolean;
  deltaKg: number;
} {
  const allHit =
    block.lastTimeRepsPerSet.length > 0 &&
    block.lastTimeRepsPerSet.every((r) => r >= block.targetReps);

  if (allHit && block.lastTimeLoadKg > 0) {
    return {
      suggestedKg: Number((block.lastTimeLoadKg + 2.5).toFixed(1)),
      allRepsHitLastTime: true,
      deltaKg: 2.5,
    };
  }
  return {
    suggestedKg: block.lastTimeLoadKg,
    allRepsHitLastTime: false,
    deltaKg: 0,
  };
}

/**
 * Epley 1RM formula: weight * (1 + reps / 30)
 */
export function calculateEstimated1RM(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(loadKg);
  return Math.round(loadKg * (1 + reps / 30));
}
