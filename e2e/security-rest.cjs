// Playwright browser fetches exercise REST using real mocked JWTs, not UI controls.
const { chromium } = require('playwright');
const createMock = require('./mock-supabase.cjs');
(async () => {
 const mock = createMock({coachEmail:'coach@example.com'});
 const browser = await chromium.launch();
 const page = await browser.newPage();
 await page.route('https://mock.supabase.co/**',mock.handler);
 const fail = (msg) => { throw Error(msg); };
 const api = async (path, token, method='GET', body=null) => page.evaluate(async ({path,token,method,body}) => {
  const r=await fetch('https://mock.supabase.co'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation'},body:body==null?undefined:JSON.stringify(body)});
  return { status:r.status, body:await r.json().catch(()=>null) };
 },{path,token,method,body});
 // Set up identities in the mock server directly; only REST calls use client JWT.
 for (const [id,email,role,cid] of [['c','coach@example.com','coach',null],['d','danial@example.com','coach',null],['a','a@example.com','client','a'],['b','b@example.com','client','b'],['e','e@example.com','stranger',null]]) {
  mock.db.users.push({id,email,password:'testing',meta:{}});
  if(role!=='stranger') mock.db.profiles.push({id,role,client_id:cid,display_name:email});
 }
 mock.db.clients.push({id:'a',email:'a@example.com',data:{name:'A',assessments:[{id:'original'}]},updated_at:'2026-01-01T00:00:00Z'});
 mock.db.clients.push({id:'b',email:'b@example.com',data:{name:'B'},updated_at:'2026-01-01T00:00:00Z'});
 mock.db.assignments.push({coach_id:'c',client_id:'a'},{coach_id:'c',client_id:'b'},{coach_id:'d',client_id:'a'});
 const makeW=(id)=>({id:'w-'+id,client_id:id,date:'2026-11-04',updated_at:'2026-01-01T00:00:00Z',data:{id:'w-'+id,date:'2026-11-04',title:'Prescribed',status:'planned',blocks:[{id:'block-'+id,exerciseId:'ex',name:'Squat',sets:1,reps:'8',loadKg:20,restSec:90,notes:'keep',loggedSets:[{setNumber:1,kg:null,reps:null,completed:false}]}]}});
 mock.db.workouts.push(makeW('a'),makeW('b'));
 mock.db.coach_notes_secure.push({id:'private',client_id:'a',date:'2026-11-04',text:'PRIVATE',shared:false,pinned:false},{id:'shared',client_id:'a',date:'2026-11-04',text:'Visible',shared:true,pinned:false});
 const assert=(c,m)=>{if(!c)fail(m);console.log('PASS '+m)};
 assert((await api('/rest/v1/clients','tok-e')).body.length===0,'stranger cannot read clients');
 assert((await api('/rest/v1/clients','tok-a')).body.length===1,'client A sees only A');
 assert((await api('/rest/v1/clients','tok-b')).body.length===1,'client B sees only B');
 assert((await api('/rest/v1/coach_notes_secure','tok-a')).body.every(n=>n.shared),'private note never reaches A');
 assert((await api('/rest/v1/coach_notes_secure','tok-a','POST',{id:'malicious',client_id:'a',date:'',text:'hack',shared:true,pinned:false})).status===403,'client cannot forge coach notes');
 assert((await api('/rest/v1/coach_notes_secure','tok-b')).body.length===0,'B cannot see A notes');
 assert((await api('/rest/v1/coach_notes_secure','tok-c')).body.length===2,'assigned coach sees both notes');
 const denied=await api('/rest/v1/workouts?id=eq.w-a','tok-a','PATCH',{data:{title:'HACKED'}});
 assert(denied.status===200 && denied.body.length===0,'direct client workout PATCH blocked');
 const cdata=await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:{name:'HACKED',assessments:[]}});
 assert(cdata.status>=400,'direct client assessment change blocked');
 // Client A may create/edit/delete only their own manual records; coach records cannot change.
 mock.db.clients[0].data.manualRecords=[{id:'coach-pr',name:'Bench',kg:50,reps:1,addedBy:'coach'}];
 const clientRecord={id:'client-pr',name:'Squat',kg:40,reps:5,addedBy:'client'};
 const baseData={...mock.db.clients[0].data};
 const add={...baseData,manualRecords:[...baseData.manualRecords,clientRecord]};
 assert((await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:add})).status===200,'client adds own manual record');
 const edited={...add,manualRecords:[baseData.manualRecords[0],{...clientRecord,kg:45}]};
 assert((await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:edited})).status===200,'client edits own manual record');
 const forged={...edited,manualRecords:[{...baseData.manualRecords[0],kg:999},edited.manualRecords[1]]};
 assert((await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:forged})).status===403,'client cannot edit coach manual record');
 const removedCoach={...edited,manualRecords:[edited.manualRecords[1]]};
 assert((await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:removedCoach})).status===403,'client cannot delete coach manual record');
 const forgedOwner={...edited,manualRecords:[{...baseData.manualRecords[0],addedBy:'client'},edited.manualRecords[1]]};
 assert((await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:forgedOwner})).status===403,'client cannot relabel coach record');
 const removedOwn={...edited,manualRecords:[baseData.manualRecords[0]]};
 assert((await api('/rest/v1/clients?id=eq.a','tok-a','PATCH',{data:removedOwn})).status===200,'client deletes own record');
 assert((await api('/rest/v1/clients?id=eq.b','tok-a','PATCH',{data:removedOwn})).body.length===0,'client A cannot alter client B records');
 const payload={p_workout_id:'w-a',p_client_id:'a',p_expected_version:'2026-01-01T00:00:00Z',p_results:{status:'completed',completedAt:'2026-11-04T00:00:00Z',sessionRpe:7,clientFeedback:'good',blocks:[{id:'block-a',loggedSets:[{setNumber:1,kg:20,reps:8,completed:true}],rpe:7,pain:false,clientNote:''}]}};
 assert((await api('/rest/v1/rpc/save_workout_results_secure','tok-b','POST',payload)).status===403,'B cannot write A results');
 const bad=structuredClone(payload);bad.p_results.blocks[0].sets=999;
 assert((await api('/rest/v1/rpc/save_workout_results_secure','tok-a','POST',bad)).status===403,'RPC rejects prescription injection');
 assert((await api('/rest/v1/rpc/save_workout_results_secure','tok-a','POST',payload)).status===200,'A saves own results');
 assert(mock.db.workouts[0].data.blocks[0].sets===1,'prescribed sets unchanged');
 assert((await api('/rest/v1/rpc/save_workout_results_secure','tok-a','POST',payload)).status===409,'stale version rejected');
 assert((await api('/rest/v1/workouts','tok-c')).body.length===2,'coach sees assigned workouts');
 assert((await api('/rest/v1/workouts','tok-d')).body.length===1,'Danial is limited to assigned client A');
 assert((await api('/rest/v1/coach_notes_secure','tok-d')).body.length===2,'Danial can see assigned client notes');
 await browser.close();console.log('ALL SECURITY REST TESTS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});
