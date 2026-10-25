// Cloud end-to-end: coach and client on separate devices against the in-memory Supabase.
// Usage: node e2e/cloud-flow.cjs <dist dir built with VITE_SUPABASE_URL=https://mock.supabase.co> [shots dir]
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const createMock = require('./mock-supabase.cjs');

const root = process.argv[2];
const shots = process.argv[3];
const PORT = 4193;
const srv = http
  .createServer((q, r) => {
    let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
    r.writeHead(200, { 'content-type': type });
    r.end(fs.readFileSync(f));
  })
  .listen(PORT);

let failures = 0;
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) failures++;
};
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = iso(new Date());

(async () => {
  const mock = createMock({ coachEmail: 'coach@example.com' });
  const b = await chromium.launch();
  const open = async (viewport) => {
    const ctx = await b.newContext({ viewport });
    await ctx.route('https://mock.supabase.co/**', mock.handler);
    await ctx.routeWebSocket(/wss:\/\/mock\.supabase\.co\/.*/, mock.wsHandler);
    const p = await ctx.newPage();
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    return p;
  };
  const signUp = async (p, name, email, pw) => {
    await p.getByRole('button', { name: 'Create an account' }).click();
    if (name) await p.getByLabel('Your name').fill(name);
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password').fill(pw);
    await p.getByRole('button', { name: 'Create account' }).click();
  };
  const shot = (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png` });

  /* ---------------- stranger can't sign up ---------------- */
  const S = await open({ width: 390, height: 844 });
  await S.getByRole('heading', { name: 'Welcome back' }).waitFor();
  ok(true, 'signed-out visitor sees the sign-in screen');
  await signUp(S, 'Eve', 'eve@example.com', 'password123');
  await S.getByText(/isn’t on the list yet/).waitFor({ timeout: 8000 }).catch(() => {});
  ok(await S.getByText(/isn’t on the list yet/).isVisible(), 'unknown email cannot create an account');
  await shot(S, 'cloud-signup-blocked');

  /* ---------------- coach ---------------- */
  const C = await open({ width: 1440, height: 900 });
  await signUp(C, 'Armin', 'Coach@Example.com', 'coachpass1');
  await C.getByRole('heading', { name: 'Clients' }).waitFor();
  ok(await C.getByText(/No clients yet/).isVisible(), 'new coach starts with an empty roster (no sample data)');
  ok(mock.db.profiles.some((p) => p.role === 'coach'), 'coach profile created for the coach email');
  await shot(C, 'cloud-coach-empty');

  // add a client
  await C.getByRole('button', { name: 'Add client' }).click();
  await C.getByPlaceholder('e.g., Jordan Taylor').fill('Ryan Lee');
  await C.getByPlaceholder('jordan.taylor@example.com').fill('Ryan@Example.com');
  await C.getByRole('button', { name: 'Create & Start Assessment' }).click();
  await C.waitForTimeout(1500);
  const ryanRow = mock.db.clients.find((c) => c.email === 'ryan@example.com');
  ok(!!ryanRow, 'client saved to the cloud with lower-cased email');
  ok(ryanRow && ryanRow.data && ryanRow.data.inBody.weight === 0, 'new client has empty assessment data (no sample numbers)');

  // build a workout for today
  await C.getByRole('button', { name: 'Workouts' }).first().click();
  await C.getByRole('button', { name: 'Create workout' }).click();
  await C.getByPlaceholder('Search name, muscle, pattern…').fill('goblet squat');
  await C.waitForTimeout(300);
  await C.getByRole('button', { name: 'Add Goblet Squat' }).first().click();
  const kg = C.locator('input[type=number]').nth(2); // Sets, Reps(text), kg
  await C.locator('input[placeholder="8-10"]').first().fill('8-10');
  await C.locator('label:has-text("kg") input').first().fill('40');
  await C.waitForTimeout(1500);
  const w = mock.db.workouts.find((x) => x.client_id === ryanRow.id && x.date === today);
  ok(!!w && w.data.blocks.length === 1 && w.data.blocks[0].loadKg === 40, 'workout saved to the cloud (one row per workout)');
  ok(await C.getByText('Saved', { exact: true }).first().isVisible(), 'sync badge shows Saved');
  await shot(C, 'cloud-coach-builder');

  /* ---------------- client ---------------- */
  const R = await open({ width: 390, height: 844 });
  await signUp(R, 'Ryan', 'ryan@example.com', 'ryanpass1');
  await R.getByRole('heading', { name: /Goblet Squat/ }).first().waitFor({ timeout: 10000 });
  ok(true, 'client signs up with the email the coach added and sees today’s workout');
  ok((await R.getByRole('button', { name: 'Coach' }).count()) === 0, 'client has no coach switch');
  ok((await R.getByText(/Workouts this week/).count()) === 0, 'client cannot see the coach screens');
  await shot(R, 'cloud-client-today');

  // live: coach adds an exercise -> appears on client without reload
  await C.getByPlaceholder('Search name, muscle, pattern…').fill('romanian deadlift');
  await C.waitForTimeout(300);
  await C.getByRole('button', { name: /^Add Romanian Deadlift$/ }).first().click();
  await R.getByRole('heading', { name: 'Romanian Deadlift' }).waitFor({ timeout: 8000 }).catch(() => {});
  ok(await R.getByRole('heading', { name: 'Romanian Deadlift' }).isVisible(), 'coach change appears live on the client’s phone');

  // client logs and finishes
  const postsBefore = mock.log.filter((l) => l.startsWith('POST /rest/v1/workouts')).length;
  await R.locator('[aria-label="Complete set 1"]').first().click();
  await R.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await R.getByRole('button', { name: '8', exact: true }).first().click();
  await R.getByRole('button', { name: 'Finish workout' }).click();
  await R.getByRole('button', { name: '7', exact: true }).last().click();
  await R.getByPlaceholder(/How did it feel/).fill('Felt strong');
  await R.getByRole('button', { name: /^Finish workout \(/ }).click();
  await R.waitForTimeout(1500);
  const wAfter = mock.db.workouts.find((x) => x.client_id === ryanRow.id && x.date === today);
  ok(wAfter.data.status === 'completed' && wAfter.data.sessionRpe === 7, 'client results saved to the cloud');
  ok(mock.log.filter((l) => l.startsWith('POST /rest/v1/workouts')).length - postsBefore <= 6, 'client sends only small, changed-row writes');

  // coach sees it live
  await C.getByText('Felt strong').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await C.getByText('Felt strong').isVisible(), 'coach sees the client’s feedback live');
  ok(await C.getByText(/Session RPE 7\/10/).isVisible(), 'coach sees session RPE');

  // no echo loop: wait and make sure the coach did not re-upload what it received
  const coachPosts = mock.log.filter((l) => l.startsWith('POST /rest/v1/workouts')).length;
  await C.waitForTimeout(2500);
  ok(mock.log.filter((l) => l.startsWith('POST /rest/v1/workouts')).length === coachPosts, 'no echo uploads after live updates');

  // client photo syncs to the coach
  await R.locator('input[type=file][accept^="image"]').setInputFiles(path.join(__dirname, 'fixtures', 'face.png'));
  await R.waitForTimeout(1500);
  ok(!!mock.db.clients.find((c) => c.id === ryanRow.id).data.photoUrl, 'client photo saved to the cloud');
  await C.getByRole('button', { name: 'Clients' }).first().click();
  await C.waitForTimeout(800);
  ok((await C.locator('main img').count()) >= 1, 'coach sees the client’s photo');

  // reload: data comes back from the cloud, session kept
  await R.reload();
  await R.getByText('Workout completed').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await R.getByText('Workout completed').isVisible(), 'after reload the client is still signed in and sees saved results');

  /* ---------------- coach uploads a video, client can play it ---------------- */
  await C.getByRole('button', { name: 'Library' }).first().click();
  await C.getByRole('button', { name: 'New exercise' }).click();
  await C.locator('input[type=file][accept^="video"]').setInputFiles(path.join(__dirname, 'fixtures', 'demo.webm'));
  await C.getByText(/checked, plays fine/).waitFor({ timeout: 15000 });
  await C.getByPlaceholder('e.g. Left AIC Split Squat').fill('Ryan Wall Drill');
  await C.getByRole('button', { name: 'Save' }).click();
  await C.waitForTimeout(2000);
  const files = Object.keys(mock.db.files);
  ok(files.length === 1, 'video uploaded to cloud storage (' + files.join(',') + ')');
  const exRow = mock.db.exercises.find((e) => e.data.name === 'Ryan Wall Drill');
  ok(exRow && exRow.data.video.kind === 'storage', 'exercise with cloud video saved to the database');
  // Playwright can't read the bytes of an uploaded File body, so check the chain instead:
  // upload -> signed link requested -> the player loads that private link.
  const src = await C.locator('video[controls]').getAttribute('src');
  ok(/\/storage\/v1\/object\/sign\/exercise-videos\/.+\?token=/.test(src || ''), 'player uses a short-lived signed link to the private video');
  ok(mock.log.some((l) => l.startsWith('GET /storage/v1/object/sign/exercise-videos/')), 'browser fetched the video through that link');

  /* ---------------- client cannot write exercises / others' data ---------------- */
  const tokenR = mock.db.profiles.find((p) => p.role === 'client').id;
  const res = await R.evaluate(async (tok) => {
    const h = { apikey: 'x', Authorization: 'Bearer tok-' + tok, 'Content-Type': 'application/json' };
    const a = await fetch('https://mock.supabase.co/rest/v1/exercises', { method: 'POST', headers: h, body: JSON.stringify({ id: 'x', data: {} }) });
    return a.status;
  }, tokenR);
  ok(res === 403, 'client cannot add exercises (403)');

  /* ---------------- sign out ---------------- */
  await R.getByRole('button', { name: 'Sign out' }).first().click();
  await R.getByRole('heading', { name: 'Welcome back' }).waitFor({ timeout: 5000 }).catch(() => {});
  ok(await R.getByRole('heading', { name: 'Welcome back' }).isVisible(), 'client can sign out');

  // wrong password
  await R.getByLabel('Email').fill('ryan@example.com');
  await R.getByLabel('Password').fill('wrongpass');
  await R.getByRole('button', { name: 'Sign in' }).click();
  await R.getByText('Email or password is not correct.').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await R.getByText('Email or password is not correct.').isVisible(), 'wrong password shows a clear message');
  await R.getByLabel('Password').fill('ryanpass1');
  await R.getByRole('button', { name: 'Sign in' }).click();
  await R.getByText('Workout completed').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await R.getByText('Workout completed').isVisible(), 'client can sign back in');

  // layout
  for (const [n, p] of [['client', R], ['stranger', S]]) {
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0, `${n}: no horizontal overflow on phone`);
  }
  const all = [...S.errors, ...C.errors, ...R.errors];
  ok(all.length === 0, 'no page errors ' + all.join(' | '));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
  srv.close();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
