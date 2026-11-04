-- EMERGENCY ROLLBACK ONLY. Requires Armin's OK and backups.
-- CAUTION: Restores legacy insecure behavior; do NOT run on a live client service.
-- Verify the export/backup is complete, then run during maintenance window.
BEGIN;
-- Return notes to the legacy JSON field, including notes saved after migration.
UPDATE public.clients c SET data = jsonb_set(c.data,'{coachNotes}',COALESCE((
 SELECT jsonb_agg(jsonb_build_object('id',n.id,'date',n.date,'text',n.text,'shared',n.shared,'pinned',n.pinned)
 ORDER BY n.date DESC) FROM public.coach_notes_secure n WHERE n.client_id=c.id
),'[]'::jsonb),true)
WHERE EXISTS(SELECT 1 FROM public.coach_notes_secure n WHERE n.client_id=c.id);
DROP TRIGGER IF EXISTS t8b_reject_inline_notes ON public.clients;
DROP FUNCTION IF EXISTS private.reject_inline_notes();
DROP TRIGGER IF EXISTS t8b_guard_client_data ON public.clients;
DROP FUNCTION IF EXISTS private.guard_client_data();
DROP TRIGGER IF EXISTS t8b_assign_new_client ON public.clients;
DROP FUNCTION IF EXISTS private.assign_new_client();
DROP FUNCTION IF EXISTS public.save_workout_results_secure(text,text,timestamptz,jsonb);
DROP POLICY IF EXISTS "notes scoped read" ON public.coach_notes_secure;
DROP POLICY IF EXISTS "notes coach insert" ON public.coach_notes_secure;
DROP POLICY IF EXISTS "notes coach update" ON public.coach_notes_secure;
DROP POLICY IF EXISTS "notes coach delete" ON public.coach_notes_secure;
DROP TABLE IF EXISTS public.coach_notes_secure;
DROP POLICY IF EXISTS "workouts scoped read" ON public.workouts;
DROP POLICY IF EXISTS "workouts coach insert" ON public.workouts;
DROP POLICY IF EXISTS "workouts coach update" ON public.workouts;
DROP POLICY IF EXISTS "workouts coach delete" ON public.workouts;
CREATE POLICY "workouts read" ON public.workouts FOR SELECT TO authenticated USING(private.is_coach() OR client_id=private.my_client_id());
CREATE POLICY "workouts insert" ON public.workouts FOR INSERT TO authenticated WITH CHECK(private.is_coach() OR client_id=private.my_client_id());
CREATE POLICY "workouts update" ON public.workouts FOR UPDATE TO authenticated USING(private.is_coach() OR client_id=private.my_client_id()) WITH CHECK(private.is_coach() OR client_id=private.my_client_id());
CREATE POLICY "workouts delete" ON public.workouts FOR DELETE TO authenticated USING(private.is_coach());
DROP POLICY IF EXISTS "clients scoped read" ON public.clients;
DROP POLICY IF EXISTS "clients coach insert" ON public.clients;
DROP POLICY IF EXISTS "clients scoped update" ON public.clients;
DROP POLICY IF EXISTS "clients scoped delete" ON public.clients;
CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated USING(private.is_coach() OR id=private.my_client_id());
CREATE POLICY "clients insert" ON public.clients FOR INSERT TO authenticated WITH CHECK(private.is_coach());
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated USING(private.is_coach() OR id=private.my_client_id()) WITH CHECK(private.is_coach() OR id=private.my_client_id());
CREATE POLICY "clients delete" ON public.clients FOR DELETE TO authenticated USING(private.is_coach());
DROP POLICY IF EXISTS "profiles scoped read" ON public.profiles;
CREATE POLICY "profiles read" ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR private.is_coach());
DROP FUNCTION IF EXISTS private.can_see_profile(uuid,text);
-- Restore old broad single-coach policies for rollback compatibility.
DROP POLICY IF EXISTS "coach messages scoped read" ON public.coach_messages;
DROP POLICY IF EXISTS "coach messages scoped insert" ON public.coach_messages;
DROP POLICY IF EXISTS "coach messages scoped update" ON public.coach_messages;
CREATE POLICY "coach messages read" ON public.coach_messages FOR SELECT TO authenticated
 USING(private.is_coach() OR client_id=private.my_client_id());
CREATE POLICY "coach messages insert" ON public.coach_messages FOR INSERT TO authenticated
 WITH CHECK((private.is_coach() AND from_coach) OR (client_id=private.my_client_id() AND NOT from_coach));
CREATE POLICY "coach messages update" ON public.coach_messages FOR UPDATE TO authenticated
 USING((private.is_coach() AND NOT from_coach) OR (client_id=private.my_client_id() AND from_coach))
 WITH CHECK((private.is_coach() AND NOT from_coach) OR (client_id=private.my_client_id() AND from_coach));
DROP POLICY IF EXISTS "message media scoped read" ON storage.objects;
DROP POLICY IF EXISTS "message media scoped upload" ON storage.objects;
CREATE POLICY "message media read" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='message-media' AND (private.is_coach() OR (storage.foldername(name))[1]=private.my_client_id()));
CREATE POLICY "message media upload" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='message-media' AND (private.is_coach() OR (storage.foldername(name))[1]=private.my_client_id()));
DROP POLICY IF EXISTS "referral codes scoped read" ON public.referral_codes;
CREATE POLICY "referral codes read" ON public.referral_codes FOR SELECT TO authenticated
 USING(private.is_coach() OR client_id=private.my_client_id());
DROP POLICY IF EXISTS "referrals scoped read" ON public.referrals;
DROP POLICY IF EXISTS "referrals scoped update" ON public.referrals;
DROP POLICY IF EXISTS "referrals scoped delete" ON public.referrals;
CREATE POLICY "referrals read" ON public.referrals FOR SELECT TO authenticated
 USING(private.is_coach() OR referrer_client_id=private.my_client_id());
CREATE POLICY "referrals update" ON public.referrals FOR UPDATE TO authenticated
 USING(private.is_coach()) WITH CHECK(private.is_coach());
CREATE POLICY "referrals delete" ON public.referrals FOR DELETE TO authenticated USING(private.is_coach());
DROP POLICY IF EXISTS "redemptions scoped read" ON public.credit_redemptions;
DROP POLICY IF EXISTS "redemptions scoped insert" ON public.credit_redemptions;
DROP POLICY IF EXISTS "redemptions scoped delete" ON public.credit_redemptions;
CREATE POLICY "redemptions read" ON public.credit_redemptions FOR SELECT TO authenticated
 USING(private.is_coach() OR client_id=private.my_client_id());
CREATE POLICY "redemptions insert" ON public.credit_redemptions FOR INSERT TO authenticated WITH CHECK(private.is_coach());
CREATE POLICY "redemptions delete" ON public.credit_redemptions FOR DELETE TO authenticated USING(private.is_coach());
CREATE OR REPLACE FUNCTION public.set_referral_status(p_id uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE amount numeric;
BEGIN
 IF NOT private.is_coach() THEN RAISE EXCEPTION 'Only coach'; END IF;
 IF p_status NOT IN ('invited','signed_up','paying','declined') THEN RAISE EXCEPTION 'Unknown status'; END IF;
 SELECT coalesce(nullif(value,'')::numeric,0) INTO amount FROM private.settings WHERE key='referral_credit';
 UPDATE public.referrals SET status=p_status,
 credit=CASE WHEN p_status='paying' THEN CASE WHEN credit>0 THEN credit ELSE coalesce(amount,0) END ELSE 0 END,
 updated_at=now() WHERE id=p_id;
END;
$$;
CREATE OR REPLACE FUNCTION private.my_client_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT client_id FROM public.profiles WHERE id=auth.uid() AND role='client';
$$;
REVOKE ALL ON FUNCTION private.my_client_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.my_client_id() TO authenticated;

DROP POLICY IF EXISTS "client videos scoped read" ON storage.objects;
DROP POLICY IF EXISTS "client videos scoped upload" ON storage.objects;
DROP POLICY IF EXISTS "client videos scoped update" ON storage.objects;
DROP POLICY IF EXISTS "client videos scoped delete" ON storage.objects;
CREATE POLICY "client videos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='client-videos' AND (private.is_coach() OR (storage.foldername(name))[1]=private.my_client_id()));
CREATE POLICY "client videos upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='client-videos' AND (private.is_coach()));
CREATE POLICY "client videos update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='client-videos' AND (private.is_coach())) WITH CHECK (bucket_id='client-videos' AND (private.is_coach()));
CREATE POLICY "client videos delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='client-videos' AND (private.is_coach()));
DROP POLICY IF EXISTS "inbody scoped read" ON storage.objects;
DROP POLICY IF EXISTS "inbody scoped upload" ON storage.objects;
DROP POLICY IF EXISTS "inbody scoped update" ON storage.objects;
DROP POLICY IF EXISTS "inbody scoped delete" ON storage.objects;
CREATE POLICY "inbody read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='inbody-printouts' AND (private.is_coach() OR (storage.foldername(name))[1]=private.my_client_id()));
CREATE POLICY "inbody upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='inbody-printouts' AND (private.is_coach()));
CREATE POLICY "inbody update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='inbody-printouts' AND (private.is_coach())) WITH CHECK (bucket_id='inbody-printouts' AND (private.is_coach()));
CREATE POLICY "inbody delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='inbody-printouts' AND (private.is_coach()));
DROP FUNCTION IF EXISTS private.can_manage_client(text);
DROP POLICY IF EXISTS "assignment own read" ON public.coach_client_assignments;
DROP TABLE IF EXISTS public.coach_client_assignments;
-- Legacy singleton coach lookup restored (requires no Danial-only live profiles).
CREATE OR REPLACE FUNCTION public.signup_role(p_email text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM private.settings s WHERE s.key='coach_email' AND lower(s.value)=lower(trim(p_email))) THEN 'coach'
 WHEN EXISTS(SELECT 1 FROM public.clients c WHERE c.email<>'' AND lower(c.email)=lower(trim(p_email))) THEN 'client'
 ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.signup_role(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.signup_role(text) TO service_role;
CREATE OR REPLACE FUNCTION private.link_user(uid uuid,user_email text,user_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE coach_email text; cid text; cname text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=uid) THEN RETURN; END IF;
 SELECT value INTO coach_email FROM private.settings WHERE key='coach_email';
 IF coach_email IS NOT NULL AND lower(user_email)=lower(coach_email) THEN
  INSERT INTO public.profiles(id,role,display_name) VALUES(uid,'coach',coalesce(nullif(user_name,''),split_part(user_email,'@',1))); RETURN;
 END IF;
 SELECT c.id,c.data->>'name' INTO cid,cname FROM public.clients c WHERE lower(c.email)=lower(user_email) LIMIT 1;
 IF cid IS NOT NULL THEN INSERT INTO public.profiles(id,role,display_name,client_id)
 VALUES(uid,'client',coalesce(cname,split_part(user_email,'@',1)),cid); END IF;
END;
$$;
DROP TABLE IF EXISTS private.coach_allowlist;
COMMIT;
