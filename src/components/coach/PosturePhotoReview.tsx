import React, { useEffect, useMemo, useRef, useState } from 'react';
import { detectPosturePhoto } from '../../lib/poseOnDevice';
import {
  DRAFT_LEVEL_THRESHOLD_DEGREES, MIN_CONFIDENCE, POSE_LANDMARKS, PHOTO_RULE_VERSION,
  createSavedPhotoReview, landmarkLabel, manualLandmarkPoints, photoLines,
  type LandmarkKey, type PhotoPoint, type PhotoReviewRecord, type PhotoView
} from '../../lib/posturePhoto';

interface Props {
  records: readonly PhotoReviewRecord[];
  onSave: (record: PhotoReviewRecord) => Promise<boolean>;
}
const button = 'min-h-11 min-w-11 px-3 py-2 rounded-xl border border-gray-300 text-sm font-semibold';
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Photo is a transient browser object URL only. No image upload, localStorage or server image fields. */
const PosturePhotoReview: React.FC<Props> = ({ records, onSave }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PhotoView>('front');
  const [side, setSide] = useState<'L'|'R'>('L');
  const [mirrored, setMirrored] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [points, setPoints] = useState<PhotoPoint[]>([]);
  const [selected, setSelected] = useState<LandmarkKey>('left_shoulder');
  const [imageAspect, setImageAspect] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveState, setSaveState] = useState<'idle'|'saved'|'error'>('idle');
  const photoRef = useRef<HTMLImageElement>(null);
  const dragging = useRef<LandmarkKey | null>(null);
  const oldUrl = useRef<string | null>(null);
  useEffect(() => () => { if (oldUrl.current) URL.revokeObjectURL(oldUrl.current); }, []);
  const lines = useMemo(() => photoLines(points,view,side,mirrored,DRAFT_LEVEL_THRESHOLD_DEGREES,imageAspect),
    [points,view,side,mirrored,imageAspect]);

  const choosePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
      setMessage('Use a JPEG, PNG or similar photo smaller than 12 MB.'); return;
    }
    if (oldUrl.current) URL.revokeObjectURL(oldUrl.current);
    const url = URL.createObjectURL(file);
    oldUrl.current = url;
    setPhotoUrl(url);
    setPoints([]);
    setMessage('Photo stays on this device. Tap Detect joints, then confirm or adjust the landmarks.');
    setSaveState('idle');
  };
  const run = async () => {
    if (!photoRef.current || !photoUrl) return;
    setAnalyzing(true); setMessage('Detecting body joints on this device…');
    try {
      const result = await detectPosturePhoto(photoRef.current);
      setPoints(result);
      setMessage('All detected points need coach review. Low-confidence points are not included automatically.');
      setSaveState('idle');
    } catch (error) {
      const reason = (error instanceof Error ? error.message : 'check local model assets').replace(/[.!?\s]+$/, '');
      setMessage(`Detection unavailable: ${reason}. Use Place points manually to continue.`);
    } finally { setAnalyzing(false); }
  };
  const placePointsManually = () => {
    if (!photoUrl) return;
    setPoints(manualLandmarkPoints(view, side, mirrored));
    setSelected(side === 'R' ? 'right_shoulder' : 'left_shoulder');
    setMessage('Illustrative starting points placed. Drag and confirm each visible point. No automatic findings.');
    setSaveState('idle');
  };
  const patchPoint = (key: LandmarkKey, patch: Partial<PhotoPoint>) => {
    setPoints(current => current.map(p => p.key === key ? { ...p, ...patch } : p));
    setSaveState('idle');
  };
  const setCoordinate = (key: LandmarkKey, clientX: number, clientY: number) => {
    const bounds = photoRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;
    patchPoint(key, {x:clamp((clientX-bounds.left)/bounds.width),y:clamp((clientY-bounds.top)/bounds.height),
      adjusted:true,visible:true,confirmed:true});
  };
  const confirmHighConfidence = () => {
    setPoints(current => current.map(p => ({...p,confirmed:p.visible && p.confidence >= MIN_CONFIDENCE})));
    setMessage('High-confidence points confirmed. Review labels and adjust any incorrect locations before saving.');
    setSaveState('idle');
  };
  const save = async () => {
    if (!lines.length) { setMessage('Confirm both landmarks in at least one line before saving.'); return; }
    setSaving(true); setMessage(''); setSaveState('idle');
    const record = createSavedPhotoReview({ id:`photo-${view}`,view,side,mirrored,
      recordedAt:new Date().toISOString(),landmarks:points },imageAspect);
    try {
      if (await onSave(record)) {
        setSaveState('saved');
        setMessage('Saved landmarks and angles only. The photo was not uploaded or stored.');
      } else {
        setSaveState('error');setMessage('Not saved — review the Posture Overview error and try again.');
      }
    } catch (error) {
      setSaveState('error');setMessage(`Not saved — ${error instanceof Error ? error.message : 'retry'}`);
    } finally { setSaving(false); }
  };

  return <section className="min-w-0 border-t border-gray-200 pt-4" aria-label="Coach posture photo analysis">
    <div className="flex flex-wrap gap-3 justify-between items-center">
      <div className="min-w-0"><h3 className="font-bold text-[#111827]">Posture photo · coach only</h3>
        <p className="text-xs text-gray-600">On-device detection. Image is never saved or uploaded. DRAFT angle threshold · not a diagnosis.</p></div>
      <button type="button" className={`${button} bg-[#111827] text-white`} aria-expanded={open}
        aria-controls="posture-photo-panel" onClick={()=>setOpen(v=>!v)}>{open?'Close photo analysis':'Open photo analysis'}</button>
    </div>
    {open && <div id="posture-photo-panel" className="mt-4 space-y-4 min-w-0">
      <p className="text-xs text-amber-800">Review all landmarks manually. No client access. Keep the source photo on your device if you need it again.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold">Photo view <select className="ml-2 min-h-11 border rounded-xl px-3 text-base"
          aria-label="Posture photo view" value={view} onChange={e=>{setView(e.target.value as PhotoView);setPoints([]);setSaveState('idle');}}>
          <option value="front">Front</option><option value="side">Side</option><option value="rear">Rear</option></select></label>
        {view==='side' && <label className="text-sm font-semibold">Visible side <select className="ml-2 min-h-11 border rounded-xl px-3 text-base"
          aria-label="Side of body in photo" value={side} onChange={e=>setSide(e.target.value as 'L'|'R')}>
          <option value="L">Client left</option><option value="R">Client right</option></select></label>}
        <label className="min-h-11 inline-flex items-center gap-2 text-sm"><input type="checkbox" className="w-5 h-5" checked={mirrored}
          onChange={e=>setMirrored(e.target.checked)} aria-label="Photo is mirrored"/>Photo is mirrored (selfie)</label>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className={`${button} bg-gray-100 cursor-pointer inline-flex items-center`}>
          <span>Take / upload photo</span>
          <input className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Posture photo file"
            onChange={choosePhoto}/></label>
        <button type="button" className={button} onClick={()=>void run()} disabled={!photoUrl||analyzing||saving}>
          {analyzing?'Detecting…':'Detect joints'}</button>
        <button type="button" className={button} aria-label="Place points manually"
          onClick={placePointsManually} disabled={!photoUrl||analyzing||saving}>Place points manually</button>
        {points.length>0 && <button type="button" className={button} onClick={confirmHighConfidence}>Confirm high-confidence points</button>}
      </div>
      {photoUrl && <div className="mx-auto w-full max-w-[640px] min-w-0">
        <div className="relative w-full overflow-hidden rounded-xl bg-gray-100" aria-label="Editable posture photo overlay">
          <img ref={photoRef} src={photoUrl} alt="Private local posture assessment, not uploaded" className="block w-full h-auto"
            onLoad={e=>{const image=e.currentTarget;setImageAspect(image.naturalWidth/Math.max(1,image.naturalHeight));}} />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full"
            role="img" aria-label="Observed alignment lines">
            {view==='side' && lines.length>0 && (()=>{
              const ankle=points.find(p=>p.key===lines.at(-1)?.to);
              return ankle ? <line x1={ankle.x*1000} x2={ankle.x*1000} y1="0" y2="1000"
                stroke="#6B7280" strokeWidth="2" strokeDasharray="10 10"/>:null;
            })()}
            {lines.map(line=>{
              const a=points.find(p=>p.key===line.from)!,b=points.find(p=>p.key===line.to)!;
              return <line key={line.id} x1={a.x*1000} y1={a.y*1000} x2={b.x*1000} y2={b.y*1000}
                stroke={line.color==='green'?'#16A34A':'#DC2626'} strokeWidth="6" />;
            })}
          </svg>
          {points.filter(p=>p.visible).map(p=><button key={p.key} type="button"
            aria-label={`Adjust ${landmarkLabel(p.key,view,mirrored)}`} title={landmarkLabel(p.key,view,mirrored)}
            onClick={()=>setSelected(p.key)} onPointerDown={e=>{e.preventDefault();dragging.current=p.key;setSelected(p.key);e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e=>{if(dragging.current===p.key){e.preventDefault();setCoordinate(p.key,e.clientX,e.clientY);}}}
            onPointerUp={e=>{if(dragging.current===p.key){setCoordinate(p.key,e.clientX,e.clientY);dragging.current=null;}}}
            onPointerCancel={()=>{dragging.current=null;}}
            className={`absolute min-h-11 min-w-11 h-11 w-11 rounded-full border-2 flex items-center justify-center touch-none
              ${p.confirmed?'border-green-600 bg-green-500/30':p.confidence<MIN_CONFIDENCE?'border-amber-500 bg-amber-400/40':'border-white bg-gray-700/30'}
              ${p.key===selected?'ring-2 ring-[#FFC809] z-20':'z-10'}`}
            style={{left:`${p.x*100}%`,top:`${p.y*100}%`,transform:'translate(-50%, -50%)'}}>
            <span className="w-2 h-2 rounded-full bg-black" aria-hidden="true" /></button>)}
        </div>
        <p className="mt-1 text-xs text-gray-500">Drag a 44px landmark marker to adjust. Anatomical labels follow front/rear mapping. A mirrored image must be marked.</p>
      </div>}
      {points.length>0 && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
        <div className="border rounded-xl p-3 space-y-2 min-w-0">
          <h4 className="font-semibold text-sm">Landmark review · all {POSE_LANDMARKS.length} points</h4>
          <label className="block text-sm">Select landmark <select aria-label="Select posture landmark" className="w-full min-h-11 mt-1 border rounded-lg px-3 text-base"
            value={selected} onChange={e=>setSelected(e.target.value as LandmarkKey)}>
            {POSE_LANDMARKS.map(k=><option key={k} value={k}>{landmarkLabel(k,view,mirrored)}</option>)}</select></label>
          {(()=>{
            const p=points.find(q=>q.key===selected);
            if(!p)return null;
            return <div className="space-y-2 text-sm">
              <p>Detector confidence: {(100*p.confidence).toFixed(0)}% · {p.confidence<MIN_CONFIDENCE?'Low confidence — coach confirmation required':'Needs coach confirmation'}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${button} ${p.confirmed?'bg-green-100':''}`} aria-pressed={p.confirmed}
                  onClick={()=>patchPoint(p.key,{confirmed:!p.confirmed,visible:true})}>{p.confirmed?'Confirmed':'Confirm point'}</button>
                <button type="button" className={button} aria-pressed={!p.visible}
                  onClick={()=>patchPoint(p.key,{visible:!p.visible,confirmed:false})}>{p.visible?'Mark not visible':'Mark visible'}</button>
              </div>
              <p className="text-xs text-gray-500">Coordinates: {p.x.toFixed(3)}, {p.y.toFixed(3)} · {p.adjusted?'Coach adjusted':'Detector position'}</p>
            </div>;
          })()}
        </div>
        <div className="border rounded-xl p-3 space-y-2 min-w-0"><h4 className="font-semibold text-sm">Observed lines · DRAFT threshold ±{DRAFT_LEVEL_THRESHOLD_DEGREES}°</h4>
          {lines.length===0?<p className="text-sm text-gray-500">Needs observation — confirm both endpoints.</p>:
            lines.map(l=><div key={l.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm">
              <span className="min-w-0">{l.label}</span><strong className={l.color==='green'?'text-green-700':'text-red-700'}>
                {l.degrees.toFixed(1)}° · {l.color==='green'?'Level / aligned':'Tilted'}</strong></div>)}
          <p className="text-xs text-gray-500">Photo angles are observations, not 3D joint measurements or diagnoses.</p>
        </div>
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`${button} bg-[#111827] text-white`} disabled={saving||lines.length===0}
          onClick={()=>void save()}>{saving?'Saving…':'Save reviewed landmarks'}</button>
        <span className="text-sm" role="status">{saving?'Saving':saveState==='saved'?'Saved':saveState==='error'?'Not saved':''}</span>
      </div>
      {message && <p className="text-sm text-gray-600" role="alert">{message}</p>}
      {records.length>0 && <div className="border-t pt-3 space-y-1">
        <h4 className="font-semibold text-sm">Saved observations (no photos)</h4>
        {records.map(r=><p key={r.id} className="text-xs text-gray-600">
          {r.view} · {r.recordedAt} · {r.lines.length} reviewed angles · {r.ruleVersion}</p>)}
      </div>}
      <p className="text-xs text-gray-500">Rule version: {PHOTO_RULE_VERSION}. Threshold pending Hamoon and qualified reviewer approval.</p>
    </div>}
  </section>;
};
export default PosturePhotoReview;
