import React, { useEffect, useState } from 'react';
import { supabase } from '../../cloud/supabase';
import type { ClientProfile } from '../../types';

type Coach = { email: string; coach_id: string | null; display_name: string; verified: boolean };
/** Head-coach allowlist only. Each coach creates and owns their own clients. */
export const TrainersPanel: React.FC<{ clients: ClientProfile[] }> = () => {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('pf_head_coach');
    if (error || data !== true) { setEnabled(false); return; }
    setEnabled(true);
    const r = await supabase.rpc('pf_list_trainers');
    if (r.error) { setMessage('Coaches list is unavailable.'); return; }
    setCoaches((r.data ?? []) as Coach[]);
  };
  useEffect(() => { void refresh(); }, []);
  const invite = async () => {
    if (!supabase || busy) return;
    setBusy(true); setMessage('');
    const address = email.trim().toLowerCase();
    try {
      const { error } = await supabase.rpc('pf_manage_trainer', {
        p_action: 'invite', p_email: address, p_client_id: null
      });
      if (error) { setMessage(error.message); return; }
      const result = await supabase.functions.invoke('invite-trainer', { body: { email: address } });
      setMessage(result.error ? 'Coach allowlisted, but invitation email was not sent. Retry sending.' :
        'Coach invitation sent. They must verify their email before sign-in.');
      setEmail('');
      await refresh();
    } catch {
      setMessage('Could not invite this coach. Check your connection and retry.');
    } finally { setBusy(false); }
  };
  if (!enabled) return null;
  return <section aria-label="Coaches settings" className="min-w-0 max-w-2xl bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
    <h1 className="text-xl font-bold text-[#111827]">Coaches</h1>
    <p className="text-sm text-gray-600 mt-1 mb-4">Invite another coach. Each coach owns only their own clients and workouts.</p>
    <form onSubmit={e => {e.preventDefault();void invite();}} className="flex flex-col sm:flex-row gap-2 mb-4">
      <input aria-label="New coach email" type="email" autoComplete="email" required value={email}
        onChange={e=>setEmail(e.target.value)} placeholder="coach@example.com"
        className="min-h-11 min-w-0 flex-1 border border-gray-300 rounded-xl px-3 text-base" />
      <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-xl bg-[#111827] text-white font-semibold disabled:opacity-50">Invite coach</button>
    </form>
    {message && <p role="status" className="text-sm text-gray-700 mb-3">{message}</p>}
    <div className="grid grid-cols-1 gap-2">{coaches.map(c=><article key={c.email} className="min-w-0 p-3 rounded-xl border border-gray-200">
      <p className="text-sm font-semibold break-all">{c.display_name || c.email}</p>
      <p className="text-xs text-gray-600 break-all">{c.email} · {c.verified ? 'Verified coach' : 'Awaiting verification'}</p>
    </article>)}</div>
  </section>;
};
