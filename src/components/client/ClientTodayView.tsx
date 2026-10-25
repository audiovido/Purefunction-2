import React, { useState, useEffect } from 'react';
import {
  Check,
  TrendingUp,
  Clock,
  Play,
  X,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import {
  ClientProfile,
  DayWorkout,
  WorkoutExerciseBlock,
  getSuggestedLoad
} from '../../types';
import { EXERCISES_LIBRARY } from '../../data/mockData';
import { ExerciseIllustration } from '../VisualAssets';

interface ClientTodayViewProps {
  client: ClientProfile;
  onUpdateClient: (updated: ClientProfile) => void;
}

export const ClientTodayView: React.FC<ClientTodayViewProps> = ({
  client,
  onUpdateClient
}) => {
  const [selectedDayKey, setSelectedDayKey] = useState<DayWorkout['dayKey']>('Mon');
  const [restTimerSec, setRestTimerSec] = useState<number | null>(null);
  const [previewExerciseId, setPreviewExerciseId] = useState<string | null>(null);
  const [workoutCompletedBanner, setWorkoutCompletedBanner] = useState(false);

  const currentWorkout =
    client.weeklyWorkouts.find((d) => d.dayKey === selectedDayKey) ||
    client.weeklyWorkouts[0];

  useEffect(() => {
    if (restTimerSec === null || restTimerSec <= 0) return;
    const timer = setInterval(() => {
      setRestTimerSec((prev) => (prev !== null && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [restTimerSec]);

  const totalSets = currentWorkout.blocks.reduce(
    (acc, b) => acc + b.loggedSets.length,
    0
  );
  const completedSets = currentWorkout.blocks.reduce(
    (acc, b) => acc + b.loggedSets.filter((s) => s.completed).length,
    0
  );
  const completionPct =
    totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const updateSetLog = (
    blockId: string,
    setNumber: number,
    field: 'kg' | 'reps' | 'completed',
    value: number | boolean
  ) => {
    const updatedWorkouts = client.weeklyWorkouts.map((day) => {
      if (day.dayKey !== currentWorkout.dayKey) return day;
      return {
        ...day,
        blocks: day.blocks.map((block) => {
          if (block.id !== blockId) return block;
          return {
            ...block,
            loggedSets: block.loggedSets.map((setItem) =>
              setItem.setNumber === setNumber
                ? { ...setItem, [field]: value }
                : setItem
            )
          };
        })
      };
    });

    onUpdateClient({
      ...client,
      weeklyWorkouts: updatedWorkouts
    });
  };

  const handleToggleSetComplete = (
    block: WorkoutExerciseBlock,
    setNumber: number,
    currentlyCompleted: boolean
  ) => {
    const nextState = !currentlyCompleted;
    updateSetLog(block.id, setNumber, 'completed', nextState);
    if (nextState && block.restSec > 0) {
      setRestTimerSec(block.restSec);
    }
  };

  const applySuggestedLoadToBlock = (blockId: string, suggestedKg: number) => {
    const updatedWorkouts = client.weeklyWorkouts.map((day) => {
      if (day.dayKey !== currentWorkout.dayKey) return day;
      return {
        ...day,
        blocks: day.blocks.map((block) => {
          if (block.id !== blockId) return block;
          return {
            ...block,
            loadKg: suggestedKg,
            loggedSets: block.loggedSets.map((s) => ({
              ...s,
              kg: suggestedKg
            }))
          };
        })
      };
    });
    onUpdateClient({
      ...client,
      weeklyWorkouts: updatedWorkouts
    });
  };

  const previewExercise = previewExerciseId
    ? EXERCISES_LIBRARY.find((ex) => ex.id === previewExerciseId) || null
    : null;

  return (
    <div className="max-w-lg mx-auto pb-8">
      {/* Top Session Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-semibold text-gray-500">
            Today · Week {client.currentWeek}
          </span>
          <span className="inline-flex items-center bg-[#F3F4F6] text-[#111827] text-xs font-medium px-3 py-1 rounded-full">
            Phase {client.phaseNumber} · {client.phaseName}
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
          {currentWorkout.title}
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {currentWorkout.focus} · {currentWorkout.durationMin} min
        </p>
      </div>

      {/* Day Switcher Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4">
        {client.weeklyWorkouts
          .filter((d) => !d.isRestDay)
          .map((day) => {
            const isActive = day.dayKey === currentWorkout.dayKey;
            return (
              <button
                key={day.dayKey}
                onClick={() => {
                  setSelectedDayKey(day.dayKey);
                  setWorkoutCompletedBanner(false);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#111827] text-white'
                    : 'bg-white text-gray-600 border border-gray-100 hover:border-gray-300'
                }`}
              >
                {day.dayKey}
              </button>
            );
          })}
      </div>

      {/* Session Progress & Active Rest Timer Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 mb-5">
        <div className="flex items-center justify-between text-xs font-medium mb-2">
          <span className="text-gray-600">
            Session Progress ({completedSets}/{totalSets} sets)
          </span>
          <span className="font-bold text-[#111827] tabular-nums">
            {completionPct}%
          </span>
        </div>
        <div className="h-2 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FFC809] transition-all duration-200 rounded-full"
            style={{ width: `${completionPct}%` }}
          />
        </div>

        {restTimerSec !== null && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
              <Clock className="w-3.5 h-3.5 text-[#F5B800]" />
              <span>Rest Timer: {restTimerSec}s remaining</span>
            </div>
            <button
              onClick={() => setRestTimerSec(null)}
              className="text-xs font-medium text-gray-400 hover:text-[#111827] cursor-pointer"
            >
              Skip
            </button>
          </div>
        )}
      </div>

      {/* Exercise Logging Cards */}
      <div className="space-y-4">
        {currentWorkout.blocks.map((block, index) => {
          const { suggestedKg, allRepsHitLastTime, deltaKg } =
            getSuggestedLoad(block);
          const isBodyweight = block.lastTimeLoadKg === 0 && block.loadKg === 0;

          return (
            <div
              key={block.id}
              className="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_2px_14px_rgba(0,0,0,0.04)] border border-gray-100"
            >
              {/* Card Header: Exercise Name + Video Cues Button */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-[#111827] text-[#FFC809] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[#111827] leading-snug">
                      {block.name}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {block.sets} sets × {block.targetReps}{' '}
                      {isBodyweight ? 'breaths / reps' : 'reps'} · {block.restSec}s rest
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setPreviewExerciseId(block.exerciseId)}
                  className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-[#111827] text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3 fill-[#111827]" />
                  <span>Demo</span>
                </button>
              </div>

              {/* Coaching Cue */}
              <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                {block.cue}
              </p>

              {/* "Last time" & "Suggested load (+2.5 kg if all reps hit)" Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F9FAFB] border border-gray-100 mb-3.5 text-xs">
                <div className="text-gray-600 tabular-nums">
                  <span className="font-medium text-gray-400">Last time: </span>
                  {isBodyweight ? (
                    <span className="font-semibold text-[#111827]">
                      Bodyweight × {block.lastTimeRepsPerSet.join(', ')}
                    </span>
                  ) : (
                    <span className="font-semibold text-[#111827]">
                      {block.lastTimeLoadKg} kg ×{' '}
                      {block.lastTimeRepsPerSet.join(', ')}
                    </span>
                  )}
                </div>

                {!isBodyweight ? (
                  allRepsHitLastTime ? (
                    <button
                      type="button"
                      onClick={() =>
                        applySuggestedLoadToBlock(block.id, suggestedKg)
                      }
                      title="Tap to apply suggested load to all sets"
                      className="inline-flex items-center gap-1 bg-[#FFC809] text-[#111827] font-semibold px-2.5 py-1 rounded-full tabular-nums cursor-pointer"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>
                        Suggested: {suggestedKg} kg (+{deltaKg} kg)
                      </span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-[#E5E7EB] text-[#374151] font-medium px-2.5 py-1 rounded-full tabular-nums">
                      Suggested: {suggestedKg} kg (match & hit all {block.targetReps}s)
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center bg-[#FEF3C7] text-[#92400E] font-medium px-2.5 py-0.5 rounded-full">
                    PRI Position Reset
                  </span>
                )}
              </div>

              {/* Set Logging Table (Set | kg | Reps | Check) */}
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <div className="col-span-2">Set</div>
                  <div className="col-span-4">Load (kg)</div>
                  <div className="col-span-4">Reps</div>
                  <div className="col-span-2 text-right">Done</div>
                </div>

                {block.loggedSets.map((setRow) => (
                  <div
                    key={setRow.setNumber}
                    className={`grid grid-cols-12 gap-2 items-center p-2 rounded-xl border transition-colors ${
                      setRow.completed
                        ? 'bg-gray-50/90 border-gray-200'
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    <div className="col-span-2 pl-1">
                      <span className="text-xs font-bold text-[#111827] tabular-nums">
                        {setRow.setNumber}
                      </span>
                    </div>

                    <div className="col-span-4">
                      <input
                        type="number"
                        step="2.5"
                        min="0"
                        value={setRow.kg}
                        onChange={(e) =>
                          updateSetLog(
                            block.id,
                            setRow.setNumber,
                            'kg',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        aria-label={`${block.name} Set ${setRow.setNumber} kg`}
                        className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[#111827] tabular-nums focus:outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div className="col-span-4">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={setRow.reps}
                        onChange={(e) =>
                          updateSetLog(
                            block.id,
                            setRow.setNumber,
                            'reps',
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        aria-label={`${block.name} Set ${setRow.setNumber} reps`}
                        className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[#111827] tabular-nums focus:outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleSetComplete(
                            block,
                            setRow.setNumber,
                            setRow.completed
                          )
                        }
                        aria-label={`Mark set ${setRow.setNumber} complete`}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                          setRow.completed
                            ? 'bg-[#111827] text-[#FFC809]'
                            : 'bg-gray-100 text-gray-400 hover:text-[#111827] hover:bg-gray-200'
                        }`}
                      >
                        <Check className="w-4 h-4 stroke-[2.8]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Complete Workout Button */}
      <div className="mt-6">
        {workoutCompletedBanner ? (
          <div className="bg-[#111827] text-white rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFC809] text-[#111827] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold">
                  Session Logged · Great Work, {client.name.split(' ')[0]}!
                </div>
                <div className="text-xs text-gray-300 mt-0.5">
                  Weekly adherence updated ({client.adherenceCompleted}/{client.adherenceTotal} sessions).
                </div>
              </div>
            </div>
            <button
              onClick={() => setWorkoutCompletedBanner(false)}
              className="text-xs text-gray-300 hover:text-white underline cursor-pointer shrink-0"
            >
              Edit
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setWorkoutCompletedBanner(true);
              if (client.adherenceCompleted < client.adherenceTotal) {
                onUpdateClient({
                  ...client,
                  adherenceCompleted: Math.min(
                    client.adherenceTotal,
                    client.adherenceCompleted + 1
                  )
                });
              }
            }}
            className="w-full bg-[#111827] hover:bg-[#1F2937] text-white font-semibold text-sm py-3.5 px-6 rounded-2xl shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4 text-[#FFC809]" />
            <span>Complete & Save Workout</span>
          </button>
        )}
      </div>

      {/* Exercise Demo Modal */}
      {previewExercise && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-[#111827]">
                  {previewExercise.name}
                </h3>
                <p className="text-xs text-gray-500">
                  {previewExercise.bodyPart} · {previewExercise.plane} Plane
                </p>
              </div>
              <button
                onClick={() => setPreviewExerciseId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#111827] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ExerciseIllustration
              type={previewExercise.illustrationType}
              className="w-full h-44 mb-4"
            />

            <div className="space-y-2 mb-4">
              {previewExercise.cues.map((cue, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="w-4 h-4 rounded-full bg-[#111827] text-[#FFC809] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{cue}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setPreviewExerciseId(null)}
              className="w-full bg-[#111827] text-white text-xs font-semibold py-2.5 rounded-xl cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
