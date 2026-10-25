import React, { useState } from 'react';
import {
  Search,
  X,
  Play,
  Pause,
  Plus,
  Check,
  Wind,
  Target
} from 'lucide-react';
import {
  ClientProfile,
  DayWorkout,
  Exercise,
  WorkoutExerciseBlock
} from '../../types';
import { EXERCISES_LIBRARY } from '../../data/mockData';
import { ExerciseIllustration } from '../VisualAssets';

interface ExerciseLibraryViewProps {
  clients: ClientProfile[];
  selectedClient: ClientProfile;
  onAddExerciseToClientWorkout: (
    clientId: string,
    dayKey: DayWorkout['dayKey'],
    exercise: Exercise
  ) => void;
}

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({
  clients,
  selectedClient,
  onAddExerciseToClientWorkout
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('All');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('All');
  const [selectedPlane, setSelectedPlane] = useState<string>('All');
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(
    EXERCISES_LIBRARY[0]
  );
  const [isPlayingDemo, setIsPlayingDemo] = useState(true);
  const [targetClientId, setTargetClientId] = useState(selectedClient.id);
  const [targetDayKey, setTargetDayKey] = useState<DayWorkout['dayKey']>('Mon');
  const [addedFeedback, setAddedFeedback] = useState(false);

  const filteredExercises = EXERCISES_LIBRARY.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.bodyPart.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.plane.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBody =
      selectedBodyPart === 'All' || ex.bodyPart === selectedBodyPart;
    const matchesEquip =
      selectedEquipment === 'All' || ex.equipment === selectedEquipment;
    const matchesPlane = selectedPlane === 'All' || ex.plane === selectedPlane;
    return matchesSearch && matchesBody && matchesEquip && matchesPlane;
  });

  const handleAddToWorkout = () => {
    if (!activeExercise) return;
    onAddExerciseToClientWorkout(targetClientId, targetDayKey, activeExercise);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto relative">
      {/* Page Title matching Mockup 9 */}
      <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-[#111827] mb-6">
        Exercise Library
      </h1>

      {/* Search Bar & Filter Chips matching Mockup 9 */}
      <div className="flex flex-wrap items-center gap-3 mb-7">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exercises..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:outline-none focus:border-[#111827]"
          />
        </div>

        {/* Body Part Filter Pill */}
        <select
          value={selectedBodyPart}
          onChange={(e) => setSelectedBodyPart(e.target.value)}
          aria-label="Filter by body part"
          className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium border transition-colors cursor-pointer focus:outline-none ${
            selectedBodyPart !== 'All'
              ? 'bg-[#111827] text-white border-[#111827]'
              : 'bg-[#E5E7EB]/80 text-[#111827] border-transparent hover:bg-[#E5E7EB]'
          }`}
        >
          <option value="All">Body part</option>
          <option value="Hips">Hips</option>
          <option value="Lower">Lower</option>
          <option value="Upper">Upper</option>
          <option value="Core">Core</option>
        </select>

        {/* Equipment Filter Pill */}
        <select
          value={selectedEquipment}
          onChange={(e) => setSelectedEquipment(e.target.value)}
          aria-label="Filter by equipment"
          className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium border transition-colors cursor-pointer focus:outline-none ${
            selectedEquipment !== 'All'
              ? 'bg-[#111827] text-white border-[#111827]'
              : 'bg-[#E5E7EB]/80 text-[#111827] border-transparent hover:bg-[#E5E7EB]'
          }`}
        >
          <option value="All">Equipment</option>
          <option value="Bodyweight">Bodyweight</option>
          <option value="Foam Roller">Foam Roller</option>
          <option value="Dumbbell">Dumbbell</option>
          <option value="Barbell">Barbell</option>
          <option value="Cable / Band">Cable / Band</option>
        </select>

        {/* Plane Filter Pill */}
        <select
          value={selectedPlane}
          onChange={(e) => setSelectedPlane(e.target.value)}
          aria-label="Filter by plane of motion"
          className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium border transition-colors cursor-pointer focus:outline-none ${
            selectedPlane !== 'All'
              ? 'bg-[#111827] text-white border-[#111827]'
              : 'bg-[#E5E7EB]/80 text-[#111827] border-transparent hover:bg-[#E5E7EB]'
          }`}
        >
          <option value="All">Plane of motion</option>
          <option value="Sagittal">Sagittal</option>
          <option value="Frontal">Frontal</option>
          <option value="Transverse">Transverse</option>
        </select>

        {(selectedBodyPart !== 'All' ||
          selectedEquipment !== 'All' ||
          selectedPlane !== 'All' ||
          searchQuery) && (
          <button
            onClick={() => {
              setSelectedBodyPart('All');
              setSelectedEquipment('All');
              setSelectedPlane('All');
              setSearchQuery('');
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
          {filteredExercises.map((exercise) => {
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
                <ExerciseIllustration
                  type={exercise.illustrationType}
                  className="w-full h-36 sm:h-40 mb-3.5"
                />

                <h3 className="text-[17px] font-semibold text-[#111827] mb-2 truncate">
                  {exercise.name}
                </h3>

                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center bg-[#E5E7EB]/70 text-[#374151] text-xs font-medium px-3 py-1 rounded-full">
                    {exercise.bodyPart} · {exercise.plane}
                  </span>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {exercise.phase}
                  </span>
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
                <span className="inline-flex items-center bg-[#FEF3C7] text-[#92400E] text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-1.5">
                  Phase: {activeExercise.phase}
                </span>
                <h2 className="text-xl font-bold text-[#111827]">
                  {activeExercise.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {activeExercise.bodyPart} · {activeExercise.plane} Plane ·{' '}
                  {activeExercise.equipment}
                </p>
              </div>
              <button
                onClick={() => setActiveExercise(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#111827] hover:bg-gray-100 cursor-pointer"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player Box */}
            <div className="relative rounded-xl overflow-hidden mb-4 border border-gray-200/80">
              <ExerciseIllustration
                type={activeExercise.illustrationType}
                className="w-full h-44"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex items-center justify-between text-white">
                <button
                  onClick={() => setIsPlayingDemo(!isPlayingDemo)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-black/50 hover:bg-black/70 px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  {isPlayingDemo ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-[#FFC809]" />
                      <span>Coaching Loop</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#FFC809]" />
                      <span>Play Demo</span>
                    </>
                  )}
                </button>
                <span className="text-[11px] font-mono text-gray-200">
                  0:{activeExercise.durationSec}s · 60fps
                </span>
              </div>
            </div>

            {/* Breathing Pattern */}
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 mb-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111827] mb-1">
                <Wind className="w-3.5 h-3.5 text-[#F5B800]" />
                <span>Respiratory Cadence</span>
              </div>
              <p className="text-xs text-gray-600">{activeExercise.breathingPattern}</p>
            </div>

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
            <div className="mb-5 p-3 rounded-xl bg-[#FFFDF5] border border-[#FEF3C7]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111827] mb-1">
                <Target className="w-3.5 h-3.5 text-[#F5B800]" />
                <span>Why It Matters</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {activeExercise.whyItMatters}
              </p>
            </div>

            {/* Add to Workout Controls */}
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
                    Workout Day
                  </label>
                  <select
                    value={targetDayKey}
                    onChange={(e) =>
                      setTargetDayKey(e.target.value as DayWorkout['dayKey'])
                    }
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white focus:outline-none focus:border-[#111827]"
                  >
                    <option value="Mon">Monday</option>
                    <option value="Tue">Tuesday</option>
                    <option value="Wed">Wednesday</option>
                    <option value="Thu">Thursday</option>
                    <option value="Fri">Friday</option>
                    <option value="Sat">Saturday</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleAddToWorkout}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#111827] hover:bg-[#1F2937] text-white text-sm font-medium py-3 px-4 rounded-xl transition-colors cursor-pointer"
              >
                {addedFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-[#FFC809]" />
                    <span>Added to {targetDayKey} Workout</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-[#FFC809]" />
                    <span>Add to workout</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
