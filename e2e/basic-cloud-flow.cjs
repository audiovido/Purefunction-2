// BASIC pilot: two independent coach browser contexts, their clients, and real client workout logging.
// Usage: node e2e/basic-cloud-flow.cjs /tmp/pf-basic-cloud (VITE_FULL_FEATURES unset/false build).
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const createMock = require('./mock-supabase.cjs');
const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, 'index.html'))) throw new Error('Supply a built basic cloud dist directory');
const port = 4199;
const server = http.createServer((q,r)=>{
  let file = path.join(root,decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
  const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)] || 'application/octet-stream';
  r.writeHead(200,{'content-type':type}); r.end(fs.readFileSync(file));
}).listen(port);
const ok=(condition,msg)=>{if(!condition)throw Error('FAIL '+msg);console.log('PASS '+msg);};
const waitFor=async (fn,timeout=9000)=>{
  const end=Date.now()+timeout;
  while(Date.now()<end){ if(await fn())return;await new Promise(r=>setTimeout(r,150)); }
  throw Error('Timed out waiting for mocked persistence');
};
(async()=>{
  const mock=createMock({coachEmail:'coach@example.com'});
  const browser=await chromium.launch();
  const pages=[];
  const open=async(width,height)=>{
    const context=await browser.newContext({viewport:{width,height}});
    await context.route('https://mock.supabase.co/**',mock.handler);
    await context.routeWebSocket(/wss:\/\/mock\.supabase\.co\/.*/,mock.wsHandler);
    const p=await context.newPage();
    const errors=[];p.on('pageerror',e=>errors.push(e.message));pages.push({p,errors});
    await p.goto(`http://localhost:${port}/`);return p;
  };
  const signUp=async(p,name,email,pw,who)=>{
    await p.getByRole('tab',{name:who==='coach'?'I’m the coach':'I’m a client'}).click();
    await p.getByRole('button',{name:who==='coach'?'Create coach account':'Set up your account'}).click();
    await p.getByLabel('Your name').fill(name);
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password').fill(pw);
    await p.locator('form button[type=submit]').click();
    await p.getByText('Check your email for the verification link').waitFor({timeout:7000});
    const mail=mock.db.emails.find(m=>m.to===email && m.kind==='verify');
    ok(!!mail,`verified signup email sent for ${email}`);
    await p.goto(`http://localhost:${port}/?verify=${encodeURIComponent(mail.token)}`);
    await p.getByRole('heading',{name:'Clients'}).waitFor({timeout:10000}).catch(()=>{});
  };
  const makeClient=async (p,name,email)=>{
    await p.getByRole('button',{name:'Add client'}).click();
    await p.getByPlaceholder('e.g., Jordan Taylor').fill(name);
    await p.getByPlaceholder('jordan.taylor@example.com').fill(email);
    await p.locator('form button[type=submit]').click();
    await p.getByText('Not joined yet — send them the invite below.').waitFor({timeout:9000});
    await p.getByRole('button',{name:'Cancel',exact:true}).click();
    await waitFor(()=>Promise.resolve(!!mock.db.clients.find(c=>c.email===email)));
    return mock.db.clients.find(c=>c.email===email);
  };
  const makeWorkout=async(p,name,id)=>{
    await p.locator('main').getByText(name,{exact:true}).first().click();
    await p.getByRole('heading',{name:'Workout Builder'}).waitFor();
    await p.getByRole('button',{name:'Create workout'}).click();
    await p.getByPlaceholder(/Search name or muscle/).fill('goblet squat');
    await p.getByRole('button',{name:'Add Goblet Squat'}).first().click();
    await p.locator('input[placeholder="8-10"]').first().fill('8');
    await p.locator('label:has-text("lb") input[type=number]').first().fill('40');
    await waitFor(()=>Promise.resolve(mock.db.workouts.some(w=>w.client_id===id&&w.data.blocks.length===1)));
  };
  const A=await open(1440,900);
  await signUp(A,'Head Coach','coach@example.com','coachpass1','coach');
  await A.getByRole('heading',{name:'Clients'}).waitFor();
  await A.getByRole('button',{name:'Coaches'}).click();
  await A.getByRole('heading',{name:'Coaches'}).waitFor();
  await A.getByRole('textbox',{name:'New coach email'}).fill('coach-b@example.com');
  await A.getByRole('button',{name:'Invite coach'}).click();
  await waitFor(()=>Promise.resolve(mock.db.trainerAllowlist.has('coach-b@example.com')));
  ok(true,'head coach added allowlisted trainer from Coaches screen');
  // A pre-migration database must not load clients, workouts or replay pending writes.
  const blocked = await open(375,812);
  const blockedRequests = [];
  await blocked.context().route('https://mock.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/clients' && url.searchParams.get('select') === 'coach_id') {
      return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'42703',message:'column clients.coach_id does not exist'})});
    }
    if (/^\/rest\/v1\/(clients|workouts|rpc\/save_)/.test(url.pathname)) blockedRequests.push(url.pathname);
    return mock.handler(route);
  });
  await blocked.getByRole('tab',{name:'I’m the coach'}).click();
  await blocked.getByLabel('Email').fill('coach@example.com');
  await blocked.getByLabel('Password').fill('coachpass1');
  await blocked.locator('form button[type=submit]').click();
  await blocked.getByRole('alert').getByText('Your workspace is temporarily unavailable.',{exact:false}).waitFor();
  ok(blockedRequests.length===0,'missing ownership schema blocks client/workout loading and pending-write replay');
  const B=await open(1024,768);
  await signUp(B,'Coach B','coach-b@example.com','coachbpass1','coach');
  await B.getByRole('heading',{name:'Clients'}).waitFor();
  ok((await B.getByRole('button',{name:'Coaches'}).count())===0,'non-head coach cannot see administration');
  await A.getByRole('button',{name:'Clients',exact:true}).first().click();
  const alpha=await makeClient(A,'Client Alpha','alpha@example.com');
  await B.getByRole('heading',{name:'Clients'}).waitFor();
  ok((await B.locator('main').getByText('Client Alpha',{exact:true}).count())===0,'coach B cannot see Alpha');
  const beta=await makeClient(B,'Client Beta','beta@example.com');
  ok(alpha.coach_id===mock.db.profiles.find(p=>p.display_name==='Head Coach')?.id,'Alpha belongs to head');
  ok(beta.coach_id===mock.db.profiles.find(p=>p.display_name==='Coach B')?.id,'Beta belongs to coach B');
  await makeWorkout(A,'Client Alpha',alpha.id);
  await makeWorkout(B,'Client Beta',beta.id);
  ok(mock.db.workouts.length===2,'coaches each created one workout');
  const uidB=mock.db.users.find(u=>u.email==='coach-b@example.com').id;
  const foreignInvite=await B.evaluate(async({id,uid})=>{
    const r=await fetch('https://mock.supabase.co/functions/v1/send-invite', {method:'POST',
      headers:{Authorization:'Bearer tok-'+uid,'Content-Type':'application/json'},body:JSON.stringify({clientId:id})});return r.status;
  },{id:alpha.id,uid:uidB});
  ok(foreignInvite===403,'Coach B forbidden from inviting Alpha directly');
  const C=await open(375,812);
  await C.goto(`http://localhost:${port}/?join=alpha%40example.com`);
  await C.getByRole('heading',{name:'Set up your account'}).waitFor();
  await C.getByLabel('Your name').fill('Alpha');
  await C.getByLabel('Password').fill('alphapass1');
  await C.locator('form button[type=submit]').click();
  await C.getByText('Check your email for the verification link').waitFor();
  const mail=mock.db.emails.find(m=>m.to==='alpha@example.com' && m.kind==='verify');
  ok(!!mail,'Alpha received a verification link');
  await C.goto(`http://localhost:${port}/?verify=${encodeURIComponent(mail.token)}`);
  await C.getByRole('heading',{name:'Goblet Squat'}).first().waitFor({timeout:10000});
  await C.getByRole('button',{name:'Complete set 1'}).first().click();
  await waitFor(()=>Promise.resolve(mock.db.workouts.find(w=>w.client_id===alpha.id)?.data.blocks[0].loggedSets[0].completed===true));
  ok(mock.db.workouts.find(w=>w.client_id===alpha.id)?.data.blocks[0].loggedSets[0].completed,'client logged a set via phone');
  await A.getByText(/Partially completed/).first().waitFor({timeout:9000});
  ok(true,'coach A calendar shows Alpha partial completion');
  ok(mock.db.workouts.find(w=>w.client_id===beta.id)?.data.blocks[0].loggedSets[0].completed===false,'coach B client unchanged');
  for(const [i,{p,errors}] of pages.entries()){
    ok(errors.length===0,`browser ${i+1} has no page errors: ${errors.join(' | ')}`);
    ok((await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth))===0,`browser ${i+1} has no horizontal scroll`);
  }
  await browser.close();server.close();console.log('ALL BASIC CLOUD FLOW TESTS PASSED');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
