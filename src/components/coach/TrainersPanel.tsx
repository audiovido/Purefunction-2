import React, { useEffect, useState } from 'react';
import { supabase } from '../../cloud/supabase';
import type { ClientProfile } from '../../types';

type Trainer = { email: string; coach_id: string | null; display_name: string; verified: boolean };
type Assignment = { coach_id: string; client_id: string };

/** Admin-only trainer settings. No RPC/table in the DB means this feature stays hidden. */
export const TrainersPanel: React.FC<{ clients: ClientProfile[] }> = ({ clients }) => {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!supabase) return;
    const { data: isHead, error } = await supabase.rpc('pf_head_coach');
    if (error || isHead !== true) { setEnabled(false); return; }
    setEnabled(true);
    const [a, b] = await Promise.all([
      supabase.rpc('pf_list_trainers'),
      supabase.from('coach_client_assignments').select('coach_id, client_id')
    ]);
    if (a.error || b.error) { setMessage('Trainer settings unavailable.'); return; }
    setTrainers((a.data ?? []) as Trainer[]);
    setAssignments((b.data ?? []) as Assignment[]);
  };
  useEffect(() => { void refresh(); }, []);
  if (!enabled) return null;

  const act = async (action: 'invite' | 'assign' | 'unassign', trainerEmail: string, clientId?: string) => {
    if (!supabase || busy) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('pf_manage_trainer', {
      p_action: action, p_email: trainerEmail.trim().toLowerCase(), p_client_id: clientId ?? null
    });
    if (error) setMessage(error.message);
    else if (action === 'invite') {
      const res = await supabase.functions.invoke('invite-trainer', { body: { email: trainerEmail.trim().toLowerCase() } });
      setMessage(res.error ? 'Allowlisted. Email delivery failed; retry from the trainer email provider.' : 'Invitation sent. Trainer must verify their email.');
      setEmail('');
    } else setMessage('Assignment saved.');
    await refresh(); setBusy(false);
  };

  return <section className="min-w-0 mt-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6" aria-label="Trainer settings">
    <h2 className="text-lg font-bold text-[#111827]">Settings · Trainers</h2>
    <p className="text-sm text-gray-600 mt-1 mb-4">Only the head coach can invite trainers or change client assignments.</p>
    <form onSubmit={(e) => { e.preventDefault(); void act('invite', email); }} className="flex flex-wrap gap-2 mb-4">
      <input aria-label="Trainer email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="trainer@example.com" className="min-h-11 min-w-0 flex-1 basis-48 border border-gray-300 rounded-xl px-3 text-base" />
      <button disabled={busy} className="min-h-11 px-4 bg-[#111827] text-white rounded-xl font-semibold disabled:opacity-50">Invite trainer</button>
    </form>
    {message && <p role="status" className="text-sm text-gray-700 mb-3">{message}</p>}
    <div className="grid grid-cols-1 gap-4">
      {trainers.map(t => <article key={t.email} className="min-w-0 border rounded-xl p-3">
        <p className="font-semibold text-[#111827] break-all">{t.display_name || t.email}</p>
        <p className="text-xs text-gray-500 break-all">{t.email} · {t.verified ? 'Verified coach' : 'Awaiting verified registration'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
          {clients.map(c => {
            const assigned = !!t.coach_id && assignments.some(a => a.coach_id === t.coach_id && a.client_id === c.id);
            return <button key={c.id} type="button" disabled={busy || !t.verified || !t.coach_id} onClick={() => void act(assigned ? 'unassign' : 'assign', t.email, c.id)}
              className={`min-h-11 text-left text-sm px-3 py-2 rounded-xl border disabled:opacity-50 ${assigned ? 'bg-[#FFF5C9] border-[#D5AF20]' : 'bg-gray-50 border-gray-200'}`}>
              {assigned ? '✓ ' : '+ '}{c.name}
            </button>;
          })}
        </div>
      </article>)}
    </div>
  </section>;
};
