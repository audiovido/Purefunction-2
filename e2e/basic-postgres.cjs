// Isolated PostgreSQL/WASM integration test. No network or live database access.
// Install @electric-sql/pglite@0.3.14 in a separate test prefix and set NODE_PATH.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const ids = Object.fromEntries(['head','coach','clientA','clientB','stranger','unverified','revoked'].map((name,i) => [name, `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
let checks = 0;
const db = new PGlite();
const exec = sql => db.exec(sql);
const rows = async (sql, params=[]) => (await db.query(sql, params)).rows;
const ok = (value, message) => { assert.ok(value, message); checks++; console.log(`PASS ${message}`); };
async function as(name) {
  await exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
  await exec(`SET ROLE ${name === 'anon' ? 'anon' : 'authenticated'}`);
}
async function admin() { await exec('RESET ROLE'); await exec("SELECT set_config('request.jwt.claim.sub','',false)"); }
async function denied(sql, code='42501') {
  try { await exec(sql); } catch(e) { assert.equal(e.code,code); checks++; return; }
  throw new Error(`Expected denial: ${sql}`);
}
async function main() {
  console.log((await rows('select version()'))[0].version);
  await exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array($1,'/')$$;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;`);
  const migrationFiles = fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&!f.includes('daily_reminders')).sort();
  for(const file of migrationFiles) {
    const sql = read(`supabase/migrations/${file}`).replace(/^alter publication .*;\s*$/gmi, '');
    await exec(sql);
  }
  await exec("UPDATE private.settings SET value='head@pilot.example' WHERE key='coach_email'");
  for(const name of ['head','coach','unverified','revoked','stranger']) {
    await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,$3)',[ids[name],`${name}@pilot.example`,name==='unverified'?null:'2026-11-01T00:00:00Z']);
  }
  for(const name of ['coach','unverified','revoked']) await db.query("INSERT INTO public.profiles(id,role) VALUES($1,'coach')",[ids[name]]);
  await exec("INSERT INTO public.clients(id,email,data) VALUES('a','clienta@pilot.example','{\"name\":\"Synthetic A\"}'),('b','clientb@pilot.example','{\"name\":\"Synthetic B\"}')");
  for(const name of ['clientA','clientB']) await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[ids[name],`${name.toLowerCase()}@pilot.example`]);
  for(const file of ['T8b_security','signup_resend','p5_trainers','p6_food_diary','p7_posture']) await exec(read(`supabase/pending/NEEDS_ARMIN_OK_${file}.sql`));
  await db.query("UPDATE public.coach_client_assignments SET coach_id=$1 WHERE client_id='b'",[ids.coach]);
  await exec("INSERT INTO private.coach_allowlist(email) VALUES('coach@pilot.example'),('unverified@pilot.example')");
  const migration=read('supabase/pending/NEEDS_ARMIN_OK_basic_independent_coaches.sql');
  // Each ambiguous starting state must fail atomically, leaving no owner column.
  for(const setup of [
    "INSERT INTO public.clients(id,email,data) VALUES('orphan','','{}'); DELETE FROM public.coach_client_assignments WHERE client_id='orphan'",
    `INSERT INTO public.coach_client_assignments(coach_id,client_id) VALUES('${ids.coach}','a')`,
    "INSERT INTO public.clients(id,email,data) VALUES('duplicate','clienta@pilot.example','{}')",
    "DELETE FROM private.coach_allowlist WHERE email='coach@pilot.example'"
  ]) {
    await exec('BEGIN');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ids.head]);
    await exec(setup);
    try { await exec(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')); throw Error('Preflight unexpectedly passed'); }
    catch(e) { if(e.code!=='P0001') throw e; }
    await exec('ROLLBACK');
    ok((await rows("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='coach_id'"))[0].n===0,'failed preflight is atomic');
  }
  await exec(migration);
  ok((await rows("SELECT coach_id FROM clients WHERE id='b'"))[0].coach_id===ids.coach,'existing ownership preserved');
  await as('head');
  ok((await rows('SELECT id FROM clients')).map(r=>r.id).join() === 'a','head sees only own client');
  const inserted=await rows("INSERT INTO clients(id,email,data) VALUES('new-a','','{}') RETURNING coach_id,updated_at");
  ok(inserted[0].coach_id===ids.head&&!!inserted[0].updated_at,'INSERT RETURNING sets owner and returns timestamp');
  ok((await rows("SELECT count(*)::int n FROM coach_client_assignments WHERE client_id='new-a'"))[0].n===1,'assignment created atomically');
  await denied(`INSERT INTO clients(id,email,data,coach_id) VALUES('forged','','{}','${ids.coach}')`);
  await denied(`UPDATE clients SET coach_id='${ids.coach}' WHERE id='a'`);
  await denied("SELECT pf_manage_trainer(NULL,'new@pilot.example',NULL)");
  await denied("SELECT pf_manage_trainer('assign','coach@pilot.example','a')");
  ok((await rows("SELECT pf_manage_trainer('invite','new@pilot.example',NULL) granted"))[0].granted,'head can invite valid email');
  await exec("UPDATE clients SET data=data||'{\"name\":\"Updated A\"}' WHERE id='a'");
  ok((await rows("UPDATE clients SET data='{}' WHERE id='b' RETURNING id")).length===0,'head cannot update another coach client');
  await exec(`INSERT INTO workouts(id,client_id,date,data) VALUES('wa','a','2026-11-05','{"title":"Prescription","blocks":[{"id":"block-a","sets":1,"reps":10,"loggedSets":[{"setNumber":1,"kg":null,"reps":null,"completed":false}]}],"status":"planned"}');
    INSERT INTO coach_notes_secure(id,client_id,date,text,shared) VALUES('na','a','2026-11-05','Private A',false);
    INSERT INTO coach_messages(client_id,from_coach,body) VALUES('a',true,'Coach A');
    INSERT INTO storage.objects(bucket_id,name) VALUES('client-videos','a/test.mp4'),('message-media','a/test.jpg');`);
  await as('coach');
  ok((await rows('SELECT id FROM clients')).map(r=>r.id).join()==='b','coach B sees only B');
  for(const table of ['workouts','coach_notes_secure','coach_messages','storage.objects']) ok((await rows(`SELECT * FROM ${table}`)).length===0,`coach B cannot read A ${table}`);
  await denied("INSERT INTO workouts(id,client_id,date,data) VALUES('forged','a','2026-11-06','{}')");
  await denied("INSERT INTO coach_messages(client_id,from_coach,body) VALUES('a',true,'forged')");
  await denied("INSERT INTO storage.objects(bucket_id,name) VALUES('client-videos','a/forged.mp4')");
  await denied("SELECT pf_manage_trainer('invite','new2@pilot.example',NULL)");
  await exec(`INSERT INTO workouts(id,client_id,date,data) VALUES('wb','b','2026-11-05','{"blocks":[],"status":"planned"}')`);
  await as('clientA');
  ok((await rows('SELECT id FROM clients')).map(r=>r.id).join()==='a','client A sees only own profile');
  ok((await rows('SELECT * FROM coach_notes_secure')).length===0,'private notes hidden from client');
  ok((await rows('SELECT id FROM workouts')).map(r=>r.id).join()==='wa','client sees only own workout');
  ok((await rows("UPDATE workouts SET data='{}' WHERE id='wa' RETURNING id")).length===0,'client cannot rewrite prescription');
  await denied("UPDATE clients SET data=data||'{\"name\":\"Forged\"}' WHERE id='a'");
  await denied(`UPDATE clients SET coach_id='${ids.coach}' WHERE id='a'`);
  await exec("UPDATE clients SET data=data||'{\"photoUrl\":\"test.jpg\"}' WHERE id='a'");
  const version=(await rows("SELECT updated_at FROM workouts WHERE id='wa'"))[0].updated_at;
  await db.query('SELECT * FROM save_workout_results_secure($1,$2,$3,$4)', ['wa','a',version,JSON.stringify({status:'completed',blocks:[{id:'block-a',loggedSets:[{setNumber:1,kg:10,reps:10,completed:true}]}]})]);
  ok((await rows("SELECT data FROM workouts WHERE id='wa'"))[0].data.title==='Prescription','client results preserve prescription');
  await exec("INSERT INTO coach_messages(client_id,from_coach,body) VALUES('a',false,'Client A')");
  await as('clientB');
  ok((await rows('SELECT id FROM workouts')).map(r=>r.id).join()==='wb','client B sees only own workout');
  await denied("SELECT * FROM save_workout_results_secure('wa','a',now(),'{\"blocks\":[],\"status\":\"completed\"}')");
  await as('head');
  ok((await rows("SELECT data->>'status' status FROM workouts WHERE id='wa'"))[0].status==='completed','owning coach sees completion');
  for(const name of ['stranger','unverified','revoked']) {
    await as(name); ok((await rows('SELECT * FROM clients')).length===0,`${name} cannot read clients`);
    await denied(`INSERT INTO clients(id,email,data) VALUES('${name}-client','','{}')`);
  }
  await as('anon'); ok((await rows('SELECT * FROM clients')).length===0,'anonymous cannot read clients');
  await admin();
  await exec(read('supabase/pending/ROLLBACK_basic_independent_coaches.sql'));
  ok((await rows("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='coach_id'"))[0].n===0,'rollback removes owner column');
  ok((await rows('SELECT count(*)::int n FROM clients'))[0].n===3,'rollback preserves clients');
  ok((await rows('SELECT count(*)::int n FROM coach_client_assignments'))[0].n===3,'rollback preserves assignments');
  await exec(migration);
  await as('head'); ok((await rows("SELECT data->>'status' status FROM workouts WHERE id='wa'"))[0].status==='completed','reapply preserves client results');
  await admin();
  console.log(`ALL PASSED: ${checks} PostgreSQL checks. Synthetic data only; no live JWT/email integration.`);
  await db.close();
}
main().catch(async e=>{ console.error(e.message, e.code || '', e.detail || ''); await db.close(); process.exitCode=1; });
