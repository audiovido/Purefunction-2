import React, { useEffect, useState } from 'react';
import { supabase } from '../../cloud/supabase';
import { BodyFigure } from '../BodyFigure';
import { GaitCompare } from './GaitCompare';
import type { Pose, View } from '../../lib/bodyModel';
import type { ClientProfile } from '../../types';
import {
  OBSERVATION_OPTIONS, emptyPosture, observationIsConfirmed,
  postureMeasurements, mayShowClientPosture, PostureAssessment, ObservationId, Region
} from '../../lib/postureAssessment';
import { REVIEW_STATUS, PATTERN_FRAMEWORKS } from '../../lib/patternRules/v1';

const btn='min-h-11 rounded-xl px-3 py-2 text-sm font-semibold border border-gray-200';
/** Reuses Gemini's existing BodyFigure. No reconstructed anatomy. Front/rear have opposite viewer mapping. */
export const PostureOverview: React.FC<{
  client: ClientProfile; onUpdateClient?: (c: ClientProfile) => void; coach?: boolean; children?: React.ReactNode;
}> = ({client,onUpdateClient,coach=false,children}) => {
  const latest = client.assessments?.at(-1);
  const date = latest?.date ?? new Date().toISOString().slice(0,10);
  const [dbReady, setDbReady] = useState(!supabase);
  const [privateDraft, setPrivateDraft] = useState<PostureAssessment | null>(null);
  const [published, setPublished] = useState<PostureAssessment | null>(null);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const table = coach ? 'posture_reviews_secure' : 'posture_public_reports';
    const q = supabase.from(table).select('data').eq('client_id', client.id);
    const query = coach ? q.eq('assessment_id', 'draft').maybeSingle() : q.order('created_at', {ascending:false}).limit(1).maybeSingle();
    void query.then(({data,error}) => {
      if (!active) return;
      if (error) { setDbReady(false); return; }
      setDbReady(true);
      if (coach) setPrivateDraft(data?.data as PostureAssessment | null);
      else setPublished(data?.data ? {...emptyPosture(date),...data.data} as PostureAssessment : null);
    });
    return () => {active=false;};
  },[client.id,coach,date]);
  const original = published;
  const active: PostureAssessment = coach ? (privateDraft ?? client.postureDraft ?? emptyPosture(date)) : (original ?? emptyPosture(date));
  const [view,setView] = useState<'front'|'side'|'rear'>(active.visualSettings.view);
  const [highlight,setHighlight] = useState<Region|null>(null);
  const [showDraft,setShowDraft] = useState(false);
  const [editSummary,setEditSummary] = useState('');
  const measurements = original && !coach ? original.measurements : postureMeasurements((latest?.rom ?? client.rom),date);
  const confirmed = (id: ObservationId) => observationIsConfirmed(active,id);
  const pose: Pose = {
    ...(confirmed('left-shoulder-high') ? {shoulderTilt:-3} : confirmed('right-shoulder-high') ? {shoulderTilt:3} : {}),
    ...(confirmed('pelvis-rotates-left') ? {trunkLean:-2} : confirmed('pelvis-rotates-right') ? {trunkLean:2} : {})
  };
  const save = async (next: PostureAssessment) => {
    setSaveError('');
    const stored = {...next, measurements: postureMeasurements((latest?.rom ?? client.rom), date)};
    if (supabase) {
      const {error} = await supabase.from('posture_reviews_secure').upsert({
        client_id:client.id,assessment_id:'draft',data:stored
      },{onConflict:'client_id,assessment_id'});
      if (error) {setSaveError(error.message);return false;}
      setPrivateDraft(stored); return true;
    }
    onUpdateClient?.({...client,postureDraft:stored}); return true;
  };
  const approve = async () => {
    const next={...active,summary:editSummary||active.summary,summaryApprovedByCoach:true};
    if (!await save(next)) return;
    if (supabase && latest) {
      const {error} = await supabase.rpc('pf_publish_posture_review',{p_client_id:client.id,p_assessment_id:latest.id});
      if (error) {setSaveError(error.message);return;}
    }
    setEditSummary('');
  };
  const change = (id: ObservationId) => {
    const opt=OBSERVATION_OPTIONS.find(o=>o.id===id)!;
    const observations = active.observations.filter(o=>o.id!==id);
    if (!confirmed(id)) observations.push({id,region:opt.region,label:opt.label,confirmed:true,recordedAt:new Date().toISOString()});
    void save({...active,recordedAt:new Date().toISOString(),observations,summaryApprovedByCoach:false});
  };
  const updatePattern = (patch: Partial<PostureAssessment['interpretation']>) => void save({...active,interpretation:{...active.interpretation,...patch,ruleVersion:active.interpretation.ruleVersion}});
  if (!dbReady || (!coach && !mayShowClientPosture(original))) return null;
  const missing = measurements.filter(m=>!m.wasMeasured);
  const measured = measurements.filter(m=>m.wasMeasured);
  return <section aria-label="Posture explanation" className="min-w-0 mt-6 mb-6 bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 space-y-4">
    <header><h2 className="text-xl font-bold text-[#111827]">Posture Overview · {date}</h2>
      <p className="text-sm text-gray-600">Measurements describe available movement. Only coach-confirmed observations can change the illustration.</p></header>
    {(!coach || active.summaryApprovedByCoach) && <p className="bg-[#FFF8DC] p-3 rounded-xl text-sm">{active.summary || 'Your coach is preparing your movement summary.'}</p>}
    <div className="flex flex-wrap gap-2" role="group" aria-label="Body view">{(['front','side','rear'] as const).map(v=><button key={v} className={`${btn} ${view===v?'bg-[#111827] text-white':''}`} onClick={()=>setView(v)}>{v==='front'?'Front':v==='side'?'Side':'Rear'}</button>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
      <div className="min-w-0 rounded-xl bg-[#F5F5F5] border border-gray-200 p-3">
        <div className="text-sm font-semibold">{view==='front'?'Facing you':view==='rear'?'Viewed from behind':'Side view'} · observed features only</div>
        <div className="relative h-[340px] sm:h-[410px] w-full" style={{outline:highlight?'2px solid #EAB308':'none'}}>
          <div className={view==='rear'?'h-full [transform:scaleX(-1)]':'h-full'}>
            <BodyFigure view={(view==='rear'?'front':view) as View} pose={pose} className="w-full h-full" title="Coach-confirmed posture illustration" />
          </div>
        </div>
        <p className="text-xs font-semibold text-gray-700 text-center">Client LEFT {view==='front'?'(viewer right)':view==='rear'?'(viewer left)':'(anatomical)'} · Client RIGHT {view==='front'?'(viewer left)':view==='rear'?'(viewer right)':'(anatomical)'}</p>
        <p className="text-xs text-gray-500 mt-2">Unknown regions stay neutral. ROM does not set shoulder, pelvis, rib or foot angles.</p>
      </div>
      <div className="space-y-3 min-w-0"><h3 className="text-sm font-bold">What we measured</h3>
        <div className="max-h-64 overflow-y-auto space-y-1">{measurements.map(m=><button key={m.id} type="button" onClick={()=>setHighlight(/shoulder/i.test(m.name)?'shoulder':/hip/i.test(m.name)?'hip':/ankle|foot/i.test(m.name)?'foot':'pelvis')}
          className="w-full min-h-11 text-left text-sm border border-gray-200 rounded-lg px-3 py-2">
          <span className="font-semibold">{m.name} · {m.side}</span>: {m.wasMeasured?`${m.value}${m.unit}`:'Not measured'}
          <span className="block text-xs text-gray-500">Measured · {m.testingPosition} · {m.recordedAt}</span>
        </button>)}</div>
        <h3 className="text-sm font-bold">What we observed</h3>
        <div className="space-y-1">{active.observations.filter(o=>o.confirmed).map(o=><button onClick={()=>setHighlight(o.region)} key={o.id} className="w-full min-h-11 text-left px-3 py-2 border rounded-lg text-sm">{o.label} <span className="text-xs text-gray-500">· Observed</span></button>)}
        {!active.observations.some(o=>o.confirmed) && <p className="text-sm text-gray-500">Needs observation</p>}</div>
      </div>
    </div>
    {coach && onUpdateClient && <div className="border-t pt-4 space-y-3">
      <h3 className="text-base font-bold">Coach observation checklist</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{OBSERVATION_OPTIONS.map(o=><label key={o.id} className="min-h-11 flex gap-3 items-center p-2 border border-gray-200 rounded-xl text-sm"><input type="checkbox" className="h-5 w-5" checked={confirmed(o.id)} onChange={()=>change(o.id)}/>{o.label}</label>)}</div>
      <label className="block text-sm font-semibold">Client-friendly summary<textarea rows={3} className="w-full min-h-20 border rounded-xl px-3 py-2 text-base mt-1" value={editSummary || active.summary} onChange={e=>setEditSummary(e.target.value)} /></label>
      <button className={`${btn} bg-[#111827] text-white disabled:opacity-50`} disabled={!!supabase&&!latest} onClick={()=>void approve()}>Approve and publish summary</button>
      <div><label className="flex items-center gap-2 min-h-11 text-sm"><input type="checkbox" checked={showDraft} onChange={e=>setShowDraft(e.target.checked)}/>Draft rules — not for clients</label>
      {showDraft && <div className="border border-amber-300 bg-amber-50 rounded-xl p-3 space-y-2">
        <p className="text-xs font-bold text-amber-900">{REVIEW_STATUS}</p>
        <p className="text-xs">{PATTERN_FRAMEWORKS.AIA}; {PATTERN_FRAMEWORKS.PRI}. No inference from a single ROM value.</p>
        <select aria-label="Pattern framework" className="border rounded-lg p-3 text-base w-full" value={active.interpretation.framework} onChange={e=>updatePattern({framework:e.target.value as PostureAssessment['interpretation']['framework']})}><option>AIA</option><option>PRI</option><option>Other</option></select>
        <input aria-label="Coach selected pattern" placeholder="Coach-reported pattern (not automatic)" className="border rounded-lg p-3 text-base w-full" value={active.interpretation.pattern} onChange={e=>updatePattern({pattern:e.target.value})}/>
        <textarea aria-label="Coach pattern rationale" rows={2} className="border rounded-lg p-3 text-base w-full" placeholder="Support, conflicts and missing tests (required before confirmation)" value={active.interpretation.coachNote} onChange={e=>updatePattern({coachNote:e.target.value})}/>
        {(['support','conflict','missing'] as const).map(field=><label key={field} className="block text-xs font-semibold">{field==='support'?'Supporting findings':field==='conflict'?'Conflicting findings':'Tests still needed'}<textarea rows={2} className="border rounded-lg p-3 text-base w-full mt-1" value={active.interpretation[field].join('\n')} onChange={e=>updatePattern({[field]:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})} /></label>)}
        <button className={btn} disabled={!active.interpretation.pattern.trim()} onClick={()=>updatePattern({status:'possible'})}>Possible pattern (draft)</button>
        <button className={btn} disabled={!active.interpretation.pattern.trim()||!active.interpretation.coachNote.trim()||!active.interpretation.support.length} onClick={()=>updatePattern({status:'confirmed',confirmedBy:'Coach'})}>Coach confirm</button>
        <button className={btn} onClick={()=>updatePattern({status:'rejected'})}>Reject</button>
        <p className="text-xs">Status: {active.interpretation.status}. No automated recommendations until rule review.</p>
      </div>}</div>
    </div>}
    <div className="space-y-2 border-t pt-4 text-sm">
      <h3 className="font-bold">Possible movement strategy</h3><p>{active.interpretation.status==='confirmed' ? `Coach-confirmed observation: ${active.interpretation.pattern}. This may be associated with other regional findings; it is not a diagnosis.` : 'Insufficient information for a pattern interpretation.'}</p>
      <h3 className="font-bold">What we still need to check</h3><p>{missing.length?`${missing.length} unmeasured sides. `:''}Confirm posture and gait findings through direct observation; review conflicting tests before assigning patterns.</p>
      <p className="text-xs text-gray-500">Discomfort is reported separately; ROM does not measure pain, tissue damage or forces.</p>
    </div>
    {saveError && <p role="alert" className="text-sm text-red-700">Not saved: {saveError}</p>}
    {import.meta.env.VITE_ENABLE_GAIT_COMPARE === 'true' && <GaitCompare assessment={coach ? active : original} />}
    {children}
  </section>;
};
