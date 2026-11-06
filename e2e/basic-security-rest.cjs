// Direct HTTP calls through Playwright with JWT-like mock bearer tokens. Basic isolation, not a real DB pen test.
const { chromium } = require('playwright');
const createMock = require('./mock-supabase.cjs');
(async () => {
  const mock = createMock({ coachEmail: 'coach-a@example.com' });
  mock.db.trainerAllowlist.add('coach-b@example.com');
  for (const [id,email,role,client_id] of [
    ['A','coach-a@example.com','coach',null], ['B','coach-b@example.com','coach',null],
    ['CA','client-a@example.com','client','a'], ['CB','client-b@example.com','client','b'],
    ['X','stranger@example.com',null,null]
  ]) {
    mock.db.users.push({id,email,verified:true,password:'password123',meta:{}});
    if (role) mock.db.profiles.push({id,role,client_id,display_name:email});
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('https://mock.supabase.co/**', mock.handler);
  const api = (path, token, method='GET', payload) => page.evaluate(async ({path,token,method,payload})=>{
    const r=await fetch('https://mock.supabase.co'+path, {method,
      headers:{Authorization:'Bearer tok-'+token,'Content-Type':'application/json',Prefer:'return=representation'},
      body:payload===undefined?undefined:JSON.stringify(payload)});
    return {status:r.status,body:await r.json().catch(()=>null)};
  },{path,token,method,payload});
  const ok=(yes,msg)=>{if(!yes)throw Error('FAIL '+msg);console.log('PASS '+msg)};
  const row=(id,email)=>({id,email,data:{name:id,assessments:[]}});
  ok((await api('/rest/v1/clients','A','POST',row('a','client-a@example.com'))).status===201,'coach A creates own client');
  ok((await api('/rest/v1/clients','B','POST',row('b','client-b@example.com'))).status===201,'coach B creates own client');
  ok(mock.db.clients.find(c=>c.id==='a').coach_id==='A' && mock.db.clients.find(c=>c.id==='b').coach_id==='B','creation binds immutable coach ownership');
  ok((await api('/rest/v1/clients','A')).body.map(x=>x.id).join(',')==='a','coach A cannot read coach B clients');
  ok((await api('/rest/v1/clients','B')).body.map(x=>x.id).join(',')==='b','coach B cannot read coach A clients');
  ok((await api('/rest/v1/clients','CA')).body.map(x=>x.id).join(',')==='a','client sees only their own row');
  ok((await api('/rest/v1/clients','X')).body.length===0,'stranger cannot read clients');
  ok((await api('/rest/v1/clients','B','POST',row('hijack','client-a@example.com'))).status>=400,'client email cannot be reused across coaches');
  ok((await api('/rest/v1/clients','A','POST',{...row('spoof','bad@example.com'),coach_id:'B'})).status===403,'coach cannot create client for another coach');
  ok((await api('/rest/v1/clients?id=eq.b','A','PATCH',{data:{name:'hijack'}})).body.length===0,'coach A cannot edit coach B profile');
  ok((await api('/rest/v1/clients?id=eq.a','A','PATCH',{coach_id:'B'})).status===403,'coach cannot transfer client ownership');
  const workout=(id,cid)=>({id,client_id:cid,date:'2026-11-04',data:{id,date:'2026-11-04',title:'Basic',status:'planned',blocks:[{id:'block',exerciseId:'ex',name:'Squat',sets:1,reps:'8',loadKg:18,restSec:60,notes:'',loggedSets:[{setNumber:1,kg:null,reps:null,completed:false}]}]}});
  ok((await api('/rest/v1/workouts','A','POST',workout('wa','a'))).status===201,'coach A prescribes own workout');
  ok((await api('/rest/v1/workouts','B','POST',workout('wb','b'))).status===201,'coach B prescribes own workout');
  ok((await api('/rest/v1/workouts','A','POST',workout('steal','b'))).status===403,'coach A cannot prescribe B workout');
  ok((await api('/rest/v1/workouts','A')).body.length===1 && (await api('/rest/v1/workouts','B')).body.length===1,'prescriptions isolated by coach');
  ok((await api('/rest/v1/workouts?id=eq.wb','A','PATCH',{data:{title:'wrong'}})).body.length===0,'coach A cannot edit coach B workout');
  ok((await api('/rest/v1/workouts?id=eq.wb','A','DELETE')).status===204 && mock.db.workouts.length===2,'coach A cannot delete B workout');
  const msg=(id,cid,from_coach)=>({id,client_id:cid,from_coach,body:'Private test'});
  ok((await api('/rest/v1/coach_messages','A','POST',msg('ma','a',true))).status===201,'coach A sends own client message');
  ok((await api('/rest/v1/coach_messages','B','POST',msg('mb','b',true))).status===201,'coach B sends own client message');
  ok((await api('/rest/v1/coach_messages','A')).body.length===1,'coach A sees only own messages');
  ok((await api('/rest/v1/coach_messages','B')).body.length===1,'coach B sees only own messages');
  ok((await api('/rest/v1/coach_messages','CA')).body.length===1,'client A sees only own messages');
  ok((await api('/rest/v1/coach_messages','X')).body.length===0,'stranger sees no messages');
  ok((await api('/rest/v1/coach_messages','B','POST',msg('intrude','a',true))).status===403,'coach B cannot send message to A client');
  ok((await api('/rest/v1/coach_messages','CA','POST',msg('wrong-sender','a',true))).status===403,'client cannot spoof coach message');
  ok((await api('/rest/v1/coach_notes_secure','A','POST',{id:'note-a',client_id:'a',text:'A note',date:'',shared:false,pinned:false})).status===201,'coach A writes own note');
  ok((await api('/rest/v1/coach_notes_secure','B')).body.length===0,'coach B cannot read A private note');
  ok((await api('/functions/v1/send-invite','B','POST',{clientId:'a'})).status===403,'coach B cannot invite coach A client');
  ok((await api('/functions/v1/send-invite','A','POST',{clientId:'a'})).status===200,'owning coach can invite their client');
  mock.db.trainerAllowlist.delete('coach-a@example.com');
  ok((await api('/rest/v1/clients','A')).body.length===0,'revoked coach cannot read former clients');
  ok((await api('/functions/v1/send-invite','A','POST',{clientId:'a'})).status===403,'revoked coach cannot send client invitations');
  mock.db.trainerAllowlist.add('coach-a@example.com');
  mock.db.users.find(u=>u.id==='A').verified=false;
  ok((await api('/rest/v1/clients','A')).body.length===0,'unverified coach cannot read clients');
  ok((await api('/functions/v1/send-invite','A','POST',{clientId:'a'})).status===403,'unverified coach cannot send client invitations');
  mock.db.users.find(u=>u.id==='A').verified=true;
  ok((await api('/functions/v1/send-invite','X','POST',{clientId:'a'})).status===403,'stranger cannot invite clients');
  ok((await api('/rest/v1/rpc/pf_manage_trainer','B','POST',{p_action:'invite',p_email:'new@example.com'})).status===403,'coach B cannot add new coaches');
  ok((await api('/rest/v1/rpc/pf_manage_trainer','A','POST',{p_action:'invite',p_email:'new@example.com'})).status===200,'head coach allowlists new coach');
  ok((await api('/rest/v1/rpc/pf_manage_trainer','A','POST',{p_action:'assign',p_email:'coach-b@example.com',p_client_id:'a'})).status===403,'head cannot reassign client');
  ok((await api('/rest/v1/rpc/pf_manage_trainer','A','POST',{p_action:null,p_email:'null-action@example.com'})).status===403 && !mock.db.trainerAllowlist.has('null-action@example.com'),'null management action cannot allowlist a coach');
  const current = mock.db.workouts.find(w=>w.id==='wa');
  const result={p_workout_id:'wa',p_client_id:'a',p_expected_version:current.updated_at,p_results:{status:'completed',completedAt:'2026-11-04T00:00:00Z',sessionRpe:7,clientFeedback:'Good',blocks:[{id:'block',loggedSets:[{setNumber:1,kg:18,reps:8,completed:true}],rpe:7,pain:false,clientNote:''}]}};
  ok((await api('/rest/v1/rpc/save_workout_results_secure','CB','POST',result)).status===403,'client B cannot log A workout');
  ok((await api('/rest/v1/rpc/save_workout_results_secure','CA','POST',result)).status===200,'client A logs own set');
  ok((await api('/rest/v1/workouts','A')).body[0].data.status==='completed','only A coach sees own client completion');
  ok((await api('/rest/v1/workouts','B')).body[0].data.status==='planned','coach B untouched');
  await browser.close();
  console.log('ALL BASIC SECURITY REST TESTS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});
