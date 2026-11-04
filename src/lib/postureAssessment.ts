import type { RomMovement } from '../types';
import { measuredRomSide } from './measurements';
import { PATTERN_RULE_VERSION } from './patternRules/v1';
export type PostureSource = 'measured' | 'observed' | 'illustrative';
export type PatternStatus = 'possible' | 'confirmed' | 'insufficient' | 'rejected';
export type PatternFramework = 'AIA' | 'PRI' | 'Other';
export type Region = 'shoulder' | 'ribcage' | 'pelvis' | 'hip' | 'foot' | 'gait';
export type ObservationId = 'left-shoulder-high' | 'right-shoulder-high' | 'left-weight-shift' | 'right-weight-shift' |
  'rib-flare' | 'rib-expansion-left' | 'rib-expansion-right' | 'pelvis-rotates-left' | 'pelvis-rotates-right' |
  'left-foot-pronation' | 'right-foot-pronation' | 'asymmetric-arm-swing';
export interface PostureObservation {
  id: ObservationId; region: Region; label: string; confirmed: boolean;
  recordedAt: string; mediaPath?: string; notes?: string;
}
export interface PostureMeasurement {
  id: string; name: string; side: 'L' | 'R'; value: number | null; wasMeasured: boolean;
  unit: string; testingPosition: string; protocol: string; recordedAt: string;
}
export interface PatternInterpretation {
  framework: PatternFramework; pattern: string; status: PatternStatus;
  support: string[]; conflict: string[]; missing: string[]; coachNote: string;
  ruleVersion: string; confirmedBy?: string;
}
export interface PostureAssessment {
  recordedAt: string;
  measurements: PostureMeasurement[];
  observations: PostureObservation[];
  interpretation: PatternInterpretation;
  summary: string; summaryApprovedByCoach: boolean;
  visualSettings: { view: 'front' | 'side' | 'rear'; scale: number; gaitPhase: number; slow: boolean };
}
export const OBSERVATION_OPTIONS: { id: ObservationId; label: string; region: Region }[] = [
  {id:'left-shoulder-high',label:'Left shoulder appears higher',region:'shoulder'},
  {id:'right-shoulder-high',label:'Right shoulder appears higher',region:'shoulder'},
  {id:'left-weight-shift',label:'Prefers loading left leg (observed)',region:'gait'},
  {id:'right-weight-shift',label:'Prefers loading right leg (observed)',region:'gait'},
  {id:'rib-flare',label:'Rib flare observed',region:'ribcage'},
  {id:'rib-expansion-left',label:'Reduced left ribcage expansion observed',region:'ribcage'},
  {id:'rib-expansion-right',label:'Reduced right ribcage expansion observed',region:'ribcage'},
  {id:'pelvis-rotates-left',label:'Pelvis turns left relative to trunk',region:'pelvis'},
  {id:'pelvis-rotates-right',label:'Pelvis turns right relative to trunk',region:'pelvis'},
  {id:'left-foot-pronation',label:'Left foot pronation observed in stance',region:'foot'},
  {id:'right-foot-pronation',label:'Right foot pronation observed in stance',region:'foot'},
  {id:'asymmetric-arm-swing',label:'Asymmetric arm swing observed walking',region:'gait'}
];
export const emptyPosture = (date: string): PostureAssessment => ({
  recordedAt: date, measurements: [], observations: [],
  interpretation: {framework:'Other',pattern:'',status:'insufficient',support:[],conflict:[],missing:['Coach-reviewed tests and observations','Approved interpretation rules'],coachNote:'',ruleVersion:PATTERN_RULE_VERSION},
  summary:'',summaryApprovedByCoach:false, visualSettings:{view:'front',scale:1,gaitPhase:0,slow:false}
});
/** ROM is a capacity measurement, not a standing pose or measured gait. */
export function postureMeasurements(rom: RomMovement[], date: string): PostureMeasurement[] {
  return rom.flatMap(r => (['left','right'] as const).map(side => {
    const value = measuredRomSide(r,side);
    return {id:`${r.id}:${side}`,name:r.name,side:side==='left'?'L' as const:'R' as const,value,wasMeasured:value!==null,
      unit:'°',testingPosition:'Check assessment protocol',protocol:'ROM assessment (position not captured in legacy record)',recordedAt:date};
  }));
}
export function frozenPosture(record: PostureAssessment): PostureAssessment {
  return structuredClone(record);
}
/** Front-facing anatomical sides are mirror-reversed to the viewer. */
export function viewerSide(anatomical: 'L'|'R', view: 'front'|'rear'|'side'): 'viewer-left'|'viewer-right'|'anatomical-side' {
  if (view==='side') return 'anatomical-side';
  return view==='front' ? (anatomical==='L'?'viewer-right':'viewer-left') : (anatomical==='L'?'viewer-left':'viewer-right');
}
export function mayShowClientPosture(a?: PostureAssessment | null): boolean {
  return !!a?.summaryApprovedByCoach;
}
export function observationIsConfirmed(a: PostureAssessment | null | undefined, id: ObservationId): boolean {
  return !!a?.observations.some(o => o.id===id && o.confirmed);
}
