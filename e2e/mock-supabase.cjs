// In-memory Supabase for Playwright: auth, the sign-up Edge Function, PostgREST
// (profiles / clients / workouts / exercises), Storage (exercise-videos) and the
// Realtime websocket. It mirrors the database rules in supabase/migrations:
//  - coach = the configured coach email; client = an email the coach added
//  - coach reads/writes everything; a client only their own client row and workouts
//  - clients can't delete workouts or write exercises; strangers see nothing
const crypto = require('crypto');

module.exports = function createMock({ coachEmail = 'coach@example.com' } = {}) {
  const db = { users: [], profiles: [], clients: [], workouts: [], coach_notes_secure: [], assignments: [], exercises: [], files: {}, clientFiles: {}, emails: [], resetTokens: {}, verificationRequests: {} };
  const log = [];
  const realtimeLog = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*'
  };
  const json = (route, status, body) =>
    route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const sessionFor = (u) => ({
    access_token: 'tok-' + u.id,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'ref-' + u.id,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.meta || {}, app_metadata: {}, created_at: new Date().toISOString() }
  });
  const uidFrom = (req) => {
    const m = (req.headers()['authorization'] || '').match(/tok-(.+)$/);
    return m && m[1];
  };
  const profileOf = (uid) => db.profiles.find((p) => p.id === uid);

  function linkUser(u) {
    if (profileOf(u.id)) return;
    if (u.email.toLowerCase() === coachEmail.toLowerCase()) {
      db.profiles.push({ id: u.id, role: 'coach', display_name: (u.meta && u.meta.display_name) || u.email.split('@')[0], client_id: null });
      return;
    }
    const c = db.clients.find((c) => c.email && c.email.toLowerCase() === u.email.toLowerCase());
    if (c) db.profiles.push({ id: u.id, role: 'client', display_name: c.data.name, client_id: c.id });
  }

  const canRead = (prof, table, row) => {
    if (!prof) return false;
    if (prof.role === 'coach') {
      if (table === 'clients' || table === 'coach_notes_secure') return db.assignments.some((a) => a.coach_id === prof.id && a.client_id === (row.client_id || row.id));
      if (table === 'workouts') return db.assignments.some((a) => a.coach_id === prof.id && a.client_id === row.client_id);
      if (table === 'profiles') return row.id === prof.id || db.assignments.some((a) => a.coach_id === prof.id && a.client_id === row.client_id);
      return true;
    }
    if (table === 'profiles') return row.id === prof.id;
    if (table === 'clients') return row.id === prof.client_id;
    if (table === 'workouts') return row.client_id === prof.client_id;
    if (table === 'coach_notes_secure') return row.client_id === prof.client_id && row.shared === true;
    if (table === 'exercises') return true;
    return false;
  };
  const canWrite = (prof, table, row) => {
    if (!prof) return false;
    if (prof.role === 'coach') return table !== 'profiles' && (table === 'exercises' || (table === 'clients' && !db.clients.some((c) => c.id === row.id)) || db.assignments.some((a) => a.coach_id === prof.id && a.client_id === (row.client_id || row.id)));
    if (table === 'clients') return row.id === prof.client_id;
    if (table === 'workouts') return false;
    if (table === 'coach_notes_secure') return false;
    return false;
  };

  // Mirrors private.guard_client_data: coach records are immutable in a client PATCH.
  function clientManualRecordsAllowed(before, after) {
    const from = Array.isArray(before) ? before : [];
    if (after !== undefined && !Array.isArray(after)) return false;
    const to = Array.isArray(after) ? after : [];
    if (to.length > 500) return false;
    const oldCoach = from.filter((r) => r && r.addedBy !== 'client').sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const newCoach = to.filter((r) => r && r.addedBy !== 'client').sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (JSON.stringify(oldCoach) !== JSON.stringify(newCoach)) return false;
    const ids = new Set();
    for (const rec of to) {
      if (!rec || typeof rec !== 'object' || Array.isArray(rec) ||
          typeof rec.id !== 'string' || !rec.id || rec.id.length > 120 || ids.has(rec.id)) return false;
      ids.add(rec.id);
      if (rec.addedBy !== 'client') continue;
      if (Object.keys(rec).some((k) => !['id','exerciseId','name','kg','reps','date','note','addedBy'].includes(k)) ||
          typeof rec.name !== 'string' || !rec.name.trim() || rec.name.length > 200 ||
          typeof rec.kg !== 'number' || !Number.isFinite(rec.kg) || rec.kg < 0 || rec.kg > 10000 ||
          !Number.isInteger(rec.reps) || rec.reps < 1 || rec.reps > 100 ||
          (rec.date !== undefined && (typeof rec.date !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rec.date))) ||
          (rec.note !== undefined && (typeof rec.note !== 'string' || rec.note.length > 2000)) ||
          (rec.exerciseId !== undefined && (typeof rec.exerciseId !== 'string' || rec.exerciseId.length > 200))) return false;
    }
    return true;
  }

  function matches(row, params) {
    for (const [k, v] of params) {
      if (['select', 'order', 'on_conflict', 'limit', 'columns'].includes(k)) continue;
      let m = v.match(/^eq\.(.*)$/);
      if (m && String(row[k]) !== m[1]) return false;
      m = v.match(/^in\.\((.*)\)$/);
      if (m) {
        const list = m[1].split(',').map((x) => x.replace(/^"|"$/g, ''));
        if (!list.includes(String(row[k]))) return false;
      }
    }
    return true;
  }

  async function handler(route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    log.push(`${method} ${path}${url.search.slice(0, 100)}`);

    // ---------------- Edge Function: sign-up ----------------
    if (path === '/functions/v1/sign-up') {
      const b = JSON.parse(req.postData() || '{}');
      const email = String(b.email || '').trim().toLowerCase();
      if (b.action !== 'resend' && String(b.password || '').length < 8) return json(route, 400, { error: 'Password must be at least 8 characters.' });
      const allowed = email === coachEmail.toLowerCase() || db.clients.some((c) => c.email && c.email.toLowerCase() === email);
      const generic = () => json(route, 200, { ok: true, verificationRequired: true });
      const existing = db.users.find((u) => u.email === email);
      if (b.action === 'resend' || existing) {
        if (!existing || existing.verified || !allowed) return generic();
        const now = Date.now();
        const last = (db.verificationRequests[email] || []).filter((t) => now - t < 3600000);
        if (last.length >= 3) return generic();
        db.verificationRequests[email] = [...last, now];
        const token = 'magic-' + crypto.randomUUID();
        db.resetTokens[token] = existing.id;
        db.emails.push({ to: email, kind: 'verify', token, tokenType: 'magiclink' });
        return generic();
      }
      if (!allowed) return generic();
      const u = { id: crypto.randomUUID(), email, password: b.password, meta: { display_name: b.name }, verified: false };
      db.users.push(u);
      const token = 'verify-' + crypto.randomUUID();
      db.resetTokens[token] = u.id;
      db.emails.push({ to: email, kind: 'verify', token });
      return json(route, 200, { ok: true, verificationRequired: true });
    }

    // ---------------- Edge Functions: email ----------------
    if (path === '/functions/v1/send-invite') {
      const prof = profileOf(uidFrom(req));
      if (!prof || prof.role !== 'coach') return json(route, 403, { error: 'Only the coach can send invites.' });
      const b = JSON.parse(req.postData() || '{}');
      const c = db.clients.find((c) => c.id === b.clientId);
      if (!c || !c.email) return json(route, 400, { error: 'This client has no email yet.' });
      db.emails.push({ to: c.email, kind: 'invite' });
      return json(route, 200, { ok: true });
    }
    if (path === '/functions/v1/reset-password') {
      const b = JSON.parse(req.postData() || '{}');
      const email = String(b.email || '').trim().toLowerCase();
      const u = db.users.find((u) => u.email === email);
      if (u) {
        const token = 'rst-' + crypto.randomUUID();
        db.resetTokens[token] = u.id;
        db.emails.push({ to: email, kind: 'reset', token });
      }
      return json(route, 200, { ok: true });
    }

    // ---------------- Auth ----------------
    if (path === '/auth/v1/verify' && method === 'POST') {
      const b = JSON.parse(req.postData() || '{}');
      const id = db.resetTokens[b.token_hash];
      delete db.resetTokens[b.token_hash];
      const u = id && db.users.find((u) => u.id === id);
      if (u && (b.type === 'signup' || b.type === 'magiclink')) { u.verified = true; linkUser(u); }
      return u ? json(route, 200, sessionFor(u)) : json(route, 403, { code: 'otp_expired', msg: 'Email link is invalid or has expired' });
    }
    if (path === '/auth/v1/user' && method === 'PUT') {
      const u = db.users.find((u) => u.id === uidFrom(req));
      if (!u) return json(route, 401, {});
      const b = JSON.parse(req.postData() || '{}');
      if (b.password) u.password = b.password;
      return json(route, 200, sessionFor(u).user);
    }
    if (path === '/auth/v1/token') {
      const b = JSON.parse(req.postData() || '{}');
      if (url.searchParams.get('grant_type') === 'password') {
        const u = db.users.find((u) => u.email === String(b.email).toLowerCase() && u.password === b.password);
        if (!u) return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' });
        if (!u.verified) return json(route, 400, { error: 'invalid_grant', error_description: 'Email not confirmed', msg: 'Email not confirmed' });
        return json(route, 200, sessionFor(u));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const m = String(b.refresh_token || '').match(/^ref-(.+)$/);
        const u = m && db.users.find((u) => u.id === m[1]);
        return u ? json(route, 200, sessionFor(u)) : json(route, 400, { error: 'invalid_grant' });
      }
      return json(route, 400, { error: 'unsupported' });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (path === '/auth/v1/user') {
      const u = db.users.find((u) => u.id === uidFrom(req));
      return u ? json(route, 200, sessionFor(u).user) : json(route, 401, {});
    }

    // ---------------- Storage ----------------
    // private client videos: coach everything, a client only their own folder
    let cm = path.match(/^\/storage\/v1\/object\/(sign\/)?client-videos\/(.+)$/);
    if (cm) {
      const key = decodeURIComponent(cm[2]);
      const prof = profileOf(uidFrom(req));
      const folderOk = prof && (prof.role === 'coach' || key.split('/')[0] === prof.client_id);
      if (cm[1] && method === 'POST') {
        if (!folderOk || !db.clientFiles[key]) return json(route, 400, { message: 'Object not found' });
        return json(route, 200, { signedURL: `/object/sign/client-videos/${cm[2]}?token=t` });
      }
      if (cm[1] && method === 'GET') {
        const f = db.clientFiles[key];
        return f ? route.fulfill({ status: 200, headers: { ...cors, 'content-type': f.type }, body: f.body }) : route.fulfill({ status: 404, headers: cors, body: '' });
      }
      if (!cm[1] && method === 'POST') {
        if (!prof || prof.role !== 'coach') return json(route, 403, { message: 'new row violates row-level security policy' });
        db.clientFiles[key] = { type: 'video/webm', body: Buffer.alloc(0) };
        return json(route, 200, { Key: 'client-videos/' + cm[2] });
      }
    }
    let m = path.match(/^\/storage\/v1\/object\/sign\/exercise-videos\/(.+)$/);
    if (m && method === 'POST') {
      const key = decodeURIComponent(m[1]);
      const prof = profileOf(uidFrom(req));
      if (!prof || !db.files[key]) return json(route, 400, { message: 'Object not found' });
      return json(route, 200, { signedURL: `/object/sign/exercise-videos/${m[1]}?token=t` });
    }
    if (m && method === 'GET') {
      const f = db.files[decodeURIComponent(m[1])];
      if (!f) return route.fulfill({ status: 404, headers: cors, body: '' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': f.type }, body: f.body });
    }
    m = path.match(/^\/storage\/v1\/object\/exercise-videos\/(.+)$/);
    if (m && method === 'POST') {
      const prof = profileOf(uidFrom(req));
      if (!prof || prof.role !== 'coach') return json(route, 403, { message: 'new row violates row-level security policy' });
      let body = req.postDataBuffer() || Buffer.alloc(0);
      let type = req.headers()['content-type'] || '';
      const bm = type.match(/boundary=(.+)$/);
      if (bm) {
        // multipart: take the file part
        const text = body.toString('latin1');
        const parts = text.split('--' + bm[1]).filter((p) => p.includes('filename='));
        if (parts[0]) {
          const [head, ...rest] = parts[0].split('\r\n\r\n');
          type = (head.match(/Content-Type: ([^\r\n]+)/i) || [])[1] || 'video/webm';
          body = Buffer.from(rest.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1');
        }
      }
      db.files[decodeURIComponent(m[1])] = { type, size: body.length, body };
      return json(route, 200, { Key: 'exercise-videos/' + m[1], Id: crypto.randomUUID() });
    }
    if (path === '/storage/v1/object/exercise-videos' && method === 'DELETE') {
      const b = JSON.parse(req.postData() || '{}');
      (b.prefixes || []).forEach((p) => delete db.files[p]);
      return json(route, 200, []);
    }

    // ---------------- Results-only RPC: enforce JWT identity, ownership, fields and CAS.
    if (path === '/rest/v1/rpc/save_workout_results_secure' && method === 'POST') {
      if (db.failNextResultSaves > 0) {
        db.failNextResultSaves -= 1;
        return json(route, 503, { message: 'Temporary network error' });
      }
      const prof = profileOf(uidFrom(req));
      const x = JSON.parse(req.postData() || '{}');
      if (!prof || prof.role !== 'client' || x.p_client_id !== prof.client_id) return json(route, 403, { message: 'Not your client' });
      const w = db.workouts.find((w) => w.id === x.p_workout_id && w.client_id === x.p_client_id);
      if (!w) return json(route, 403, { message: 'Workout not found' });
      if (w.updated_at !== x.p_expected_version) return json(route, 409, { message: 'VERSION_CONFLICT' });
      const data = x.p_results;
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((k) => !['status','completedAt','sessionRpe','clientFeedback','blocks'].includes(k)))
        return json(route, 403, { message: 'Invalid result fields' });
      if (!Array.isArray(data.blocks) || data.blocks.length !== w.data.blocks.length ||
          data.blocks.some((b,i) => b.id !== w.data.blocks[i].id || Object.keys(b).some((k) => !['id','loggedSets','rpe','pain','clientNote'].includes(k)) ||
            !Array.isArray(b.loggedSets) || b.loggedSets.length !== w.data.blocks[i].loggedSets.length ||
            b.loggedSets.some((s,j) => s.setNumber !== w.data.blocks[i].loggedSets[j].setNumber || Object.keys(s).some((k) => !['setNumber','kg','reps','completed'].includes(k)))))
        return json(route, 403, { message: 'Prescription modification rejected' });
      w.data = { ...w.data, status: data.status, completedAt: data.completedAt,
        sessionRpe: data.sessionRpe, clientFeedback: data.clientFeedback,
        blocks: w.data.blocks.map((b,i) => ({ ...b, ...data.blocks[i] })) };
      w.updated_at = new Date(Date.now() + 1).toISOString();
      broadcast('workouts','UPDATE',w);
      return json(route, 200, [{ updated_version: w.updated_at }]);
    }

    // ---------------- REST ----------------
    m = path.match(/^\/rest\/v1\/(\w+)$/);
    if (m) {
      const table = m[1];
      const rows = db[table];
      if (!rows) return json(route, 404, { message: 'no table' });
      const uid = uidFrom(req);
      if (!uid) return json(route, 200, []); // anon: RLS returns nothing
      const prof = profileOf(uid);

      if (method === 'GET') {
        const out = rows.filter((r) => canRead(prof, table, r) && matches(r, url.searchParams));
        if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) {
          return out.length ? json(route, 200, out[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
        }
        return json(route, 200, out);
      }
      if (method === 'POST') {
        const body = JSON.parse(req.postData() || '[]');
        const arr = Array.isArray(body) ? body : [body];
        for (const r of arr) {
          if (table === 'clients' && r.data && 'coachNotes' in r.data)
            return json(route, 403, { message: 'Use coach_notes_secure; inline notes are forbidden' });
          if (!canWrite(prof, table, r)) return json(route, 403, { code: '42501', message: `new row violates row-level security policy for table "${table}"` });
          if (table === 'clients' && prof.role !== 'coach') {
            // Real database: INSERT ... ON CONFLICT also checks the INSERT policy (coach only), so a client can never POST here.
            return json(route, 403, { code: '42501', message: 'new row violates row-level security policy for table "clients"' });
          }
          if (table === 'workouts') {
            if (!db.clients.some((c) => c.id === r.client_id)) return json(route, 409, { code: '23503', message: 'foreign key' });
            if (rows.some((x) => x.id !== r.id && x.client_id === r.client_id && x.date === r.date)) {
              return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "workouts_client_id_date_key"' });
            }
          }
        }
        for (const r of arr) {
          const i = rows.findIndex((x) => x.id === r.id);
          const row = { ...(i >= 0 ? rows[i] : {}), ...r, updated_at: new Date().toISOString() };
          if (i >= 0) rows[i] = row;
          else rows.push(row);
          if (table === 'clients' && row.email) {
            if (prof.role === 'coach' && !db.assignments.some((a) => a.coach_id === prof.id && a.client_id === row.id))
              db.assignments.push({ coach_id: prof.id, client_id: row.id });
            db.users.filter((u) => u.email === row.email.toLowerCase()).forEach(linkUser);
          }
          broadcast(table, i >= 0 ? 'UPDATE' : 'INSERT', row);
        }
        if ((req.headers()['prefer'] || '').includes('return=representation')) {
          const added = arr.map((r) => rows.find((x) => x.id === r.id));
          if ((req.headers()['accept'] || '').includes('vnd.pgrst.object'))
            return json(route, 201, added[0]);
          return json(route, 201, added);
        }
        return route.fulfill({ status: 201, headers: cors, body: '' });
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(req.postData() || '{}');
        const hit = rows.filter((r) => matches(r, url.searchParams) && canRead(prof, table, r) && (prof.role === 'coach' ? table !== 'profiles' : canWrite(prof, table, r)));
        for (const r of hit) {
          if (table === 'clients' && patch.data && 'coachNotes' in patch.data)
            return json(route, 403, { message: 'Use coach_notes_secure; inline notes are forbidden' });
          if (table === 'clients' && prof.role !== 'coach') {
            const old = r.data || {};
            const next = patch.data || old;
            const allowed = (obj) => {
              const { photoUrl, nutrition, manualRecords, ...rest } = obj;
              const { log, ...nutRest } = nutrition || {};
              return JSON.stringify({rest,nutRest});
            };
            if ('email' in patch || allowed(old) !== allowed(next) || !clientManualRecordsAllowed(old.manualRecords, next.manualRecords))
              return json(route, 403, { message: 'Coach-owned profile or assessment cannot be changed' });
          }
          Object.assign(r, patch, { updated_at: new Date(Date.now() + log.length).toISOString() });
          broadcast(table, 'UPDATE', r);
        }
        if ((req.headers()['prefer'] || '').includes('return=representation')) return json(route, 200, hit);
        return route.fulfill({ status: 204, headers: cors });
      }
      if (method === 'DELETE') {
        if (!prof || prof.role !== 'coach') return route.fulfill({ status: 204, headers: cors }); // RLS: silently nothing
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i], url.searchParams)) {
            const [gone] = rows.splice(i, 1);
            if (table === 'clients') db.workouts = db.workouts.filter((w) => w.client_id !== gone.id);
            broadcast(table, 'DELETE', { id: gone.id }, gone);
          }
        }
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    return json(route, 404, { message: 'unmocked ' + path });
  }

  /* ---------------- Realtime (Phoenix vsn 2.0.0: [join_ref, ref, topic, event, payload]) ---------------- */
  const sockets = new Set();
  function broadcast(table, type, record, fullOld) {
    for (const s of sockets) {
      const prof = profileOf(s.uid);
      for (const sub of s.subs) {
        const b = sub.bindings.find((x) => x.table === table);
        if (!b) continue;
        if (type !== 'DELETE' && !canRead(prof, table, record)) continue;
        if (type === 'DELETE' && fullOld && !canRead(prof, table, fullOld)) continue;
        const columns = Object.keys(record).map((name) => ({ name, type: name === 'data' ? 'jsonb' : 'text' }));
        const data =
          type === 'DELETE'
            ? { type, schema: 'public', table, commit_timestamp: new Date().toISOString(), errors: null, columns, old_record: record }
            : { type, schema: 'public', table, commit_timestamp: new Date().toISOString(), errors: null, columns, record };
        s.ws.send(JSON.stringify([sub.joinRef, null, sub.topic, 'postgres_changes', { ids: [b.id], data }]));
        realtimeLog.push(`${type} ${table} -> ${prof ? prof.role : '?'}`);
      }
    }
  }
  function wsHandler(ws) {
    const s = { ws, uid: null, subs: [] };
    sockets.add(s);
    ws.onClose(() => sockets.delete(s));
    ws.onMessage((raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      const [joinRef, ref, topic, event, payload] = msg;
      const reply = (response) => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
      if (topic === 'phoenix' && event === 'heartbeat') return reply({});
      if (event === 'access_token') {
        const mm = String(payload.access_token || '').match(/tok-(.+)$/);
        if (mm) s.uid = mm[1];
        return;
      }
      if (event === 'phx_join') {
        const mm = String(payload.access_token || '').match(/tok-(.+)$/);
        if (mm) s.uid = mm[1];
        const pc = (payload.config && payload.config.postgres_changes) || [];
        const bindings = pc.map((f, i) => ({ id: 1000 + i + s.subs.length * 10, event: f.event, schema: f.schema, table: f.table, filter: f.filter }));
        s.subs.push({ joinRef, topic, bindings });
        reply({ postgres_changes: bindings });
        ws.send(JSON.stringify([joinRef, null, topic, 'system', { status: 'ok', message: 'Subscribed to PostgreSQL', extension: 'postgres_changes', channel: topic.replace('realtime:', '') }]));
        return;
      }
      if (event === 'phx_leave') {
        s.subs = s.subs.filter((x) => x.topic !== topic);
        return reply({});
      }
    });
  }

  return { db, log, handler, wsHandler, broadcast, realtimeLog };
};
