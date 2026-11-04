import { describe, expect, it } from 'vitest';
import type { Workout } from '../../types';
import { calendarStatus, tabletDayStart } from '../../components/coach/WeeklyWorkoutCalendar';

const workout = (status: Workout['status'], completed = false): Workout => ({
  id: 'w-test', date: '2026-11-05', title: 'Strength', focus: '', status,
  blocks: [{
    id: 'b-test', exerciseId: 'ex-test', name: 'Squat', sets: 2, reps: '8',
    loadKg: 20, restSec: 90, notes: '',
    loggedSets: [
      { setNumber: 1, kg: 20, reps: completed ? 8 : null, completed },
      { setNumber: 2, kg: 20, reps: null, completed: false }
    ]
  }]
});

describe('weekly calendar, read-only status presentation', () => {
  it('does not label future planned workouts as missed', () => {
    expect(calendarStatus(workout('planned'), '2026-11-04').label).toBe('Planned');
  });
  it('distinguishes actual partial results and completed status', () => {
    expect(calendarStatus(workout('planned', true), '2026-11-04').label).toBe('Partially completed');
    expect(calendarStatus(workout('completed', true), '2026-11-04').label).toBe('Completed');
  });
  it('keeps all seven dates reachable in 3-column tablet windows', () => {
    expect(Array.from({ length: 7 }, (_, i) => tabletDayStart(i))).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });
});
