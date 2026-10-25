import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ExerciseLibraryProvider } from './state/ExerciseLibrary';

createRoot(document.getElementById('root')!).render(
  <ExerciseLibraryProvider>
    <App />
  </ExerciseLibraryProvider>
);
