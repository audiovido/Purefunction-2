import {describe,it,expect} from 'vitest';
import {gaitPose,phaseAt} from '../../components/coach/GaitCompare';
import {emptyPosture} from '../postureAssessment';
describe('educational gait only',()=>{
 it('synchronizes five named phases on one timeline',()=>{
  expect([0,.2,.4,.6,.8].map(phaseAt)).toEqual([0,1,2,3,4]);
 });
 it('does not use ROM to animate a patient',()=>{
  const a=emptyPosture('2026-11-04');
  expect(gaitPose(.3,'front',a)).toEqual(gaitPose(.3,'front',null));
 });
 it('observation is explicit',()=>{
  const a=emptyPosture('2026-11-04');
  a.observations=[{id:'right-weight-shift',region:'gait',label:'Shift',confirmed:true,recordedAt:'2026-11-04'}];
  expect(gaitPose(.2,'front',a).pelvisTilt).toBe(2);
 });
});
