-- NEEDS ARMIN'S OK. BACK UP public.clients, public.workouts, public.profiles and auth.users FIRST.
-- Intended for Supabase SQL Editor, single transaction. DO NOT run until matching app code is deployed.
-- Security changes: private notes, scoped multi-coach access, guarded profile edits, results-only RPC.
BEGIN;

CREATE TABLE IF NOT EXISTS public.coach_client_assignments (
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, client_id)
);
ALTER TABLE public.coach_client_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_client_assignments FROM anon;
GRANT SELECT ON public.coach_client_assignments TO authenticated;
CREATE POLICY "assignment own read" ON public.coach_client_assignments FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));
-- Existing sole coach retains existing clients. Future coaches have NO client access until assigned.
INSERT INTO public.coach_client_assignments(coach_id,client_id)
SELECT p.id,c.id FROM public.profiles p CROSS JOIN public.clients c
WHERE p.role = 'coach' AND EXISTS (
 SELECT 1 FROM private.settings s WHERE s.key='coach_email' AND lower(s.value)=lower((SELECT email FROM auth.users WHERE id=p.id))
) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.can_manage_client(p_client_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.coach_client_assignments a
  JOIN public.profiles p ON p.id=a.coach_id
  WHERE a.client_id=p_client_id AND a.coach_id=auth.uid() AND p.role='coach'
 );
$$;
REVOKE ALL ON FUNCTION private.can_manage_client(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_client(text) TO authenticated;

-- Identity binding is checked on every request: switching the invited email
-- revokes the previous email's access even if an old profile row remains.
CREATE OR REPLACE FUNCTION private.my_client_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.client_id FROM public.profiles p
 JOIN auth.users u ON u.id=p.id
 JOIN public.clients c ON c.id=p.client_id
 WHERE p.id=auth.uid() AND p.role='client'
 AND lower(c.email)=lower(u.email) AND u.email_confirmed_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION private.my_client_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.my_client_id() TO authenticated;

-- Do not grant coaches access to every client merely because their role is 'coach'.
DROP POLICY IF EXISTS "clients read" ON public.clients;
DROP POLICY IF EXISTS "clients insert" ON public.clients;
DROP POLICY IF EXISTS "clients update" ON public.clients;
DROP POLICY IF EXISTS "clients delete" ON public.clients;
CREATE POLICY "clients scoped read" ON public.clients FOR SELECT TO authenticated
 USING (private.can_manage_client(id) OR id=private.my_client_id());
CREATE POLICY "clients coach insert" ON public.clients FOR INSERT TO authenticated
 WITH CHECK (private.is_coach());
CREATE POLICY "clients scoped update" ON public.clients FOR UPDATE TO authenticated
 USING (private.can_manage_client(id) OR id=private.my_client_id())
 WITH CHECK (private.can_manage_client(id) OR id=private.my_client_id());
CREATE POLICY "clients scoped delete" ON public.clients FOR DELETE TO authenticated
 USING (private.can_manage_client(id));

-- When a coach creates a client, grant the creator access in the same transaction.
CREATE OR REPLACE FUNCTION private.assign_new_client() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='coach') THEN
   INSERT INTO public.coach_client_assignments(coach_id,client_id) VALUES (auth.uid(),new.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS t8b_assign_new_client ON public.clients;
CREATE TRIGGER t8b_assign_new_client AFTER INSERT ON public.clients
 FOR EACH ROW EXECUTE FUNCTION private.assign_new_client();

DROP POLICY IF EXISTS "workouts read" ON public.workouts;
DROP POLICY IF EXISTS "workouts insert" ON public.workouts;
DROP POLICY IF EXISTS "workouts update" ON public.workouts;
DROP POLICY IF EXISTS "workouts delete" ON public.workouts;
CREATE POLICY "workouts scoped read" ON public.workouts FOR SELECT TO authenticated
 USING (private.can_manage_client(client_id) OR client_id=private.my_client_id());
CREATE POLICY "workouts coach insert" ON public.workouts FOR INSERT TO authenticated
 WITH CHECK (private.can_manage_client(client_id));
CREATE POLICY "workouts coach update" ON public.workouts FOR UPDATE TO authenticated
 USING (private.can_manage_client(client_id)) WITH CHECK (private.can_manage_client(client_id));
CREATE POLICY "workouts coach delete" ON public.workouts FOR DELETE TO authenticated
 USING (private.can_manage_client(client_id));

-- Coach allowlist supports Danial without granting a newly-added coach every client.
-- Armin/DB admin must explicitly add verified Danial email and assignments later.
CREATE TABLE IF NOT EXISTS private.coach_allowlist (email text PRIMARY KEY);
REVOKE ALL ON private.coach_allowlist FROM PUBLIC,anon,authenticated;
INSERT INTO private.coach_allowlist(email)
SELECT lower(value) FROM private.settings WHERE key='coach_email' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.signup_role(p_email text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE
  WHEN EXISTS (SELECT 1 FROM private.coach_allowlist a WHERE a.email=lower(trim(p_email))) THEN 'coach'
  WHEN EXISTS (SELECT 1 FROM public.clients c WHERE c.email<>'' AND lower(c.email)=lower(trim(p_email))) THEN 'client'
  ELSE NULL
 END;
$$;
REVOKE ALL ON FUNCTION public.signup_role(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.signup_role(text) TO service_role;

CREATE OR REPLACE FUNCTION private.link_user(uid uuid, user_email text, user_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cid text; cname text;
BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=uid) THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM private.coach_allowlist a WHERE a.email=lower(user_email)) THEN
   INSERT INTO public.profiles(id,role,display_name)
     VALUES(uid,'coach',coalesce(nullif(user_name,''),split_part(user_email,'@',1)));
   RETURN;
 END IF;
 SELECT c.id,c.data->>'name' INTO cid,cname FROM public.clients c
 WHERE lower(c.email)=lower(user_email) LIMIT 1;
 IF cid IS NOT NULL THEN
   INSERT INTO public.profiles(id,role,display_name,client_id)
     VALUES(uid,'client',coalesce(cname,split_part(user_email,'@',1)),cid);
 END IF;
END;
$$;

-- Non-admin coach may see only linked client profiles, not the entire roster.
CREATE OR REPLACE FUNCTION private.can_see_profile(p_id uuid,p_client_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_id=auth.uid() OR
   (p_client_id IS NOT NULL AND private.can_manage_client(p_client_id));
$$;
REVOKE ALL ON FUNCTION private.can_see_profile(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_see_profile(uuid,text) TO authenticated;
DROP POLICY IF EXISTS "profiles read" ON public.profiles;
CREATE POLICY "profiles scoped read" ON public.profiles FOR SELECT TO authenticated
 USING (private.can_see_profile(id,client_id));

-- Multi-trainer privacy: messages and their media must also respect assignments.
DROP POLICY IF EXISTS "coach messages read" ON public.coach_messages;
DROP POLICY IF EXISTS "coach messages insert" ON public.coach_messages;
DROP POLICY IF EXISTS "coach messages update" ON public.coach_messages;
CREATE POLICY "coach messages scoped read" ON public.coach_messages FOR SELECT TO authenticated
 USING (private.can_manage_client(client_id) OR client_id=private.my_client_id());
CREATE POLICY "coach messages scoped insert" ON public.coach_messages FOR INSERT TO authenticated
 WITH CHECK ((private.can_manage_client(client_id) AND from_coach)
  OR (client_id=private.my_client_id() AND NOT from_coach));
CREATE POLICY "coach messages scoped update" ON public.coach_messages FOR UPDATE TO authenticated
 USING ((private.can_manage_client(client_id) AND NOT from_coach)
  OR (client_id=private.my_client_id() AND from_coach))
 WITH CHECK ((private.can_manage_client(client_id) AND NOT from_coach)
  OR (client_id=private.my_client_id() AND from_coach));
DROP POLICY IF EXISTS "message media read" ON storage.objects;
DROP POLICY IF EXISTS "message media upload" ON storage.objects;
CREATE POLICY "message media scoped read" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='message-media' AND (private.can_manage_client((storage.foldername(name))[1])
  OR (storage.foldername(name))[1]=private.my_client_id()));
CREATE POLICY "message media scoped upload" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='message-media' AND (private.can_manage_client((storage.foldername(name))[1])
  OR (storage.foldername(name))[1]=private.my_client_id()));

-- Other coach-owned referral records must not leak to a newly added trainer.
DROP POLICY IF EXISTS "referral codes read" ON public.referral_codes;
CREATE POLICY "referral codes scoped read" ON public.referral_codes FOR SELECT TO authenticated
 USING (private.can_manage_client(client_id) OR client_id=private.my_client_id());
DROP POLICY IF EXISTS "referrals read" ON public.referrals;
DROP POLICY IF EXISTS "referrals update" ON public.referrals;
DROP POLICY IF EXISTS "referrals delete" ON public.referrals;
CREATE POLICY "referrals scoped read" ON public.referrals FOR SELECT TO authenticated
 USING (private.can_manage_client(referrer_client_id) OR referrer_client_id=private.my_client_id());
CREATE POLICY "referrals scoped update" ON public.referrals FOR UPDATE TO authenticated
 USING(private.can_manage_client(referrer_client_id)) WITH CHECK(private.can_manage_client(referrer_client_id));
CREATE POLICY "referrals scoped delete" ON public.referrals FOR DELETE TO authenticated
 USING(private.can_manage_client(referrer_client_id));
DROP POLICY IF EXISTS "redemptions read" ON public.credit_redemptions;
DROP POLICY IF EXISTS "redemptions insert" ON public.credit_redemptions;
DROP POLICY IF EXISTS "redemptions delete" ON public.credit_redemptions;
CREATE POLICY "redemptions scoped read" ON public.credit_redemptions FOR SELECT TO authenticated
 USING(private.can_manage_client(client_id) OR client_id=private.my_client_id());
CREATE POLICY "redemptions scoped insert" ON public.credit_redemptions FOR INSERT TO authenticated
 WITH CHECK(private.can_manage_client(client_id));
CREATE POLICY "redemptions scoped delete" ON public.credit_redemptions FOR DELETE TO authenticated
 USING(private.can_manage_client(client_id));

-- Existing SECURITY DEFINER referral status function bypasses RLS; scope it explicitly.
CREATE OR REPLACE FUNCTION public.set_referral_status(p_id uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE amount numeric; cid text;
BEGIN
 SELECT referrer_client_id INTO cid FROM public.referrals WHERE id=p_id;
 IF cid IS NULL OR NOT private.can_manage_client(cid) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('invited','signed_up','paying','declined') THEN
  RAISE EXCEPTION 'Unknown status' USING ERRCODE='22023'; END IF;
 SELECT coalesce(nullif(value,'')::numeric,0) INTO amount FROM private.settings WHERE key='referral_credit';
 UPDATE public.referrals SET status=p_status,
  credit=CASE WHEN p_status='paying' THEN CASE WHEN credit>0 THEN credit ELSE coalesce(amount,0) END ELSE 0 END,
  updated_at=now() WHERE id=p_id;
END;
$$;

-- Assessment media: only assigned coaches and the owning client can read; only assigned coaches write.
DROP POLICY IF EXISTS "client videos read" ON storage.objects;
DROP POLICY IF EXISTS "client videos upload" ON storage.objects;
DROP POLICY IF EXISTS "client videos update" ON storage.objects;
DROP POLICY IF EXISTS "client videos delete" ON storage.objects;
CREATE POLICY "client videos scoped read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='client-videos' AND (private.can_manage_client((storage.foldername(name))[1]) OR (storage.foldername(name))[1]=private.my_client_id()));
CREATE POLICY "client videos scoped upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='client-videos' AND (private.can_manage_client((storage.foldername(name))[1])));
CREATE POLICY "client videos scoped update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='client-videos' AND (private.can_manage_client((storage.foldername(name))[1]))) WITH CHECK (bucket_id='client-videos' AND (private.can_manage_client((storage.foldername(name))[1])));
CREATE POLICY "client videos scoped delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='client-videos' AND (private.can_manage_client((storage.foldername(name))[1])));
DROP POLICY IF EXISTS "inbody read" ON storage.objects;
DROP POLICY IF EXISTS "inbody upload" ON storage.objects;
DROP POLICY IF EXISTS "inbody update" ON storage.objects;
DROP POLICY IF EXISTS "inbody delete" ON storage.objects;
CREATE POLICY "inbody scoped read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='inbody-printouts' AND (private.can_manage_client((storage.foldername(name))[1]) OR (storage.foldername(name))[1]=private.my_client_id()));
CREATE POLICY "inbody scoped upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='inbody-printouts' AND (private.can_manage_client((storage.foldername(name))[1])));
CREATE POLICY "inbody scoped update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='inbody-printouts' AND (private.can_manage_client((storage.foldername(name))[1]))) WITH CHECK (bucket_id='inbody-printouts' AND (private.can_manage_client((storage.foldername(name))[1])));
CREATE POLICY "inbody scoped delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='inbody-printouts' AND (private.can_manage_client((storage.foldername(name))[1])));

-- Notes are a separate row-per-note table. Only explicitly shared notes may reach clients.
CREATE TABLE IF NOT EXISTS public.coach_notes_secure (
 id text PRIMARY KEY, client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 date text NOT NULL DEFAULT '', text text NOT NULL DEFAULT '', shared boolean NOT NULL DEFAULT false,
 pinned boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_notes_secure_client_idx ON public.coach_notes_secure(client_id);
ALTER TABLE public.coach_notes_secure ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.coach_notes_secure TO authenticated;
CREATE POLICY "notes scoped read" ON public.coach_notes_secure FOR SELECT TO authenticated
 USING (private.can_manage_client(client_id) OR (shared AND client_id=private.my_client_id()));
CREATE POLICY "notes coach insert" ON public.coach_notes_secure FOR INSERT TO authenticated
 WITH CHECK (private.can_manage_client(client_id));
CREATE POLICY "notes coach update" ON public.coach_notes_secure FOR UPDATE TO authenticated
 USING (private.can_manage_client(client_id)) WITH CHECK (private.can_manage_client(client_id));
CREATE POLICY "notes coach delete" ON public.coach_notes_secure FOR DELETE TO authenticated
 USING (private.can_manage_client(client_id));

-- Transactional backfill and scrub. Snapshot old JSON data BEFORE running for rollback.
INSERT INTO public.coach_notes_secure(id,client_id,date,text,shared,pinned)
SELECT n.item->>'id',c.id,coalesce(n.item->>'date',''),coalesce(n.item->>'text',''),
       coalesce((n.item->>'shared')::boolean,false),coalesce((n.item->>'pinned')::boolean,false)
FROM public.clients c
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.data->'coachNotes')='array' THEN c.data->'coachNotes' ELSE '[]'::jsonb END) AS n(item)
WHERE n.item->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;
-- Readback gate: abort the entire transaction if any note was not transferred.
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM public.clients c,
   LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.data->'coachNotes')='array' THEN c.data->'coachNotes' ELSE '[]'::jsonb END) n(item)
   WHERE NOT EXISTS (SELECT 1 FROM public.coach_notes_secure s
      WHERE s.id=n.item->>'id' AND s.client_id=c.id AND s.text=coalesce(n.item->>'text',''))
 ) THEN RAISE EXCEPTION 'T8b notes readback failed, transaction rolled back'; END IF;
END $$;
UPDATE public.clients SET data=data-'coachNotes' WHERE data ? 'coachNotes';

-- Defense in depth: no later buggy/old coach client-data write can reintroduce private notes.
CREATE OR REPLACE FUNCTION private.reject_inline_notes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF new.data ? 'coachNotes' THEN
  RAISE EXCEPTION 'Use coach_notes_secure; inline notes are forbidden' USING ERRCODE='42501';
 END IF;
 RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS t8b_reject_inline_notes ON public.clients;
CREATE TRIGGER t8b_reject_inline_notes BEFORE INSERT OR UPDATE ON public.clients
 FOR EACH ROW EXECUTE FUNCTION private.reject_inline_notes();

-- Block clients from changing assessments, notes, and any coach-owned profile content.
-- Existing client UI can still update only its profile photo and nutrition log; no other data key.
CREATE OR REPLACE FUNCTION private.guard_client_data() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_safe jsonb; new_safe jsonb;
        old_coach jsonb; new_coach jsonb; rec jsonb;
        new_records jsonb;
BEGIN
 IF NOT private.can_manage_client(old.id) THEN
  IF new.email IS DISTINCT FROM old.email OR new.id IS DISTINCT FROM old.id THEN
    RAISE EXCEPTION 'Client identity is coach-owned' USING ERRCODE='42501';
  END IF;
  old_safe := old.data - 'photoUrl' - 'nutrition' - 'manualRecords';
  new_safe := new.data - 'photoUrl' - 'nutrition' - 'manualRecords';
  IF old_safe IS DISTINCT FROM new_safe OR
    (coalesce(old.data->'nutrition','{}'::jsonb) - 'log') IS DISTINCT FROM
    (coalesce(new.data->'nutrition','{}'::jsonb) - 'log') THEN
   RAISE EXCEPTION 'Coach-owned profile or assessment cannot be changed' USING ERRCODE='42501';
  END IF;
  IF (new.data ? 'manualRecords') AND
     jsonb_typeof(new.data->'manualRecords') <> 'array' THEN
   RAISE EXCEPTION 'Invalid manual records' USING ERRCODE='22023';
  END IF;
  new_records := CASE WHEN jsonb_typeof(new.data->'manualRecords')='array'
                      THEN new.data->'manualRecords' ELSE '[]'::jsonb END;
  IF jsonb_array_length(new_records) > 500 THEN
   RAISE EXCEPTION 'Too many manual records' USING ERRCODE='22023';
  END IF;
  -- Coach-created records must survive unchanged, including attribution and IDs.
  SELECT coalesce(jsonb_agg(r.value ORDER BY r.value->>'id'),'[]'::jsonb)
   INTO old_coach FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(old.data->'manualRecords')='array'
         THEN old.data->'manualRecords' ELSE '[]'::jsonb END) r
   WHERE r.value->>'addedBy' IS DISTINCT FROM 'client';
  SELECT coalesce(jsonb_agg(r.value ORDER BY r.value->>'id'),'[]'::jsonb)
   INTO new_coach FROM jsonb_array_elements(new_records) r
   WHERE r.value->>'addedBy' IS DISTINCT FROM 'client';
  IF old_coach IS DISTINCT FROM new_coach THEN
   RAISE EXCEPTION 'Coach-created records cannot be edited or deleted' USING ERRCODE='42501';
  END IF;
  -- No duplicate IDs or malformed client records (prevents collisions with coach IDs).
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(new_records) r
    WHERE jsonb_typeof(r.value) <> 'object' OR nullif(r.value->>'id','') IS NULL
       OR length(r.value->>'id') > 120) OR
     (SELECT count(*) FROM jsonb_array_elements(new_records)) <>
     (SELECT count(DISTINCT r.value->>'id') FROM jsonb_array_elements(new_records) r) THEN
   RAISE EXCEPTION 'Invalid or duplicate manual record IDs' USING ERRCODE='22023';
  END IF;
  FOR rec IN SELECT value FROM jsonb_array_elements(new_records)
    WHERE value->>'addedBy'='client' LOOP
   IF (rec - 'id' - 'exerciseId' - 'name' - 'kg' - 'reps' - 'date' - 'note' - 'addedBy') <> '{}'::jsonb
      OR jsonb_typeof(rec->'name') <> 'string' OR length(trim(rec->>'name')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(rec->'kg') <> 'number' OR (rec->>'kg')::numeric NOT BETWEEN 0 AND 10000
      OR jsonb_typeof(rec->'reps') <> 'number' OR (rec->>'reps')::numeric NOT BETWEEN 1 AND 100
      OR (rec->>'reps')::numeric <> trunc((rec->>'reps')::numeric)
      OR (rec ? 'date' AND (jsonb_typeof(rec->'date') <> 'string' OR rec->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
      OR (rec ? 'note' AND (jsonb_typeof(rec->'note') <> 'string' OR length(rec->>'note') > 2000))
      OR (rec ? 'exerciseId' AND (jsonb_typeof(rec->'exerciseId') <> 'string' OR length(rec->>'exerciseId') > 200)) THEN
    RAISE EXCEPTION 'Invalid client manual record' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END IF;
 RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS t8b_guard_client_data ON public.clients;
CREATE TRIGGER t8b_guard_client_data BEFORE UPDATE ON public.clients
 FOR EACH ROW EXECUTE FUNCTION private.guard_client_data();

-- RPC: clients may submit only result fields, never prescriptions. CAS on updated_at.
CREATE OR REPLACE FUNCTION public.save_workout_results_secure(
 p_workout_id text, p_client_id text, p_expected_version timestamptz,
 p_results jsonb
) RETURNS TABLE(updated_version timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.workouts%ROWTYPE; b jsonb; patch jsonb; next_blocks jsonb := '[]'::jsonb;
        touched jsonb := '[]'::jsonb; current_ids text[]; wanted_ids text[];
BEGIN
 IF auth.uid() IS NULL OR p_client_id IS DISTINCT FROM private.my_client_id() THEN
  RAISE EXCEPTION 'Not your client' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM public.workouts WHERE id=p_workout_id AND client_id=p_client_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found' USING ERRCODE='42501'; END IF;
 IF w.updated_at IS DISTINCT FROM p_expected_version THEN
  RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(p_results) IS DISTINCT FROM 'object' OR
    (p_results - 'blocks' - 'status' - 'completedAt' - 'sessionRpe' - 'clientFeedback') <> '{}'::jsonb THEN
   RAISE EXCEPTION 'Invalid result fields' USING ERRCODE='42501'; END IF;
 IF NOT (p_results ? 'status') OR NOT (p_results ? 'blocks') THEN
   RAISE EXCEPTION 'Missing required results' USING ERRCODE='22023'; END IF;
 IF (p_results ? 'clientFeedback') AND p_results->'clientFeedback' <> 'null'::jsonb AND
   (jsonb_typeof(p_results->'clientFeedback') IS DISTINCT FROM 'string' OR
    length(p_results->>'clientFeedback') > 4000) THEN
   RAISE EXCEPTION 'Invalid feedback' USING ERRCODE='22023'; END IF;
 IF (p_results ? 'completedAt') AND p_results->'completedAt' <> 'null'::jsonb AND
    jsonb_typeof(p_results->'completedAt') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Invalid completion date' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_results->'blocks') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Blocks must be an array' USING ERRCODE='22023'; END IF;
 IF (p_results ? 'status') AND (p_results->>'status') NOT IN ('planned','completed','missed') THEN
   RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
 IF (p_results ? 'sessionRpe') AND p_results->'sessionRpe' <> 'null'::jsonb AND
    (jsonb_typeof(p_results->'sessionRpe') <> 'number' OR (p_results->>'sessionRpe')::numeric NOT BETWEEN 1 AND 10) THEN
   RAISE EXCEPTION 'Invalid RPE' USING ERRCODE='22023'; END IF;
 SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO current_ids FROM jsonb_array_elements(w.data->'blocks') e;
 SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO wanted_ids FROM jsonb_array_elements(p_results->'blocks') e;
 IF current_ids IS DISTINCT FROM wanted_ids THEN
   RAISE EXCEPTION 'Block ids mismatch' USING ERRCODE='42501'; END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(w.data->'blocks') LOOP
   SELECT value INTO patch FROM jsonb_array_elements(p_results->'blocks') WHERE value->>'id'=b->>'id';
   IF jsonb_typeof(patch) <> 'object' OR
      (patch - 'id' - 'loggedSets' - 'rpe' - 'pain' - 'clientNote') <> '{}'::jsonb THEN
     RAISE EXCEPTION 'Only client result fields allowed' USING ERRCODE='42501'; END IF;
   IF NOT (patch ? 'loggedSets') OR jsonb_typeof(patch->'loggedSets') <> 'array' OR
     jsonb_array_length(patch->'loggedSets') <> jsonb_array_length(b->'loggedSets') THEN
     RAISE EXCEPTION 'Set shape changed' USING ERRCODE='42501'; END IF;
   -- All prescribed set numbers must match, and each set has only the logging fields.
   IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(patch->'loggedSets') s
    WHERE (s.value - 'setNumber' - 'kg' - 'reps' - 'completed') <> '{}'::jsonb
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b->'loggedSets') orig
                      WHERE orig->'setNumber'=s.value->'setNumber')
   ) THEN RAISE EXCEPTION 'Invalid set result' USING ERRCODE='42501'; END IF;
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(patch->'loggedSets') item
     WHERE NOT (item.value ? 'setNumber') OR NOT (item.value ? 'kg') OR
           NOT (item.value ? 'reps') OR NOT (item.value ? 'completed') OR
           jsonb_typeof(item.value->'completed') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(item.value->'setNumber') IS DISTINCT FROM 'number'
       OR (item.value->'kg' <> 'null'::jsonb AND
          (jsonb_typeof(item.value->'kg') IS DISTINCT FROM 'number' OR
           (item.value->>'kg')::numeric NOT BETWEEN 0 AND 100000))
       OR (item.value->'reps' <> 'null'::jsonb AND
          (jsonb_typeof(item.value->'reps') IS DISTINCT FROM 'number' OR
           (item.value->>'reps')::numeric NOT BETWEEN 0 AND 100000))
   ) THEN RAISE EXCEPTION 'Invalid result values' USING ERRCODE='22023'; END IF;
   IF (patch ? 'rpe') AND patch->'rpe' <> 'null'::jsonb AND
      (jsonb_typeof(patch->'rpe') IS DISTINCT FROM 'number' OR
       (patch->>'rpe')::numeric NOT BETWEEN 0 AND 10) THEN
     RAISE EXCEPTION 'Invalid exercise RPE' USING ERRCODE='22023'; END IF;
   IF (patch ? 'clientNote') AND patch->'clientNote' <> 'null'::jsonb AND
      (jsonb_typeof(patch->'clientNote') IS DISTINCT FROM 'string' OR
       length(patch->>'clientNote') > 4000) THEN
     RAISE EXCEPTION 'Invalid client note' USING ERRCODE='22023'; END IF;
   IF (patch ? 'pain') AND jsonb_typeof(patch->'pain') IS DISTINCT FROM 'boolean' THEN
     RAISE EXCEPTION 'Invalid pain field' USING ERRCODE='22023'; END IF;
   b := (b - 'loggedSets' - 'rpe' - 'pain' - 'clientNote') ||
      (patch - 'id');
   next_blocks := next_blocks || jsonb_build_array(b);
 END LOOP;
 UPDATE public.workouts SET data = (w.data - 'blocks' - 'status' - 'completedAt' - 'sessionRpe' - 'clientFeedback') ||
   (p_results - 'blocks') || jsonb_build_object('blocks',next_blocks), updated_at=clock_timestamp()
 WHERE id=w.id RETURNING updated_at INTO updated_version;
 RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.save_workout_results_secure(text,text,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_workout_results_secure(text,text,timestamptz,jsonb) TO authenticated;

-- Future Danial access: insert his verified email in private.coach_allowlist,
-- then create/verify his profile and insert coach_client_assignments explicitly.
-- No unapproved email or automatic all-client access is granted by this migration.

COMMIT;
