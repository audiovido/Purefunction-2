import type { ClientProfile, Workout } from '../types';

/** A crash-safe, user-scoped journal; no uncommitted change is silently called Saved. */
export interface PendingEntry<T> { value: T | null; expected: string | null }
export interface PendingJournal {
  clients: Record<string, PendingEntry<ClientProfile>>;
  workouts: Record<string, PendingEntry<{ clientId: string; workout: Workout }>>;
  notes: Record<string, PendingEntry<ClientProfile['coachNotes']>>;
}
export const emptyJournal = (): PendingJournal => ({ clients: {}, workouts: {}, notes: {} });
export const hasPending = (j: PendingJournal) =>
  Object.keys(j.clients).length > 0 || Object.keys(j.workouts).length > 0 || Object.keys(j.notes).length > 0;
export const pendingKey = (userId: string) => `pf.pending.v1.${userId}`;
export function loadJournal(userId: string): PendingJournal {
  if (!userId) return emptyJournal();
  try {
    const value: unknown = JSON.parse(localStorage.getItem(pendingKey(userId)) || 'null');
    if (value && typeof value === 'object' && 'clients' in value && 'workouts' in value) {
      const candidate = value as PendingJournal;
      if (candidate.clients && candidate.workouts) return { ...candidate, notes: candidate.notes ?? {} };
    }
  } catch { /* storage disabled; caller will show Not saved */ }
  return emptyJournal();
}
export function persistJournal(userId: string, journal: PendingJournal): boolean {
  if (!userId) return false;
  try {
    if (hasPending(journal)) localStorage.setItem(pendingKey(userId), JSON.stringify(journal));
    else localStorage.removeItem(pendingKey(userId));
    return true;
  } catch { return false; }
}
export function changedFields<T>(oldValue: T, nextValue: T): boolean {
  return JSON.stringify(oldValue) !== JSON.stringify(nextValue);
}
/** Never replay an old version over a newer server document. */
export function mayReplay(expected: string | null, actual: string | null): boolean {
  return expected === actual;
}
