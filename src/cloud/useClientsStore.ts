import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ClientProfile, Workout } from '../types';
import { INITIAL_CLIENTS } from '../data/mockData';
import { migrateClient } from '../lib/workouts';
import { usePersistentState } from '../lib/storage';
import { stableStringify, supabase } from './supabase';
import type { Profile } from './Session';

export type SyncState = 'saved' | 'saving' | 'error' | 'offline';

export interface ClientsStore {
  clients: ClientProfile[];
  setClients: (update: (prev: ClientProfile[]) => ClientProfile[]) => void;
  loaded: boolean;
  sync: SyncState;
  loadError: string | null;
  saveConflict?: string | null;
}

/* ---------------------------------------------------------------------------
 * Local demo mode (no cloud): everything stays in this browser
 * ------------------------------------------------------------------------- */

function loadLocalClients(): ClientProfile[] {
  try {
    const old = localStorage.getItem('pf.clients.v1');
    if (old) return (JSON.parse(old) as ClientProfile[]).map((c) => migrateClient(c));
  } catch {
    /* ignore */
  }
  return INITIAL_CLIENTS.map((c) => migrateClient(c));
}

export function useLocalClientsStore(): ClientsStore {
  const [clients, setClients] = usePersistentState<ClientProfile[]>('pf.clients.v2', loadLocalClients);
  return { clients, setClients, loaded: true, sync: 'saved', loadError: null };
}

/* ---------------------------------------------------------------------------
 * Cloud mode: one row per client (profile, without workouts) and one row per
 * workout, so the coach editing a program and the client logging a session
 * never overwrite each other's rows. Writes go out shortly after each change
 * (only rows that changed); changes from other devices arrive live.
 * ------------------------------------------------------------------------- */

interface ClientRow {
  id: string;
  email: string;
  data: Omit<ClientProfile, 'workouts' | 'weeklyWorkouts'>;
}
interface WorkoutRow {
  id: string;
  client_id: string;
  date: string;
  data: Workout;
  updated_at?: string;
}
interface SecureNoteRow {
  id: string;
  client_id: string;
  date: string;
  text: string;
  shared: boolean;
  pinned: boolean;
}
const noteRow = (id: string, note: NonNullable<ClientProfile['coachNotes']>[number]): SecureNoteRow => ({
  id: note.id, client_id: id, date: note.date, text: note.text,
  shared: !!note.shared, pinned: !!note.pinned
});
const resultPayload = (w: Workout) => ({
  status: w.status, completedAt: w.completedAt ?? null,
  sessionRpe: w.sessionRpe ?? null, clientFeedback: w.clientFeedback ?? null,
  blocks: w.blocks.map((b) => ({
    id: b.id, loggedSets: b.loggedSets,
    rpe: b.rpe ?? null, pain: !!b.pain, clientNote: b.clientNote ?? null
  }))
});

const clientRow = (c: ClientProfile): ClientRow => {
  const { workouts: _w, weeklyWorkouts: _ww, coachNotes: _notes, ...doc } = c;
  return { id: c.id, email: (c.email ?? '').trim().toLowerCase(), data: doc };
};
const workoutRow = (clientId: string, w: Workout): WorkoutRow => ({
  id: w.id,
  client_id: clientId,
  date: w.date,
  data: w
});

const sortWorkouts = (list: Workout[]) => [...list].sort((a, b) => a.date.localeCompare(b.date));

export function useCloudClientsStore(profile: Profile | null): ClientsStore {
  const [clients, setState] = useState<ClientProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const conflictRef = useRef(false);
  const [saveConflict, setSaveConflict] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>('saved');

  const current = useRef<ClientProfile[]>([]);
  // what the server has, as last sent or received (row id -> stable JSON)
  const pushedClients = useRef(new Map<string, string>());
  const pushedWorkouts = useRef(new Map<string, string>());
  const workoutVersions = useRef(new Map<string, string>());
  const pushedNotes = useRef(new Map<string, string>());
  const timer = useRef<number | null>(null);
  const flushing = useRef(false);
  const again = useRef(false);

  const isCoach = profile?.role === 'coach';

  /* ---------------- initial load ---------------- */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || !profile) return;
    let cancelled = false;
    (async () => {
      if (loadedFor.current !== profile.id) setLoaded(false); // first load only: later refreshes stay silent
      const [c, w, n] = await Promise.all([
        supabase.from('clients').select('id, email, data'),
        supabase.from('workouts').select('id, client_id, date, data, updated_at'),
        supabase.from('coach_notes_secure').select('id, client_id, date, text, shared, pinned')
      ]);
      if (cancelled) return;
      if (c.error || w.error || n.error) {
        setLoadError((c.error ?? w.error ?? n.error)!.message);
        setLoaded(true);
        return;
      }
      const byClient = new Map<string, Workout[]>();
      const byNoteClient = new Map<string, NonNullable<ClientProfile['coachNotes']>>();
      pushedNotes.current.clear();
      for (const row of (n.data ?? []) as SecureNoteRow[]) {
        pushedNotes.current.set(row.id, stableStringify(row));
        const notes = byNoteClient.get(row.client_id) ?? [];
        notes.push({ id: row.id, date: row.date, text: row.text, shared: row.shared, pinned: row.pinned });
        byNoteClient.set(row.client_id, notes);
      }
      pushedWorkouts.current.clear();
      workoutVersions.current.clear();
      for (const r of (w.data ?? []) as WorkoutRow[]) {
        const wo = { ...r.data, id: r.id, date: r.date };
        pushedWorkouts.current.set(r.id, stableStringify(workoutRow(r.client_id, wo)));
        if (r.updated_at) workoutVersions.current.set(r.id, r.updated_at);
        byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), wo]);
      }
      pushedClients.current.clear();
      const list = ((c.data ?? []) as ClientRow[])
        .map((r) => {
          const profileDoc = { ...r.data, id: r.id, email: r.email, coachNotes: byNoteClient.get(r.id) ?? [] } as ClientProfile;
          pushedClients.current.set(r.id, stableStringify(clientRow({ ...profileDoc, workouts: [] })));
          return { ...profileDoc, workouts: sortWorkouts(byClient.get(r.id) ?? []) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      current.current = list;
      setState(list);
      setLoadError(null);
      loadedFor.current = profile.id;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  /* ---------------- writes ---------------- */
  const flush = useCallback(async () => {
    if (!supabase) return;
    if (flushing.current) {
      again.current = true;
      return;
    }
    flushing.current = true;
    setSync('saving');
    let failed = false;
    try {
      const list = current.current;
      const liveClientIds = new Set(list.map((c) => c.id));
      const liveWorkouts = new Map<string, { json: string; row: WorkoutRow }>();
      for (const c of list) {
        for (const w of c.workouts ?? []) {
          const row = workoutRow(c.id, w);
          liveWorkouts.set(w.id, { json: stableStringify(row), row });
        }
      }

      // 1) deletions first (frees the one-workout-per-day slot for replacements)
      if (isCoach) {
        const goneWorkouts = [...pushedWorkouts.current.keys()].filter((id) => !liveWorkouts.has(id));
        if (goneWorkouts.length) {
          const { error } = await supabase.from('workouts').delete().in('id', goneWorkouts);
          if (error) throw error;
          goneWorkouts.forEach((id) => { pushedWorkouts.current.delete(id); workoutVersions.current.delete(id); });
        }
        const goneClients = [...pushedClients.current.keys()].filter((id) => !liveClientIds.has(id));
        if (goneClients.length) {
          const { error } = await supabase.from('clients').delete().in('id', goneClients);
          if (error) throw error;
          goneClients.forEach((id) => pushedClients.current.delete(id));
        }
      }

      // 2) client profiles that changed (before their workouts: foreign key)
      const changedClients = list
        .map((c) => {
          const row = clientRow(c);
          return { row, json: stableStringify(row) };
        })
        .filter((x) => pushedClients.current.get(x.row.id) !== x.json);
      if (changedClients.length) {
        if (isCoach) {
          const { error } = await supabase.from('clients').upsert(changedClients.map((x) => x.row), { onConflict: 'id' });
          if (error) throw error;
        } else {
          // A client may only UPDATE their own row (inserting is coach-only), and may not touch the
          // email column, so send just the profile data. An upsert here is rejected by the database
          // and made the app retry forever (e.g. when changing the profile photo).
          for (const x of changedClients) {
            const { data: done, error } = await supabase
              .from('clients')
              .update({ data: x.row.data })
              .eq('id', x.row.id)
              .select('id');
            if (error) throw error;
            if (!done || done.length === 0) throw new Error('Could not save your profile.');
          }
        }
        changedClients.forEach((x) => pushedClients.current.set(x.row.id, x.json));
      }

      // 3) secure coach notes: never put them in clients.data.
      if (isCoach) {
        const liveNotes = new Map<string, SecureNoteRow>();
        for (const c of list) for (const note of c.coachNotes ?? []) {
          liveNotes.set(note.id, noteRow(c.id, note));
        }
        const removed = [...pushedNotes.current.keys()].filter((id) => !liveNotes.has(id));
        if (removed.length) {
          const { error } = await supabase.from('coach_notes_secure').delete().in('id', removed);
          if (error) throw error;
          removed.forEach((id) => pushedNotes.current.delete(id));
        }
        for (const note of liveNotes.values()) {
          const json = stableStringify(note);
          if (pushedNotes.current.get(note.id) === json) continue;
          const { error } = await supabase.from('coach_notes_secure').upsert(note, { onConflict: 'id' });
          if (error) throw error;
          pushedNotes.current.set(note.id, json);
        }
      }

      // 4) version-checked workout writes. Clients can call ONLY the results RPC.
      const changedWorkouts = [...liveWorkouts.values()].filter((x) => pushedWorkouts.current.get(x.row.id) !== x.json);
      for (const x of changedWorkouts) {
        if (isCoach && !workoutVersions.current.has(x.row.id)) {
          const { data, error } = await supabase.from('workouts').insert(x.row).select('updated_at').single();
          if (error) throw error;
          workoutVersions.current.set(x.row.id, data.updated_at);
        } else if (isCoach) {
          const { data, error } = await supabase.from('workouts')
            .update({ data: x.row.data, date: x.row.date })
            .eq('id', x.row.id).eq('updated_at', workoutVersions.current.get(x.row.id)!)
            .select('updated_at');
          if (error) throw error;
          if (!data?.length) throw new Error(`VERSION_CONFLICT:${x.row.id}`);
          workoutVersions.current.set(x.row.id, data[0].updated_at);
        } else {
          const expected = workoutVersions.current.get(x.row.id);
          if (!expected) throw new Error(`VERSION_CONFLICT:${x.row.id}`);
          const { data, error } = await supabase.rpc('save_workout_results_secure', {
            p_workout_id: x.row.id, p_client_id: x.row.client_id,
            p_expected_version: expected, p_results: resultPayload(x.row.data)
          });
          if (error) throw new Error(error.message.includes('VERSION_CONFLICT') ? `VERSION_CONFLICT:${x.row.id}` : error.message);
          if (!data?.length) throw new Error(`VERSION_CONFLICT:${x.row.id}`);
          workoutVersions.current.set(x.row.id, data[0].updated_version);
        }
        pushedWorkouts.current.set(x.row.id, x.json);
      }
    } catch (e) {
      failed = true;
      const message = (e as { message?: string }).message ?? String(e);
      if (message.startsWith('VERSION_CONFLICT')) {
        conflictRef.current = true;
        // Discard stale local workout state and refetch the authoritative server version.
        // Never retry a stale write automatically. User must re-apply their edit.
        const id = message.split(':')[1];
        const { data } = await supabase.from('workouts').select('id, client_id, date, data, updated_at').eq('id', id).maybeSingle();
        if (data) {
          const row = data as WorkoutRow;
          const fresh = { ...row.data, id: row.id, date: row.date };
          workoutVersions.current.set(id, row.updated_at ?? '');
          pushedWorkouts.current.set(id, stableStringify(workoutRow(row.client_id, fresh)));
          current.current = current.current.map((c) => c.id === row.client_id ? {
            ...c, workouts: sortWorkouts([...(c.workouts ?? []).filter((w) => w.id !== id), fresh])
          } : c);
          setState(current.current);
        }
        setSaveConflict('Not saved — another device changed this workout. Latest version reloaded. Please review and re-enter your change.');
      }
      console.error('[sync]', message);
    } finally {
      flushing.current = false;
    }
    if (again.current) {
      again.current = false;
      if (!conflictRef.current) void flush();
      if (conflictRef.current) setSync('error');
      return;
    }
    if (failed) {
      setSync(navigator.onLine === false ? 'offline' : 'error');
      // Do not retry version conflicts: the stale update must never overwrite the server.
      if (!conflictRef.current)
        timer.current = window.setTimeout(() => void flush(), 5000);
    } else {
      conflictRef.current = false;
      setSaveConflict(null);
      setSync('saved');
    }
  }, [isCoach]);

  const setClients = useCallback(
    (update: (prev: ClientProfile[]) => ClientProfile[]) => {
      const next = update(current.current);
      setSaveConflict(null);
      conflictRef.current = false;
      current.current = next;
      setState(next);
      setSync('saving');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 600);
    },
    [flush]
  );

  // save before the tab closes
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onHide);
    };
  }, [flush]);

  /* ---------------- live changes from other devices ---------------- */
  useEffect(() => {
    if (!supabase || !profile || !loaded) return;
    const apply = (fn: (list: ClientProfile[]) => ClientProfile[]) => {
      const next = fn(current.current);
      current.current = next;
      setState(next);
    };

    const channel: RealtimeChannel = supabase
      .channel(`pf-data-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (!id) return;
          pushedWorkouts.current.delete(id);
          workoutVersions.current.delete(id);
          apply((list) =>
            list.map((c) => ({ ...c, workouts: (c.workouts ?? []).filter((w) => w.id !== id) }))
          );
          return;
        }
        const r = payload.new as WorkoutRow;
        const wo: Workout = { ...r.data, id: r.id, date: r.date };
        const json = stableStringify(workoutRow(r.client_id, wo));
        if (pushedWorkouts.current.get(r.id) === json) return; // our own write coming back
        pushedWorkouts.current.set(r.id, json);
        if (r.updated_at) workoutVersions.current.set(r.id, r.updated_at);
        apply((list) =>
          list.map((c) =>
            c.id !== r.client_id
              ? c
              : {
                  ...c,
                  workouts: sortWorkouts([
                    ...(c.workouts ?? []).filter((w) => w.id !== wo.id && w.date !== wo.date),
                    wo
                  ])
                }
          )
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (!id) return;
          pushedClients.current.delete(id);
          apply((list) => list.filter((c) => c.id !== id));
          return;
        }
        const r = payload.new as ClientRow;
        const doc = { ...r.data, id: r.id, email: r.email } as ClientProfile;
        const json = stableStringify(clientRow({ ...doc, workouts: [] }));
        if (pushedClients.current.get(r.id) === json) return;
        pushedClients.current.set(r.id, json);
        apply((list) => {
          const existing = list.find((c) => c.id === r.id);
          const merged = { ...doc, coachNotes: existing?.coachNotes ?? [], workouts: existing?.workouts ?? [] };
          return existing
            ? list.map((c) => (c.id === r.id ? merged : c))
            : [...list, merged].sort((a, b) => a.name.localeCompare(b.name));
        });
      })
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [profile, loaded]);

  return { clients, setClients, loaded, sync, loadError, saveConflict };
}
