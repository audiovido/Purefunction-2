import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SessionProvider } from './cloud/Session';

createRoot(document.getElementById('root')!).render(
  <SessionProvider>
    <App />
  </SessionProvider>
);
