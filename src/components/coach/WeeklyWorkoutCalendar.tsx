import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Plus, X } from 'lucide-react';
import type { ClientProfile, Workout } from '../../types';
import { useExerciseLibrary } from '../../state/ExerciseLibrary';
import { ExerciseVideoPlayer } from '../ExerciseMedia';
import { formatWeight } from '../../lib/units';
import {
  addDays, blankWorkout, dayShort, effectiveStatus, formatDate, orderLabels,
  parseISODate, todayISO, upsertWorkout, weekDates, workoutOn
} from '../../lib/workouts';

/** A calendar is read-only except for explicit selection and Add workout. The existing
 * WorkoutBuilderView editor remains the sole editor for prescriptions and logged sets. */
export interface WeeklyWorkoutCalendarProps {
  client: ClientProfile;
  selectedDate: string;
  weekStart: string;
  onSelectDate: (date: string) => void;
  onUpdateClient: (next: ClientProfile) => void;
}

export function calendarStatus(w: Workout, today: string): { label: string; classes: string } {
  if (w.status === 'completed') return { label: 'Completed', classes: 'bg-green-100 text-green-800' };
  if (w.status === 'missed') return { label: 'Missed', classes: 'bg-red-100 text-red-800' };
  const completed = w.blocks.reduce((sum, b) => sum + b.loggedSets.filter(s => s.completed).length, 0);
  if (completed > 0) return { label: 'Partially completed', classes: 'bg-amber-100 text-amber-900' };
  if (effectiveStatus(w, today) === 'missed') return { label: 'Missed', classes: 'bg-red-100 text-red-800' };
  return { label: 'Planned', classes: 'bg-gray-100 text-gray-700' };
}

/** On tablet show three consecutive days including selection, without horizontal scroll. */
export function tabletDayStart(dayIndex: number): number {
  return Math.max(0, Math.min(4, dayIndex - 1));
}

const card = 'min-w-0 rounded-xl border border-gray-200 bg-white p-2.5 flex flex-col gap-2';

export const WeeklyWorkoutCalendar: React.FC<WeeklyWorkoutCalendarProps> = ({
  client, selectedDate, weekStart, onSelectDate, onUpdateClient
}) => {
  const { getExercise } = useExerciseLibrary();
  const [videoId, setVideoId] = useState<string | null>(null);
  const today = todayISO();
  const dates = weekDates(weekStart);
  const selectedIndex = Math.max(0, dates.indexOf(selectedDate));
  const tabletStart = tabletDayStart(selectedIndex);
  const video = videoId ? getExercise(videoId) : undefined;

  const create = (date: string) => {
    // Never replace a scheduled or logged session.
    if (workoutOn(client, date)) { onSelectDate(date); return; }
    onUpdateClient(upsertWorkout(client, blankWorkout(date)));
    onSelectDate(date);
  };

  return (
    <section aria-label="Weekly workout calendar" className="mb-5 min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-600">Select a day to edit its program below. Results are read-only here.</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onSelectDate(addDays(selectedDate, -1))}
            aria-label="Previous day" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-gray-200"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => onSelectDate(today)}
            className="min-h-11 px-3 rounded-xl border border-gray-200 text-sm font-semibold">Today</button>
          <button type="button" onClick={() => onSelectDate(addDays(selectedDate, 1))}
            aria-label="Next day" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-gray-200"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-7 items-stretch">
        {dates.map((date, index) => {
          const workout = workoutOn(client, date);
          const selected = date === selectedDate;
          const status = workout ? calendarStatus(workout, today) : null;
          const labels = workout ? orderLabels(workout.blocks) : [];
          const visibleOnTablet = index >= tabletStart && index < tabletStart + 3;
          return (
            <article key={date} className={`${card} ${selected ? 'ring-2 ring-[#FFC809]' : ''} ${selected ? '' : 'hidden'} ${visibleOnTablet ? 'md:flex' : 'md:hidden'} xl:flex`}>
              <button type="button" onClick={() => onSelectDate(date)} aria-pressed={selected}
                className="sticky top-0 z-[1] min-h-11 rounded-lg bg-[#111827] text-white px-2 py-2 text-left text-xs font-semibold">
                <span className="block">{dayShort(date)} {parseISODate(date).getDate()}</span>
                <span className="block text-[10px] text-gray-300 font-normal">{formatDate(date)}{date === today ? ' · Today' : ''}</span>
              </button>
              {!workout ? (
                <div className="flex flex-1 flex-col justify-between gap-2 py-4">
                  <span className="text-xs text-gray-400">No workout scheduled</span>
                  <button type="button" onClick={() => create(date)}
                    className="min-h-11 rounded-xl border border-dashed border-gray-300 text-xs font-semibold flex items-center justify-center gap-1">
                    <Plus className="h-4 w-4" /> Add workout
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => onSelectDate(date)}
                    className="min-h-11 text-left min-w-0 text-sm font-semibold text-[#111827] break-words">
                    {workout.title}
                  </button>
                  {status && <span className={`self-start rounded-full px-2 py-1 text-[10px] font-semibold ${status.classes}`}>{status.label}</span>}
                  <div className="space-y-2 flex-1">
                    {workout.blocks.map((b, i) => {
                      const done = b.loggedSets.filter(s => s.completed);
                      return (
                        <div key={b.id} className="min-w-0 border-t border-gray-100 pt-2">
                          <div className="flex items-start gap-1 min-w-0">
                            <span className="text-[11px] font-bold shrink-0 text-gray-500">{labels[i]}</span>
                            <span className="text-[11px] leading-snug font-semibold text-[#111827] break-words min-w-0 flex-1">{b.name}</span>
                            <button type="button" onClick={() => setVideoId(b.exerciseId)} aria-label={`Video: ${b.name}`}
                              className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center text-gray-500" title="Exercise demo">
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-600 leading-snug">
                            {b.sets} × {b.reps || '—'}{b.loadKg > 0 ? ` · ${formatWeight(b.loadKg)}` : ''}{b.restSec ? ` · ${b.restSec}s rest` : ''}
                          </p>
                          {b.notes && <details className="text-[11px] text-gray-600 mt-1"><summary className="cursor-pointer break-words">Coach note: {b.notes.slice(0, 38)}{b.notes.length > 38 ? '…' : ''}</summary><p className="mt-1 whitespace-pre-wrap">{b.notes}</p></details>}
                          {done.length > 0 && <details className="mt-1 text-[11px] text-[#166534]"><summary className="cursor-pointer font-semibold">Actual: {done.length}/{b.loggedSets.length} sets logged</summary>
                            <ul className="mt-1 space-y-0.5 text-gray-600">{b.loggedSets.filter(s => s.completed).map(s => <li key={s.setNumber}>Set {s.setNumber}: {s.kg != null ? formatWeight(s.kg) : '—'} · {s.reps ?? '—'} reps</li>)}</ul>
                          </details>}
                        </div>
                      );
                    })}
                    {workout.blocks.length === 0 && <span className="text-xs text-gray-400">Empty workout</span>}
                  </div>
                  {workout.coachNotes && <details className="border-t border-gray-100 pt-2 text-[11px]"><summary className="font-medium cursor-pointer">Session notes</summary><p className="mt-1 whitespace-pre-wrap">{workout.coachNotes}</p></details>}
                  {(workout.sessionRpe != null || workout.clientFeedback) && <div className="border-t border-gray-100 pt-2 text-[11px] min-w-0"><span className="font-semibold">Client feedback: </span><span className="break-words">{workout.sessionRpe != null ? `RPE ${workout.sessionRpe}/10` : ''}{workout.sessionRpe != null && workout.clientFeedback ? ' · ' : ''}{workout.clientFeedback ?? ''}</span></div>}
                  <button type="button" onClick={() => onSelectDate(date)} className="min-h-11 rounded-lg bg-gray-100 text-xs font-semibold text-[#111827]">Edit this day</button>
                </>
              )}
            </article>
          );
        })}
      </div>
      {videoId && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setVideoId(null)}>
          <div className="w-full max-w-xl rounded-t-2xl sm:rounded-2xl bg-white p-4" onClick={e => e.stopPropagation()} role="dialog" aria-label="Exercise video">
            <div className="flex items-center justify-between gap-2 mb-3"><h3 className="text-base font-bold">{video?.name ?? 'Exercise video'}</h3><button type="button" className="min-h-11 min-w-11" aria-label="Close video" onClick={() => setVideoId(null)}><X className="w-5 h-5" /></button></div>
            <ExerciseVideoPlayer title={video?.name ?? 'Exercise'} video={video?.video} />
            {(video?.cues?.length ?? 0) > 0 && <ul className="mt-3 space-y-1 text-sm text-gray-600">{video!.cues.map((cue, i) => <li key={i}>{i + 1}. {cue}</li>)}</ul>}
          </div>
        </div>
      )}
    </section>
  );
};
