import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../cloud/supabase';
import { addDays, todayISO } from '../lib/workouts';
import { dayTotals, FoodEntry, FoodItem, FoodUnit, freshItem, portionUpdate } from '../lib/foodDiary';
import type { NutritionPlan } from '../types';

const button = 'min-h-11 rounded-xl px-3 py-2 text-sm font-semibold border border-gray-200 bg-white text-[#111827] disabled:opacity-50';
const input = 'min-h-11 min-w-0 w-full rounded-xl border border-gray-200 px-3 py-2 text-base bg-white';
const units: FoodUnit[] = ['g', 'oz', 'cup', 'tbsp', 'piece', 'serving'];
type EntryRow = Omit<FoodEntry, 'items'>;
type FoodRow = FoodItem & { entry_id: string; client_id: string };

/** A missing SQL table disables the new diary, leaving old nutrition data readable. */
export const FoodDiary: React.FC<{ clientId: string; mode: 'coach' | 'client'; legacy?: React.ReactNode; legacyPlan?: NutritionPlan }> = ({ clientId, mode, legacy, legacyPlan }) => {
  const [enabled, setEnabled] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [favorites, setFavorites] = useState<{ id: string; name: string; items: FoodItem[] }[]>([]);
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<FoodItem[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const saving = useRef(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legacyOpen, setLegacyOpen] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    const [e, i, f] = await Promise.all([
      supabase.from('food_entries').select('*').eq('client_id', clientId).order('date', { ascending: false }).limit(300),
      supabase.from('food_items').select('*').eq('client_id', clientId),
      supabase.from('favorite_meals').select('*').eq('client_id', clientId)
    ]);
    if (e.error || i.error || f.error) { setEnabled(false); return; }
    setEnabled(true);
    const items = (i.data ?? []) as FoodRow[];
    setEntries(((e.data ?? []) as EntryRow[]).map(r => ({ ...r, items: items.filter(x => x.entry_id === r.id).map(({ entry_id: _e, client_id: _c, ...rest }) => rest) })));
    setFavorites((f.data ?? []).map(r => ({ id: r.id as string, name: r.name as string, items: r.items as FoodItem[] })));
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);
  const today = useMemo(() => entries.filter(e => e.date === date), [entries, date]);
  const totals = dayTotals(today);
  const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const editing = mode === 'client';

  const analyze = async () => {
    if (!supabase || !description.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const { data, error: err } = await supabase.functions.invoke('food-parse', { body: { description } });
      if (err || !data?.items?.length) throw Error('Analysis unavailable');
      setDraft((data.items as FoodItem[]).map(i => ({ ...i, id: crypto.randomUUID() })));
      setQuestions((data.questions ?? []) as string[]);
    } catch { setError('AI unavailable. Add foods manually; no entry has been lost.'); setDraft([freshItem()]); }
    setBusy(false);
  };
  const save = async () => {
    if (!supabase || busy || saving.current || draft === null || draft.length === 0 || draft.some(i => !i.name.trim() || i.quantity <= 0)) {
      setError('Enter a food name and positive portion for every item.'); return;
    }
    saving.current = true; setBusy(true); setError('');
    const previous = entries.find(e => e.id === editId);
    const key = previous?.idempotency_key ?? pendingKey.current ?? crypto.randomUUID();
    pendingKey.current = key;
    const status: FoodEntry['status'] = draft.some(i => i.kcal == null || i.protein == null) ? 'incomplete' : 'confirmed';
    try {
      const { error: err } = await supabase.rpc('pf_save_food_entry', {
        p_client_id: clientId, p_existing_id: editId, p_date: date,
        p_description: description.trim() || draft.map(i => i.name).join(', '),
        p_key: key, p_status: status, p_items: draft
      });
      if (err) throw Error(err.message);
      setDraft(null); setEditId(null); pendingKey.current = null; setDescription(''); setQuestions([]); await load();
    } catch (e) { setError(`Not saved: ${(e as Error).message}. Retry keeps the same entry key.`); }
    saving.current = false; setBusy(false);
  };
  const remove = async (id: string) => {
    if (!supabase || busy) return;
    setBusy(true);
    const { error: err } = await supabase.from('food_entries').delete().eq('id', id).eq('client_id', clientId);
    if (err) setError(err.message); else await load();
    setBusy(false);
  };
  const begin = (e?: FoodEntry) => { pendingKey.current = null; setEditId(e?.id ?? null); setDraft(e ? structuredClone(e.items) : [freshItem()]); setDescription(e?.description ?? ''); setQuestions([]); setError(''); };
  const clone = (e: FoodEntry) => { pendingKey.current = null; setEditId(null); setDraft(structuredClone(e.items)); setDescription(e.description); setError(''); };
  const saveFavorite = async (e: FoodEntry) => {
    if (!supabase) return;
    const res = await supabase.from('favorite_meals').insert({ id: crypto.randomUUID(), client_id: clientId, name: e.description, items: e.items });
    if (res.error) setError(res.error.message); else await load();
  };
  if (!enabled) return <>{legacy}</>;
  return <section className="min-w-0 rounded-2xl bg-white border border-gray-200 p-4 sm:p-5 space-y-4" aria-label="Food diary">
    <div><h2 className="text-xl font-bold text-[#111827]">Food diary</h2><p className="text-xs text-gray-500">Only food you logged is counted. Estimates can be incomplete.</p></div>
    <label className="block text-sm font-semibold">Selected date<input className={input} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-100 p-3"><p className="text-xs text-gray-500">Logged today · calories</p><strong className="text-xl">{totals.kcal ?? 'Not measured'}{totals.kcal != null && ' kcal'}</strong></div>
    <div className="rounded-xl bg-gray-100 p-3"><p className="text-xs text-gray-500">Logged today · protein</p><strong className="text-xl">{totals.protein ?? 'Not measured'}{totals.protein != null && ' g'}</strong></div></div>
    {totals.hasUnknown && <p className="text-xs text-amber-800">Incomplete nutrient information is excluded from these logged totals, not counted as zero.</p>}
    {mode === 'coach' && <div><h3 className="text-sm font-semibold">Days logged · last 7</h3><div className="grid grid-cols-7 gap-1">{lastWeek.map(d => <div key={d} className="rounded-lg p-1 bg-gray-100 text-center text-[11px]" title={d}><span>{d.slice(8)}</span><div className="font-semibold">{entries.some(e => e.date === d) ? '✓' : '—'}</div></div>)}</div><p className="text-xs text-gray-500 mt-2">— means not logged, not zero intake.</p></div>}
    <div className="space-y-2">{today.length === 0 && <p className="text-sm text-gray-500">Nothing logged for this day.</p>}{today.map(e => <article key={e.id} className="border border-gray-200 rounded-xl p-3 min-w-0">
      <p className="font-semibold break-words">{e.description}</p><p className="text-xs text-gray-500">{e.status === 'incomplete' ? 'Incomplete estimate' : 'Estimate · confirmed by client'}</p>
      {e.items.map(i => <p key={i.id} className="text-sm text-gray-600 break-words">{i.name} · {i.quantity} {i.unit} · {i.kcal ?? '?'} kcal · {i.protein ?? '?'} g protein · {i.source} {i.assumptions && `· ${i.assumptions}`}</p>)}
      {editing && <div className="flex flex-wrap gap-2 mt-2"><button className={button} onClick={() => begin(e)}>Edit</button><button className={button} onClick={() => clone(e)}>Copy</button><button className={button} onClick={() => void saveFavorite(e)}>Save favorite</button><button className={button} onClick={() => void remove(e.id)}>Delete</button></div>}
    </article>)}</div>
    {editing && <><div className="flex flex-wrap gap-2"><button className={`${button} bg-[#111827] text-white`} onClick={() => begin()}>Type a meal</button><button className={button} disabled title="Coming soon">Take/upload a photo · coming soon</button></div>
    {favorites.length > 0 && <label className="text-sm font-semibold block">Frequent meals<select className={input} defaultValue="" onChange={e => { const f = favorites.find(x => x.id === e.target.value); if (f) { pendingKey.current = null; setEditId(null); setDraft(structuredClone(f.items)); setDescription(f.name); } }}><option value="">Choose a favorite…</option>{favorites.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}</>}
    {editing && draft !== null && <div className="space-y-3 p-3 rounded-xl bg-[#F7F7F7]">
      <label className="block text-sm font-semibold">Describe your meal<textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${input} mt-1`} placeholder="Three eggs, sourdough, half avocado, coffee with milk" /></label>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !description.trim()} onClick={() => void analyze()}>Analyze with AI + USDA</button><button className={button} onClick={() => setDraft([...draft, freshItem()])}>+ Food manually</button></div>
      {questions.map(q => <p key={q} className="text-xs text-amber-800">Please check: {q}</p>)}
      {draft.map((i, index) => <div key={i.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-white">
        <label className="block text-xs">Food<input className={input} value={i.name} onChange={e => setDraft(draft.map((x,k) => k===index?{...x,name:e.target.value}:x))} /></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs">Portion<input type="number" min="0.01" step="any" className={input} value={i.quantity} onChange={e=>setDraft(draft.map((x,k)=>k===index?portionUpdate(x,Number(e.target.value)):x))}/></label>
        <label className="text-xs">Unit<select className={input} value={i.unit} onChange={e=>setDraft(draft.map((x,k)=>k===index?{...x,unit:e.target.value as FoodUnit,grams:null,kcalPerGram:null,proteinPerGram:null,kcal:null,protein:null,assumptions:'Portion unit changed; check nutrients'}:x))}>{units.map(u=><option key={u}>{u}</option>)}</select></label></div>
        <label className="text-xs">Raw/cooked<select className={input} value={i.state} onChange={e=>setDraft(draft.map((x,k)=>k===index?{...x,state:e.target.value as FoodItem['state']}:x))}><option>unknown</option><option>raw</option><option>cooked</option></select></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs">Calories (kcal)<input type="number" min="0" step="any" className={input} value={i.kcal ?? ''} onChange={e=>setDraft(draft.map((x,k)=>k===index?{...x,kcal:e.target.value===''?null:Number(e.target.value),kcalPerGram:null}:x))}/></label>
        <label className="text-xs">Protein (g)<input type="number" min="0" step="any" className={input} value={i.protein ?? ''} onChange={e=>setDraft(draft.map((x,k)=>k===index?{...x,protein:e.target.value===''?null:Number(e.target.value),proteinPerGram:null}:x))}/></label></div>
        <p className="text-xs text-gray-500">{i.source} · {i.sourceId ?? 'no record'} · {i.assumptions || 'Portion is an estimate'} · {i.version}</p>
        <button className={button} onClick={() => setDraft(draft.filter((_,k)=>k!==index))}>Remove food</button>
      </div>)}
      <div className="flex gap-2"><button className={`${button} bg-[#111827] text-white`} disabled={busy} onClick={() => void save()}>{busy?'Saving…':'Save meal'}</button><button className={button} onClick={() => {setDraft(null);setEditId(null);}}>Cancel</button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {legacy && <details open={legacyOpen} onToggle={e => setLegacyOpen(e.currentTarget.open)} className="border-t pt-3"><summary className="min-h-11 font-semibold text-sm cursor-pointer">Previous nutrition data (read-only)</summary><div className="text-sm text-gray-600 mt-2 space-y-2"><p>Original plan and records are preserved, not editable here.</p><p>Previous meal plan: {legacyPlan?.mealPlan ?? '—'}</p><p>Previous coach note: {legacyPlan?.coachNote ?? '—'}</p>{(legacyPlan?.log ?? []).map(day => <p key={day.date}>{day.date} · protein {day.protein ?? 'Not logged'} g · water {day.waterL ?? 'Not logged'} L · calories {day.calories ?? 'Not logged'} kcal {day.note ?? ''}</p>)}</div></details>}
  </section>;
};
