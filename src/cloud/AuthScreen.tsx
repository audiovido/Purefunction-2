import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { PureFunctionLogo } from '../components/VisualAssets';
import { useSession } from './Session';

const input =
  'w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:border-[#111827]';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh bg-[#F7F8FA] flex flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
    <div className="mb-8">
      <PureFunctionLogo />
    </div>
    <div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100 p-6 sm:p-7">
      {children}
    </div>
  </div>
);

export const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'sign-up' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    const err = mode === 'sign-in' ? await signIn(email, password) : await signUp(email, password, name);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-[#111827] mb-1">
        {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {mode === 'sign-in'
          ? 'Sign in to see your training.'
          : 'Use the email your coach added for you.'}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'sign-up' && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="name"
            className={input}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          required
          className={input}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'sign-up' ? 'Password (8+ characters)' : 'Password'}
          aria-label="Password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          required
          className={input}
        />

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 bg-[#111827] hover:bg-[#1F2937] disabled:opacity-60 text-white text-base font-semibold py-3.5 rounded-xl cursor-pointer"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="mt-5 text-center text-sm text-gray-500">
        {mode === 'sign-in' ? 'New here? ' : 'Already have an account? '}
        <button
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
          }}
          className="font-semibold text-[#111827] underline cursor-pointer"
        >
          {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
        </button>
      </div>
    </Shell>
  );
};

export const NoAccessScreen: React.FC = () => {
  const { email, refresh, signOut } = useSession();
  const [checking, setChecking] = useState(false);
  return (
    <Shell>
      <h1 className="text-xl font-bold text-[#111827] mb-2">Almost there</h1>
      <p className="text-sm text-gray-600 mb-5">
        You’re signed in as <b className="text-[#111827] break-all">{email}</b>, but your coach hasn’t added this
        email yet. Ask them to add it, then tap “Check again”.
      </p>
      <button
        onClick={async () => {
          setChecking(true);
          await refresh();
          setChecking(false);
        }}
        className="w-full inline-flex items-center justify-center gap-2 bg-[#111827] text-white text-base font-semibold py-3.5 rounded-xl cursor-pointer mb-2"
      >
        {checking && <Loader2 className="w-4 h-4 animate-spin" />}
        Check again
      </button>
      <button onClick={() => void signOut()} className="w-full text-sm font-medium text-gray-500 py-2 cursor-pointer">
        Sign out
      </button>
    </Shell>
  );
};

export const LoadingScreen: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="min-h-dvh bg-[#F7F8FA] flex flex-col items-center justify-center gap-4">
    <PureFunctionLogo />
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  </div>
);
