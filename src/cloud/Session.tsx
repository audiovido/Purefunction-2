import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloud, supabase, supabaseUrl } from './supabase';

export interface Profile {
  id: string;
  role: 'coach' | 'client';
  displayName: string;
  clientId: string | null;
  email: string;
}

export type SessionStatus =
  | 'local' // no cloud configured: demo mode on this device
  | 'loading'
  | 'signed-out'
  | 'no-access' // signed in, but not the coach and not on a client list
  | 'reset' // opened a password-reset link: choose a new password
  | 'ready';

interface SessionValue {
  status: SessionStatus;
  profile: Profile | null;
  email: string | null;
  signIn: (email: string, password: string, role: Profile['role']) => Promise<string | null>;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  resendVerification: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** One-time message for the sign-in screen (e.g. expired reset link). */
  notice: string | null;
  /** Emails a reset link. Returns an error message or null. */
  forgotPassword: (email: string) => Promise<string | null>;
  /** After opening a reset link: saves the new password and continues into the app. */
  setNewPassword: (password: string) => Promise<string | null>;
  /** Re-checks access, e.g. after the coach adds this email. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is not correct.';
  if (/email not confirmed/i.test(message)) return 'This account isn’t confirmed yet.';
  if (/network|fetch/i.test(message)) return 'No connection. Check your internet and try again.';
  return message;
}

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SessionStatus>(isCloud ? 'loading' : 'local');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // SIGNED_IN fires before signInWithPassword returns. Do not mount a workspace
  // until this attempt's database role has been checked against the chosen entry.
  const signInPending = React.useRef(false);
  const profileVersion = React.useRef(0);

  const resetPending = React.useRef(new URLSearchParams(window.location.search).has('reset'));

  const loadProfile = useCallback(async (s: Session | null, expectedRole?: Profile['role']): Promise<string | null> => {
    if (!supabase) return 'Cloud is not configured.';
    const version = ++profileVersion.current;
    if (!s) {
      setProfile(null);
      setStatus('signed-out');
      return null;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, client_id')
      .eq('id', s.user.id)
      .maybeSingle();
    if (version !== profileVersion.current) return 'Sign-in changed. Please try again.';
    if (expectedRole && (error || !data || data.role !== expectedRole)) {
      if (error) return 'Could not verify your account. Please try again.';
      return expectedRole === 'coach'
        ? 'This account cannot sign in as a coach. Choose “I’m a client” to sign in with a client account.'
        : 'This account cannot sign in as a client. Choose “I’m the coach” to sign in with a coach account.';
    }
    if (error || !data || (data.role !== 'coach' && data.role !== 'client')) {
      setProfile(null);
      setStatus('no-access');
      return null;
    }
    const next: Profile = {
      id: data.id,
      role: data.role,
      displayName: data.display_name,
      clientId: data.client_id,
      email: s.user.email ?? ''
    };
    // Supabase announces SIGNED_IN again every time the tab/app comes back into view. Keep the
    // same object when nothing changed, so the app does not reload all its data and reset the page.
    setProfile((prev) =>
      prev &&
      prev.id === next.id &&
      prev.role === next.role &&
      prev.displayName === next.displayName &&
      prev.clientId === next.clientId &&
      prev.email === next.email
        ? prev
        : next
    );
    setStatus('ready');
    return null;
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    const verifyToken = params.get('verify');
    const start = async () => {
      if (verifyToken && !resetToken) {
        const url = new URL(window.location.href);
        url.searchParams.delete('verify');
        window.history.replaceState(null, '', url.toString());
        const { error } = await supabase!.auth.verifyOtp({ type: 'signup', token_hash: verifyToken });
        if (!active) return;
        if (error) setNotice('Verification link expired or invalid. Contact your coach for a new invitation.');
        else setNotice('Email verified. Your account is ready.');
      }
      if (resetToken) {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset');
        window.history.replaceState(null, '', url.toString());
        const { data, error } = await supabase!.auth.verifyOtp({ type: 'recovery', token_hash: resetToken });
        if (!active) return;
        if (!error && data.session) {
          setSession(data.session);
          setStatus('reset');
          return;
        }
        resetPending.current = false;
        setNotice('That reset link has expired or was already used. Send a new one below.');
      }
      const { data } = await supabase!.auth.getSession();
      if (!active) return;
      setSession(data.session);
      void loadProfile(data.session);
    };
    void start();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (signInPending.current) return;
      setSession(s);
      if (event === 'SIGNED_OUT' || ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && !resetPending.current)) {
        // defer: Supabase recommends not awaiting other calls inside this callback
        window.setTimeout(() => {
          if (!signInPending.current) void loadProfile(s);
        }, 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string, role: Profile['role']) => {
    if (!supabase) return 'Cloud is not configured.';
    if (signInPending.current) return 'Sign-in is already in progress.';
    signInPending.current = true;
    ++profileVersion.current;
    let accepted = false;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return friendlyAuthError(error.message);
      if (!data.session) return 'Could not sign in. Please try again.';
      const roleError = await loadProfile(data.session, role);
      if (roleError) return roleError;
      setSession(data.session);
      accepted = true;
      return null;
    } catch {
      return 'Could not verify your account. Please try again.';
    } finally {
      if (!accepted) {
        // Reject this browser session without signing out other devices.
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {
          // Keep the workspace blocked even if local storage is unavailable.
        } finally {
          ++profileVersion.current;
          setSession(null);
          setProfile(null);
          setStatus('signed-out');
        }
      }
      signInPending.current = false;
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    if (!supabase) return 'Cloud is not configured.';
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return body.error ?? 'Could not create the account. Try again.';
    } catch {
      return 'No connection. Check your internet and try again.';
    }
    // Signing in before email ownership is verified is intentionally forbidden.
    return 'verification-email-sent';
  };

  const resendVerification = async (email: string) => {
    if (!supabase) return 'Cloud is not configured.';
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/sign-up`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', email: email.trim() })
      });
      return response.ok ? null : 'Could not request a new link. Try again later.';
    } catch { return 'No connection. Check your internet and try again.'; }
  };

  const forgotPassword = async (email: string) => {
    if (!supabase) return 'Cloud is not configured.';
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok ? null : body.error ?? 'Could not send the email. Try again.';
    } catch {
      return 'No connection. Check your internet and try again.';
    }
  };

  const setNewPassword = async (password: string) => {
    if (!supabase) return 'Cloud is not configured.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) return friendlyAuthError(error.message);
    resetPending.current = false;
    const { data: s } = await supabase.auth.getSession();
    void data;
    await loadProfile(s.session);
    return null;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setStatus('signed-out');
  };

  return (
    <SessionContext.Provider
      value={{
        status,
        profile,
        email: session?.user.email ?? null,
        signIn,
        signUp,
        resendVerification,
        signOut,
        notice,
        forgotPassword,
        setNewPassword,
        refresh: async () => { await loadProfile(session); }
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
