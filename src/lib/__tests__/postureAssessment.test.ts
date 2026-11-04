import { describe, expect, it } from 'vitest';
import { emptyPosture, mayShowClientPosture, observationIsConfirmed, postureMeasurements, frozenPosture, viewerSide } from '../postureAssessment';
import { draftInterpretation, PATTERN_RULE_VERSION } from '../patternRules/v1';

describe('static posture: explicit provenance and frozen history', () => {
 it('does not force a pattern from incomplete measurements',()=>{
   const p=emptyPosture('2026-11-04');
   expect(draftInterpretation().status).toBe('insufficient');
   expect(p.interpretation.ruleVersion).toBe(PATTERN_RULE_VERSION);
   expect(mayShowClientPosture(p)).toBe(false);
 });
 it('preserves measured zero distinct from missing',()=>{
   const ms=postureMeasurements([{id:'x',name:'Hip IR',left:0,right:null,measuredSides:{left:true}} as any],'2026-11-04');
   expect(ms.map(x=>x.value)).toEqual([0,null]);
   expect(ms.map(x=>x.wasMeasured)).toEqual([true,false]);
 });
 it('freezes a historical report independently from draft changes',()=>{
   const p=emptyPosture('2026-11-04');p.summary='Approved';p.summaryApprovedByCoach=true;
   const frozen=frozenPosture(p);
   p.summary='Changed later';
   expect(frozen.summary).toBe('Approved');
   expect(mayShowClientPosture(frozen)).toBe(true);
 });
 it('maps anatomical sides in front, rear and side views',()=>{
  expect(viewerSide('L','front')).toBe('viewer-right');
  expect(viewerSide('L','rear')).toBe('viewer-left');
  expect(viewerSide('R','front')).toBe('viewer-left');
  expect(viewerSide('R','rear')).toBe('viewer-right');
  expect(viewerSide('L','side')).toBe('anatomical-side');
 });
 it('does not imply visual features without observations',()=>{
   expect(observationIsConfirmed(emptyPosture('2026-11-04'),'right-weight-shift')).toBe(false);
 });
});
