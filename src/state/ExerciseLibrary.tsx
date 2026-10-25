import React, { createContext, useContext } from 'react';
import { Exercise } from '../types';
import { EXERCISES_LIBRARY } from '../data/mockData';
import { usePersistentState } from '../lib/storage';
import { deleteVideoFile } from '../lib/videoStore';

interface ExerciseLibraryValue {
  exercises: Exercise[];
  getExercise: (id: string) => Exercise | undefined;
  saveExercise: (exercise: Exercise) => void;
  deleteExercise: (id: string) => void;
}

const ExerciseLibraryContext = createContext<ExerciseLibraryValue | null>(null);

export const ExerciseLibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [exercises, setExercises] = usePersistentState<Exercise[]>(
    'pf.exercises.v1',
    () => EXERCISES_LIBRARY
  );

  const getExercise = (id: string) => exercises.find((e) => e.id === id);

  const saveExercise = (exercise: Exercise) => {
    const previous = exercises.find((e) => e.id === exercise.id);
    // Replacing or removing an uploaded file: free the old one.
    if (
      previous?.video?.kind === 'file' &&
      previous.video.src !== exercise.video?.src
    ) {
      void deleteVideoFile(previous.video.src);
    }
    setExercises((list) =>
      previous ? list.map((e) => (e.id === exercise.id ? exercise : e)) : [exercise, ...list]
    );
  };

  const deleteExercise = (id: string) => {
    const ex = exercises.find((e) => e.id === id);
    if (ex?.video?.kind === 'file') void deleteVideoFile(ex.video.src);
    setExercises((list) => list.filter((e) => e.id !== id));
  };

  return (
    <ExerciseLibraryContext.Provider value={{ exercises, getExercise, saveExercise, deleteExercise }}>
      {children}
    </ExerciseLibraryContext.Provider>
  );
};

export function useExerciseLibrary(): ExerciseLibraryValue {
  const ctx = useContext(ExerciseLibraryContext);
  if (!ctx) throw new Error('useExerciseLibrary must be used inside ExerciseLibraryProvider');
  return ctx;
}
