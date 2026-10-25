import React, { useState } from 'react';
import {
  Search,
  GripVertical,
  Plus,
  Trash2,
  Copy,
  Check,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import {
  ClientProfile,
  DayWorkout,
  Exercise,
  WorkoutExerciseBlock
} from '../../types';
import { useExerciseLibrary } from '../../state/ExerciseLibrary';
import { ExerciseThumb } from '../ExerciseMedia';

interface WorkoutBuilderViewProps {
  clients: ClientProfile[];
  client: ClientProfile;
  onSelectClientId: (id: string) => void;
  onUpdateClient: (updated: ClientProfile) => void;
}

export const WorkoutBuilderView: React.FC<WorkoutBuilderViewProps> = ({
  clients,
  client,
  onSelectClientId,
  onUpdateClient
}) => {
  const { exercises } = useExerciseLibrary();
  const [selectedDayKey, setSelectedDayKey] = useState<DayWorkout['dayKey']>('Mon');
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(client.currentWeek || 6);
  const [librarySearch, setLibrarySearch] = useState('');
  const [bodyPartFilter, setBodyPartFilter] = useState<string>('All');
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const currentDayWorkout =
    client.weeklyWorkouts.find((d) => d.dayKey === selectedDayKey) ||
    client.weeklyWorkouts[0];

  const triggerToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 2500);
  };

  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      ex.bodyPart.toLowerCase().includes(librarySearch.toLowerCase()) ||
      ex.plane.toLowerCase().includes(librarySearch.toLowerCase());
    const matchesPart = bodyPartFilter === 'All' || ex.bodyPart === bodyPartFilter;
    return matchesSearch && matchesPart;
  });

  const updateCurrentDay = (updater: (day: DayWorkout) => DayWorkout) => {
    const nextWorkouts = client.weeklyWorkouts.map((d) =>
      d.dayKey === currentDayWorkout.dayKey ? updater(d) : d
    );
    onUpdateClient({
      ...client,
      weeklyWorkouts: nextWorkouts
    });
  };

  const handleAddExerciseToDay = (exercise: Exercise) => {
    const defaultLoad =
      exercise.equipment === 'Bodyweight' || exercise.equipment === 'Foam Roller'
        ? 0
        : exercise.bodyPart === 'Lower'
        ? 40
        : 22.5;
    const defaultSets = 3;
    const defaultReps = exercise.phase === 'Reposition' ? 5 : 8;

    const newBlock: WorkoutExerciseBlock = {
      id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      exerciseId: exercise.id,
      name: exercise.name,
      sets: defaultSets,
      targetReps: defaultReps,
      loadKg: defaultLoad,
      restSec: defaultLoad > 0 ? 90 : 45,
      cue: exercise.cues[0] || 'Maintain ribcage-pelvis stack throughout movement',
      lastTimeLoadKg: defaultLoad > 0 ? Math.max(0, defaultLoad - 2.5) : 0,
      lastTimeRepsPerSet: Array.from({ length: defaultSets }, () => defaultReps),
      loggedSets: Array.from({ length: defaultSets }, (_, idx) => ({
        setNumber: idx + 1,
        kg: defaultLoad,
        reps: defaultReps,
        completed: false
      }))
    };

    updateCurrentDay((day) => ({
      ...day,
      isRestDay: false,
      blocks: [...day.blocks, newBlock]
    }));

    triggerToast(`Added "${exercise.name}" to ${currentDayWorkout.dayLabel}`);
  };

  const handleUpdateBlockField = (
    blockId: string,
    field: 'sets' | 'targetReps' | 'loadKg' | 'restSec' | 'cue',
    value: number | string
  ) => {
    updateCurrentDay((day) => ({
      ...day,
      blocks: day.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const updated = { ...b, [field]: value };
        if (field === 'sets' || field === 'loadKg' || field === 'targetReps') {
          const numSets = Math.max(1, Math.min(8, Number(updated.sets) || 1));
          updated.sets = numSets;
          updated.loggedSets = Array.from({ length: numSets }, (_, idx) => ({
            setNumber: idx + 1,
            kg: Number(updated.loadKg) || 0,
            reps: Number(updated.targetReps) || 8,
            completed: b.loggedSets[idx]?.completed || false
          }));
        }
        return updated;
      })
    }));
  };

  const handleRemoveBlock = (blockId: string) => {
    updateCurrentDay((day) => ({
      ...day,
      blocks: day.blocks.filter((b) => b.id !== blockId)
    }));
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentDayWorkout.blocks.length) return;
    updateCurrentDay((day) => {
      const nextBlocks = [...day.blocks];
      const [moved] = nextBlocks.splice(index, 1);
      nextBlocks.splice(targetIndex, 0, moved);
      return { ...day, blocks: nextBlocks };
    });
  };

  const handleDragStart = (e: React.DragEvent, exerciseId: string) => {
    e.dataTransfer.setData('text/plain', exerciseId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropOnDay = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const exerciseId = e.dataTransfer.getData('text/plain');
    const found = exercises.find((ex) => ex.id === exerciseId);
    if (found) {
      handleAddExerciseToDay(found);
    }
  };

  const handleCopyToWeek = () => {
    const nextWeek = selectedWeekNum < 12 ? selectedWeekNum + 1 : 1;
    setSelectedWeekNum(nextWeek);
    triggerToast(`Copied ${client.name}'s 7-day template to Week ${nextWeek}`);
  };

  const handleSaveWorkout = () => {
    triggerToast(`Saved Week ${selectedWeekNum} program for ${client.name}`);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-[34px] font-bold tracking-tight text-[#111827] leading-tight">
            Workout Builder
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm sm:text-base text-gray-500">
            <div className="relative inline-flex items-center">
              <select
                value={client.id}
                onChange={(e) => onSelectClientId(e.target.value)}
                className="appearance-none bg-transparent pr-5 font-medium text-[#111827] focus:outline-none cursor-pointer"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-0 pointer-events-none" />
            </div>
            <span>·</span>
            <span>
              Phase {client.phaseNumber} ({client.phaseName})
            </span>
            <span>·</span>
            <select
              value={selectedWeekNum}
              onChange={(e) => setSelectedWeekNum(Number(e.target.value))}
              className="bg-transparent font-medium text-[#111827] focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons: Copy to week & Save */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCopyToWeek}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-[#111827] border border-gray-200 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Copy className="w-4 h-4 text-gray-500" />
            <span>Copy to week</span>
          </button>

          <button
            onClick={handleSaveWorkout}
            className="inline-flex items-center gap-2 bg-[#111827] hover:bg-[#1F2937] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Check className="w-4 h-4 text-[#FFC809]" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Toast Message */}
      {statusToast && (
        <div className="mb-4 inline-flex items-center gap-2 bg-[#111827] text-white text-xs font-medium px-3.5 py-2 rounded-xl">
          <Check className="w-3.5 h-3.5 text-[#FFC809]" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* Week Strip (Mon - Sun) */}
      <div className="grid grid-cols-7 gap-2 mb-6 overflow-x-auto pb-1">
        {client.weeklyWorkouts.map((day) => {
          const isSelected = day.dayKey === selectedDayKey;
          return (
            <button
              key={day.dayKey}
              onClick={() => setSelectedDayKey(day.dayKey)}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer min-w-[92px] ${
                isSelected
                  ? 'bg-[#111827] text-white border-[#111827] shadow-sm'
                  : 'bg-white text-[#111827] border-gray-100 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold tracking-tight">{day.dayKey}</span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-[#FFC809]" />
                )}
              </div>
              <div
                className={`text-[11px] font-medium truncate ${
                  isSelected ? 'text-gray-200' : 'text-gray-500'
                }`}
              >
                {day.isRestDay ? 'Rest' : `${day.blocks.length} exercises`}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Split: Exercise Library on Left + Day Canvas on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Draggable Exercise Library */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-4 sm:p-5 shadow-[0_2px_14px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#111827]">
              Exercise Library
            </h2>
            <span className="text-[11px] text-gray-400">
              Drag into day or tap +
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search exercises..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs text-[#111827] focus:outline-none focus:bg-white focus:border-[#111827]"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
            {['All', 'Hips', 'Lower', 'Upper', 'Core'].map((part) => (
              <button
                key={part}
                onClick={() => setBodyPartFilter(part)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  bodyPartFilter === part
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F3F4F6] text-gray-600 hover:text-[#111827]'
                }`}
              >
                {part}
              </button>
            ))}
          </div>

          {/* Draggable Exercise Cards */}
          <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
            {filteredExercises.map((ex) => (
              <div
                key={ex.id}
                draggable
                onDragStart={(e) => handleDragStart(e, ex.id)}
                className="group p-2.5 rounded-xl border border-gray-100 hover:border-gray-300 bg-white flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
                  <ExerciseThumb exercise={ex} compact className="w-12 h-10 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#111827] truncate">
                      {ex.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {ex.bodyPart} · {ex.plane}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddExerciseToDay(ex)}
                  title={`Add ${ex.name} to ${currentDayWorkout.dayLabel}`}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-[#111827] text-[#111827] hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Day Workout Drop Zone & Editable Prescription */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDropOnDay}
          className={`lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.04)] border transition-colors ${
            isDragOver
              ? 'border-[#FFC809] ring-2 ring-[#FFC809]/30 bg-[#FFFDF5]'
              : 'border-gray-100'
          }`}
        >
          {/* Day Title & Session Focus Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b border-gray-100">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {currentDayWorkout.dayLabel}
                </span>
                {currentDayWorkout.dayKey === 'Mon' && (
                  <span className="bg-[#FEF3C7] text-[#92400E] text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                    Synced with Client "Today" Screen
                  </span>
                )}
              </div>
              <input
                type="text"
                value={currentDayWorkout.title}
                onChange={(e) =>
                  updateCurrentDay((d) => ({ ...d, title: e.target.value }))
                }
                className="text-lg sm:text-xl font-bold text-[#111827] bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#111827] focus:outline-none w-full mt-0.5"
              />
            </div>

            <div className="text-xs text-gray-500 tabular-nums shrink-0">
              Est. {currentDayWorkout.blocks.length * 9 + 5} min
            </div>
          </div>

          {/* Exercise Blocks */}
          {currentDayWorkout.blocks.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl py-14 px-6 text-center">
              <p className="text-sm font-medium text-[#111827] mb-1">
                No exercises scheduled for {currentDayWorkout.dayLabel}
              </p>
              <p className="text-xs text-gray-400">
                Drag an exercise from the library on the left or click the + button to add it.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentDayWorkout.blocks.map((block, index) => (
                <div
                  key={block.id}
                  className="p-4 rounded-xl border border-gray-200/80 hover:border-gray-300 bg-white transition-all"
                >
                  {/* Top Row: Index badge + Name + Reorder/Delete */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-[#111827] text-[#FFC809] text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                        {index + 1}
                      </span>
                      <span className="text-sm sm:text-[15px] font-semibold text-[#111827] truncate">
                        {block.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(index, -1)}
                        disabled={index === 0}
                        className="p-1 rounded text-gray-400 hover:text-[#111827] disabled:opacity-30 cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(index, 1)}
                        disabled={index === currentDayWorkout.blocks.length - 1}
                        className="p-1 rounded text-gray-400 hover:text-[#111827] disabled:opacity-30 cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveBlock(block.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-600 cursor-pointer ml-1"
                        title="Remove exercise"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Editable Sets × Reps × Load (kg) & Rest (s) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">
                        Sets
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={block.sets}
                        onChange={(e) =>
                          handleUpdateBlockField(
                            block.id,
                            'sets',
                            parseInt(e.target.value, 10) || 1
                          )
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-[#111827] tabular-nums focus:outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">
                        Reps
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={block.targetReps}
                        onChange={(e) =>
                          handleUpdateBlockField(
                            block.id,
                            'targetReps',
                            parseInt(e.target.value, 10) || 1
                          )
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-[#111827] tabular-nums focus:outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">
                        Load (kg)
                      </label>
                      <input
                        type="number"
                        step="2.5"
                        min="0"
                        value={block.loadKg}
                        onChange={(e) =>
                          handleUpdateBlockField(
                            block.id,
                            'loadKg',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-[#111827] tabular-nums focus:outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">
                        Rest (sec)
                      </label>
                      <input
                        type="number"
                        step="15"
                        min="0"
                        value={block.restSec}
                        onChange={(e) =>
                          handleUpdateBlockField(
                            block.id,
                            'restSec',
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-[#111827] tabular-nums focus:outline-none focus:border-[#111827]"
                      />
                    </div>
                  </div>

                  {/* Coaching Cue Input */}
                  <div>
                    <input
                      type="text"
                      value={block.cue}
                      onChange={(e) =>
                        handleUpdateBlockField(block.id, 'cue', e.target.value)
                      }
                      placeholder="Add biomechanical cue..."
                      className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:bg-white focus:border-[#111827] focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
