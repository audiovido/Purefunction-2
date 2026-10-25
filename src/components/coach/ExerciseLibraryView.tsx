import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  Plus,
  Check,
  Wind,
  Target,
  Pencil,
  Video
} from 'lucide-react';
import {
  ClientProfile,
  Exercise,
  BODY_PARTS,
  EQUIPMENT,
  PATTERNS,
  PLANES
} from '../../types';
import { searchExercises, useExerciseLibrary } from '../../state/ExerciseLibrary';
import { formatDate, todayISO } from '../../lib/workouts';
import { ExerciseThumb, ExerciseVideoPlayer } from '../ExerciseMedia';
import { ExerciseEditorModal } from './ExerciseEditorModal';

interface ExerciseLibraryViewProps {
  clients: ClientProfile[];
  selectedClient?: ClientProfile;
  onAddExerciseToClientWorkout: (
    clientId: string,
    date: string,
    exercise: Exercise
  ) => void;
}

const PAGE = 48;

const FilterSelect: React.FC<{
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label={`Filter by ${label.toLowerCase()}`}
    className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium border transition-colors cursor-pointer focus:outline-none ${
      value !== 'All'
        ? 'bg-[#111827] text-white border-[#111827]'
        : 'bg-[#E5E7EB]/80 text-[#111827] border-transparent hover:bg-[#E5E7EB]'
    }`}
  >
    <option value="All">{label}</option>
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
);

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({
  clients,
  selectedClient,
  onAddExerciseToClientWorkout
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('All');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('All');
  const [selectedPlane, setSelectedPlane] = useState<string>('All');
  const [selectedPattern, setSelectedPattern] = useState<string>('All');
  const [shown, setShown] = useState(PAGE);
  const { exercises, catalogLoaded, getExercise, saveExercise, deleteExercise } = useExerciseLibrary();
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(
    exercises[0]?.id ?? null
  );
  const activeExercise = activeExerciseId ? getExercise(activeExerciseId) ?? null : null;
  const setActiveExercise = (ex: Exercise | null) => setActiveExerciseId(ex?.id ?? null);
  // undefined = closed, null = new exercise, Exercise = editing
  const [editing, setEditing] = useState<Exercise | null | undefined>(undefined);
  const [targetClientId, setTargetClientId] = useState(selectedClient?.id ?? clients[0]?.id ?? '');
  const [targetDate, setTargetDate] = useState(todayISO());
  const [addedFeedback, setAddedFeedback] = useState(false);

  const filteredExercises = useMemo(
    () =>
      searchExercises(exercises, searchQuery, {
        bodyPart: selectedBodyPart,
        equipment: selectedEquipment,
        plane: selectedPlane,
        pattern: selectedPattern
      }),
    [exercises, searchQuery, selectedBodyPart, selectedEquipment, selectedPlane, selectedPattern]
  );
  const visibleExercises = filteredExercises.slice(0, shown);
  const filterChanged = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setShown(PAGE);
  };

  const handleAddToWorkout = () => {
    if (!activeExercise || !targetClientId) return;
    onAddExerciseToClientWorkout(targetClientId, targetDate, activeExercise);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto relative">
      {/* Page Title matching Mockup 9 */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-[#111827]">
          Exercise Library
        </h1>
        <button
          onClick={() => setEditing(null)}
          className="inline-flex items-center gap-2 bg-[#111827] hover:bg-[#1F2937] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New exercise</span>
        </button>
      </div>

      {/* Search Bar & Filter Chips matching Mockup 9 */}
      <div className="flex flex-wrap items-center gap-3 mb-7">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder={`Search ${exercises.length.toLocaleString()} exercises…`}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:outline-none focus:border-[#111827]"
          />
        </div>

        <FilterSelect label="Body part" value={selectedBodyPart} options={BODY_PARTS} onChange={filterChanged(setSelectedBodyPart)} />
        <FilterSelect label="Pattern" value={selectedPattern} options={PATTERNS} onChange={filterChanged(setSelectedPattern)} />
        <FilterSelect label="Equipment" value={selectedEquipment} options={EQUIPMENT} onChange={filterChanged(setSelectedEquipment)} />
        <FilterSelect label="Plane of motion" value={selectedPlane} options={PLANES} onChange={filterChanged(setSelectedPlane)} />

        {(selectedBodyPart !== 'All' ||
          selectedEquipment !== 'All' ||
          selectedPlane !== 'All' ||
          selectedPattern !== 'All' ||
          searchQuery) && (
          <button
            onClick={() => {
              setSelectedBodyPart('All');
              setSelectedEquipment('All');
              setSelectedPlane('All');
              setSelectedPattern('All');
              setSearchQuery('');
              setShown(PAGE);
            }}
            className="text-xs font-medium text-gray-500 hover:text-[#111827] underline cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Main Layout: Grid of Cards + Side Drawer when an exercise is selected */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={`${
            activeExercise ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
          } grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5`}
        >
          {visibleExercises.map((exercise) => {
            const isSelected = activeExercise?.id === exercise.id;
            return (
              <div
                key={exercise.id}
                onClick={() => setActiveExercise(exercise)}
                className={`bg-white rounded-2xl p-3.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[1.5px] border-[#111827] shadow-[0_4px_18px_rgba(0,0,0,0.06)]'
                    : 'border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-gray-300'
                }`}
              >
                <ExerciseThumb exercise={exercise} className="w-full aspect-video mb-3.5" />

                <h3 className="text-[15px] sm:text-base font-semibold text-[#111827] mb-2 line-clamp-2 leading-snug min-h-[2lh]" title={exercise.name}>
                  {exercise.name}
                </h3>

                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="inline-flex items-center bg-[#E5E7EB]/70 text-[#374151] text-xs font-medium px-3 py-1 rounded-full truncate">
                    {[exercise.bodyPart, exercise.pattern ?? exercise.plane].filter(Boolean).join(' · ')}
                  </span>
                  {(exercise.source === 'coach' || exercise.isCustom) && (
                    <span className="text-[11px] text-[#92400E] font-semibold shrink-0">Yours</span>
                  )}
                  {exercise.phase && exercise.source === 'pf' && (
                    <span className="text-[11px] text-gray-400 font-medium shrink-0">{exercise.phase}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Side Drawer with Video, Cues & "Add to workout" */}
        {activeExercise && (
          <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-gray-100 sticky top-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                {activeExercise.phase && (
                  <span className="inline-flex items-center bg-[#FEF3C7] text-[#92400E] text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-1.5">
                    Phase: {activeExercise.phase}
                  </span>
                )}
                <h2 className="text-xl font-bold text-[#111827]">
                  {activeExercise.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[
                    activeExercise.bodyPart,
                    activeExercise.pattern,
                    activeExercise.plane && `${activeExercise.plane} plane`,
                    activeExercise.equipment
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {activeExercise.muscles && activeExercise.muscles.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{activeExercise.muscles.join(', ')}</p>
                )}
              </div>
              <button
                onClick={() => setActiveExercise(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#111827] hover:bg-gray-100 cursor-pointer"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Coach's own demo video */}
            <div className="mb-3">
              <ExerciseVideoPlayer video={activeExercise.video} title={activeExercise.name} />
            </div>
            <button
              onClick={() => setEditing(activeExercise)}
              className="w-full inline-flex items-center justify-center gap-2 mb-4 border border-gray-200 hover:border-[#111827] text-[#111827] text-xs font-semibold py-2.5 rounded-xl cursor-pointer"
            >
              {activeExercise.video ? (
                <>
                  <Pencil className="w-3.5 h-3.5" /> Edit exercise / replace video
                </>
              ) : (
                <>
                  <Video className="w-3.5 h-3.5" /> Add your video
                </>
              )}
            </button>

            {/* Breathing Pattern */}
            {activeExercise.breathingPattern && (
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 mb-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111827] mb-1">
                <Wind className="w-3.5 h-3.5 text-[#F5B800]" />
                <span>Respiratory Cadence</span>
              </div>
              <p className="text-xs text-gray-600">{activeExercise.breathingPattern}</p>
            </div>
            )}

            {/* Coaching Cues */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
                Coaching Cues
              </h3>
              <ol className="space-y-2">
                {activeExercise.cues.map((cue, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-[#111827]">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-[#FFC809] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed text-gray-700">{cue}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Biomechanical Rationale */}
            {activeExercise.whyItMatters && (
            <div className="mb-5 p-3 rounded-xl bg-[#FFFDF5] border border-[#FEF3C7]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111827] mb-1">
                <Target className="w-3.5 h-3.5 text-[#F5B800]" />
                <span>Why It Matters</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {activeExercise.whyItMatters}
              </p>
            </div>
            )}

            {/* Add to Workout Controls */}
            {clients.length > 0 && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    Client
                  </label>
                  <select
                    value={targetClientId}
                    onChange={(e) => setTargetClientId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white focus:outline-none focus:border-[#111827]"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => e.target.value && setTargetDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-base sm:text-xs font-medium text-[#111827] bg-white focus:outline-none focus:border-[#111827]"
                  />
                </div>
              </div>

              <button
                onClick={handleAddToWorkout}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#111827] hover:bg-[#1F2937] text-white text-sm font-medium py-3 px-4 rounded-xl transition-colors cursor-pointer"
              >
                {addedFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-[#FFC809]" />
                    <span>Added to {formatDate(targetDate, { weekday: true })}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-[#FFC809]" />
                    <span>Add to workout</span>
                  </>
                )}
              </button>
            </div>
            )}
          </div>
        )}
      </div>

      {filteredExercises.length > shown && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setShown((n) => n + PAGE)}
            className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-[#111827] hover:border-[#111827] cursor-pointer"
          >
            Show more ({(filteredExercises.length - shown).toLocaleString()} left)
          </button>
        </div>
      )}
      {filteredExercises.length === 0 && (
        <p className="text-sm text-gray-500 py-10 text-center">
          {catalogLoaded ? 'No exercises match these filters.' : 'Loading exercises…'}
        </p>
      )}

      {editing !== undefined && (
        <ExerciseEditorModal
          exercise={editing}
          onSave={(ex) => {
            saveExercise(ex);
            setActiveExerciseId(ex.id);
          }}
          onDelete={(id) => {
            deleteExercise(id);
            setActiveExerciseId(null);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
};
