import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Exercise } from '../types';
import { EXERCISES_LIBRARY } from '../data/mockData';
import { usePersistentState } from '../lib/storage';
import { deleteVideoFile } from '../lib/videoStore';
import { useSession } from '../cloud/Session';
import { stableStringify, supabase } from '../cloud/supabase';
import { deleteExerciseVideo } from '../cloud/videos';

/**
 * Exercise library = Pure Function core set + the imported 1,200+ catalog
 * (loaded in the background so the first screen stays fast) + the coach's
 * own changes. Only the coach's changes are saved; the built-in lists ship
 * with the app.
 */

interface CoachEdits {
  /** Coach-created exercises and edited copies of built-in ones, by id. */
  edits: Record<string, Exercise>;
}

interface ExerciseLibraryValue {
  exercises: Exercise[];
  catalogLoaded: boolean;
  getExercise: (id: string) => Exercise | undefined;
  saveExercise: (exercise: Exercise) => void;
  deleteExercise: (id: string) => void;
}

const CORE: Exercise[] = EXERCISES_LIBRARY.map((e) => ({ ...e, source: 'pf' as const }));

function migrateV1(): CoachEdits {
  try {
    const raw = localStorage.getItem('pf.exercises.v1');
    if (raw) {
      const list = JSON.parse(raw) as Exercise[];
      const edits: Record<string, Exercise> = {};
      for (const e of list) {
        if (e.isCustom || e.video) edits[e.id] = e.isCustom ? { ...e, source: 'coach' } : e;
      }
      return { edits };
    }
  } catch {
    /* ignore */
  }
  return { edits: {} };
}

const ExerciseLibraryContext = createContext<ExerciseLibraryValue | null>(null);

export const ExerciseLibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useSession();
  const cloud = status !== 'local';
  const [localEdits, setLocalEdits] = usePersistentState<CoachEdits>('pf.exercises.v2', migrateV1);
  const [cloudEdits, setCloudEdits] = useState<CoachEdits>({ edits: {} });
  const coach = cloud ? cloudEdits : localEdits;
  const setCoach = cloud ? setCloudEdits : setLocalEdits;

  // Cloud: the coach's exercises live in the database (everyone signed in can read them).
  useEffect(() => {
    if (!supabase || status !== 'ready') return;
    let cancelled = false;
    supabase
      .from('exercises')
      .select('id, data')
      .then(({ data }) => {
        if (cancelled || !data) return;
        const edits: Record<string, Exercise> = {};
        for (const r of data as { id: string; data: Exercise }[]) edits[r.id] = { ...r.data, id: r.id };
        setCloudEdits({ edits });
      });
    const channel = supabase
      .channel('pf-exercises')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercises' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (!id) return;
          setCloudEdits((c) => {
            const edits = { ...c.edits };
            delete edits[id];
            return { edits };
          });
          return;
        }
        const r = payload.new as { id: string; data: Exercise };
        setCloudEdits((c) =>
          stableStringify(c.edits[r.id]) === stableStringify({ ...r.data, id: r.id })
            ? c
            : { edits: { ...c.edits, [r.id]: { ...r.data, id: r.id } } }
        );
      })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase?.removeChannel(channel);
    };
  }, [status]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('../data/exerciseCatalog.json')
      .then((m) => {
        if (!cancelled) {
          setCatalog(m.default as unknown as Exercise[]);
          setCatalogLoaded(true);
        }
      })
      .catch(() => setCatalogLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const exercises = useMemo(() => {
    const builtIn = [...CORE, ...catalog];
    const builtInIds = new Set(builtIn.map((e) => e.id));
    const customs = Object.values(coach.edits)
      .filter((e) => !builtInIds.has(e.id))
      .sort((a, b) => b.id.localeCompare(a.id)); // newest first
    return [...customs, ...builtIn.map((e) => coach.edits[e.id] ?? e)];
  }, [catalog, coach]);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const saveExercise = (exercise: Exercise) => {
    const previous = byId.get(exercise.id);
    if (previous?.video && previous.video.src !== exercise.video?.src) {
      if (previous.video.kind === 'file') void deleteVideoFile(previous.video.src);
      if (previous.video.kind === 'storage') void deleteExerciseVideo(previous.video.src);
    }
    setCoach((c) => ({ edits: { ...c.edits, [exercise.id]: exercise } }));
    if (cloud && supabase) {
      void supabase
        .from('exercises')
        .upsert({ id: exercise.id, data: exercise }, { onConflict: 'id' })
        .then(({ error }) => error && console.error('[exercises] save failed:', error.message));
    }
  };

  const deleteExercise = (id: string) => {
    const ex = byId.get(id);
    if (!ex?.isCustom) return; // built-in exercises can't be deleted
    if (ex.video?.kind === 'file') void deleteVideoFile(ex.video.src);
    if (ex.video?.kind === 'storage') void deleteExerciseVideo(ex.video.src);
    setCoach((c) => {
      const edits = { ...c.edits };
      delete edits[id];
      return { edits };
    });
    if (cloud && supabase) void supabase.from('exercises').delete().eq('id', id);
  };

  return (
    <ExerciseLibraryContext.Provider
      value={{ exercises, catalogLoaded, getExercise: (id) => byId.get(id), saveExercise, deleteExercise }}
    >
      {children}
    </ExerciseLibraryContext.Provider>
  );
};

export function useExerciseLibrary(): ExerciseLibraryValue {
  const ctx = useContext(ExerciseLibraryContext);
  if (!ctx) throw new Error('useExerciseLibrary must be used inside ExerciseLibraryProvider');
  return ctx;
}

/** Shared search used by the library and the workout builder. */
export function searchExercises(
  list: Exercise[],
  q: string,
  filters: { bodyPart?: string; equipment?: string; plane?: string; pattern?: string } = {}
): Exercise[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((ex) => {
    if (filters.bodyPart && filters.bodyPart !== 'All' && ex.bodyPart !== filters.bodyPart) return false;
    if (filters.equipment && filters.equipment !== 'All' && ex.equipment !== filters.equipment) return false;
    if (filters.plane && filters.plane !== 'All' && ex.plane !== filters.plane) return false;
    if (filters.pattern && filters.pattern !== 'All' && ex.pattern !== filters.pattern) return false;
    if (!words.length) return true;
    const hay = `${ex.name} ${ex.bodyPart} ${ex.pattern ?? ''} ${ex.plane ?? ''} ${ex.equipment} ${(ex.muscles ?? []).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
