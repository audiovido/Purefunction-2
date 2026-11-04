import {describe,it,expect} from 'vitest';
import {dayTotals,portionUpdate,freshItem} from '../foodDiary';
describe('food diary math',()=>{
 it('does not turn missing nutrients into zeros',()=>{
  const i={...freshItem('eggs'),kcal:null,protein:12};
  const t=dayTotals([{id:'1',client_id:'a',date:'2026-11-04',description:'eggs',idempotency_key:'x',status:'incomplete',items:[i]}]);
  expect(t.kcal).toBe(null);expect(t.protein).toBe(12);expect(t.hasUnknown).toBe(true);
 });
 it('portion changes recalculate using source density',()=>{
  const i={...freshItem('milk'),quantity:1,grams:100,kcalPerGram:.6,proteinPerGram:.03,kcal:60,protein:3};
  const x=portionUpdate(i,2);
  expect(x.grams).toBe(200);expect(x.kcal).toBe(120);expect(x.protein).toBe(6);
 });
});
