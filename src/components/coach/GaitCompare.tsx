import React, { useEffect, useRef, useState } from 'react';
import { BodyFigure } from '../BodyFigure';
import type { Pose, View } from '../../lib/bodyModel';
import type { PostureAssessment } from '../../lib/postureAssessment';
import { observationIsConfirmed } from '../../lib/postureAssessment';

const PHASES = ['Initial contact', 'Loading response', 'Midstance', 'Terminal stance / push-off', 'Swing'] as const;
export function phaseAt(t: number): number { return Math.min(4, Math.floor(Math.max(0, Math.min(0.9999,t)) * 5)); }
export function gaitPose(t: number, view: 'front'|'side'|'rear', observations?: PostureAssessment | null): Pose {
  const cycle = Math.sin(2*Math.PI*t);
  const confirmed = (id: Parameters<typeof observationIsConfirmed>[1]) => observationIsConfirmed(observations,id);
  const bias = confirmed('right-weight-shift') ? 1 : confirmed('left-weight-shift') ? -1 : 0;
  const arm = confirmed('asymmetric-arm-swing') ? 0.6 : 1;
  const pose: Pose = view === 'side' ? {
    hipFlex: Math.round(8 + Math.max(0,cycle) * 12), kneeFlex: Math.round(Math.max(0,cycle) * 17),
    shFlex: Math.round(9 * (1-cycle*arm)), trunkLean: 0
  } : {
    hipAbdL: Math.round(Math.max(0,cycle)*4), hipAbdR: Math.round(Math.max(0,-cycle)*4),
    shAbdL: Math.round(Math.max(0,-cycle)*7*arm), shAbdR: Math.round(Math.max(0,cycle)*7)
  };
  // Qualitative exaggeration for education only; numbers are NOT measured gait angles.
  if(bias !== 0 && view !== 'side') pose.pelvisTilt = bias * 2;
  return pose;
}
/** One clock drives both BodyFigure instances; identical scale, camera and gait phase. */
export const GaitCompare: React.FC<{assessment?: PostureAssessment | null}> = ({assessment}) => {
  const [play,setPlay]=useState(false);
  const [slow,setSlow]=useState(false);
  const [view,setView]=useState<'front'|'side'|'rear'>('front');
  const [t,setT]=useState(0);
  const last=useRef<number|null>(null);
  useEffect(()=>{
    if(!play){last.current=null;return;}
    let raf=0;
    const step=(now:number)=>{
      if(last.current!==null) setT(v=>(v+(now-last.current!)/(slow?8000:4000))%1);
      last.current=now;raf=requestAnimationFrame(step);
    };
    raf=requestAnimationFrame(step);
    return ()=>{cancelAnimationFrame(raf);last.current=null;};
  },[play,slow]);
  const confirmed=(assessment?.observations??[]).filter(x=>x.confirmed && (x.region==='gait'||x.region==='pelvis'||x.region==='foot'));
  const actuallyObserved=confirmed.length>0;
  const card=(reference:boolean)=>{
    const pose=gaitPose(t,view,reference?null:assessment);
    return <div className="min-w-0 bg-[#F4F4F5] border border-gray-200 rounded-xl p-3">
      <h4 className="text-xs sm:text-sm font-bold">{reference?'Reference gait example':'Illustrative gait associated with your findings'}</h4>
      <div className="h-[240px] sm:h-[330px] w-full"><div className={view==='rear'?'h-full [transform:scaleX(-1)]':'h-full'}><BodyFigure view={(view==='rear'?'front':view) as View} pose={pose} className="w-full h-full" title={reference?'Reference illustrative gait':'Educational illustration based on coach observations'} /></div></div>
      <p className="text-xs text-gray-500 text-center">Client L / R · {view==='front'?'front-facing':view==='rear'?'rear-facing':'side-facing'}</p>
    </div>;
  };
  return <details className="border border-gray-200 rounded-2xl p-3 sm:p-4 min-w-0" aria-label="Walking comparison">
    <summary className="min-h-11 cursor-pointer flex items-center font-bold text-[#111827]">Walking comparison · educational illustrations</summary>
    <div className="space-y-3 mt-3">
      <p className="text-sm text-gray-600">{actuallyObserved?'Only confirmed qualitative gait or pelvis observations affect the illustration.':'Educational hypothesis — not a recording or measurement of you. No walking assessment available.'}</p>
      <p className="text-xs text-gray-500">The reference represents adaptable reciprocal movement, not perfect symmetry or a prescription for a single correct walk.</p>
      <div className="flex flex-wrap gap-2">{(['front','side','rear'] as const).map(v=><button key={v} onClick={()=>setView(v)} className={`min-h-11 rounded-xl px-3 text-sm border ${view===v?'bg-[#111827] text-white':'bg-white border-gray-200'}`}>{v}</button>)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">{card(false)}{card(true)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={()=>setPlay(v=>!v)} className="min-h-11 px-4 rounded-xl bg-[#111827] text-white text-sm font-semibold">{play?'Pause':'Play'}</button>
        <button aria-pressed={slow} onClick={()=>setSlow(v=>!v)} className="min-h-11 px-4 rounded-xl border text-sm">{slow?'Slow motion on':'Slow motion'}</button>
        <span className="text-xs font-semibold">{PHASES[phaseAt(t)]}</span>
      </div>
      <label className="block text-xs">Synchronized gait-cycle timeline<input aria-label="Gait cycle" type="range" min="0" max="100" value={Math.round(t*100)} onChange={e=>{setPlay(false);setT(Number(e.target.value)/100);}} className="w-full min-h-11 accent-[#EAB308]" /></label>
      {confirmed.map(o=><button key={o.id} onClick={()=>{setPlay(false);setT(o.region==='gait'?.38:.68);}} className="min-h-11 w-full text-left text-sm border rounded-xl p-2">Observed: {o.label} · Highlight {o.region==='gait'?'midstance':'terminal stance'}</button>)}
      <p className="text-xs text-gray-500">No passive ROM degrees are used as walking angles, step length, stance duration, loading or force measurements.</p>
    </div>
  </details>;
};
