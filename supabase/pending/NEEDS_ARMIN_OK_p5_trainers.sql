-- NEEDS ARMIN'S OK: Requires T8b security SQL first; do NOT run automatically.
BEGIN;
CREATE OR REPLACE FUNCTION public.pf_head_coach() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
 JOIN private.settings s ON s.key='coach_email' AND lower(s.value)=lower(u.email)
 WHERE p.id=auth.uid() AND p.role='coach' AND u.email_confirmed_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.pf_head_coach() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pf_head_coach() TO authenticated;
CREATE OR REPLACE FUNCTION public.pf_trainer_is_allowed(p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.pf_head_coach() AND EXISTS(SELECT 1 FROM private.coach_allowlist WHERE email=lower(trim(p_email)));
$$;
REVOKE ALL ON FUNCTION public.pf_trainer_is_allowed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pf_trainer_is_allowed(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.pf_list_trainers()
RETURNS TABLE(email text, coach_id uuid, display_name text, verified boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.pf_head_coach() THEN RAISE EXCEPTION 'Head coach only' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT a.email,p.id,coalesce(p.display_name,''),u.email_confirmed_at IS NOT NULL
 FROM private.coach_allowlist a LEFT JOIN auth.users u ON lower(u.email)=a.email
 LEFT JOIN public.profiles p ON p.id=u.id AND p.role='coach'
 ORDER BY a.email;
END;$$;
REVOKE ALL ON FUNCTION public.pf_list_trainers() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pf_list_trainers() TO authenticated;
CREATE OR REPLACE FUNCTION public.pf_manage_trainer(p_action text,p_email text,p_client_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid; addr text:=lower(trim(p_email));
BEGIN
 IF NOT public.pf_head_coach() THEN RAISE EXCEPTION 'Head coach only' USING ERRCODE='42501'; END IF;
 IF addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email'; END IF;
 IF p_action='invite' THEN
   INSERT INTO private.coach_allowlist(email) VALUES(addr) ON CONFLICT DO NOTHING;
   RETURN true;
 ELSIF p_action IN ('assign','unassign') THEN
   SELECT p.id INTO uid FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE p.role='coach' AND lower(u.email)=addr AND u.email_confirmed_at IS NOT NULL;
   IF uid IS NULL THEN RAISE EXCEPTION 'Trainer must verify email before assignments'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=p_client_id) THEN RAISE EXCEPTION 'Unknown client'; END IF;
   IF p_action='assign' THEN
     INSERT INTO public.coach_client_assignments(coach_id,client_id) VALUES(uid,p_client_id) ON CONFLICT DO NOTHING;
   ELSE
     DELETE FROM public.coach_client_assignments WHERE coach_id=uid AND client_id=p_client_id;
   END IF;
   RETURN true;
 END IF;
 RAISE EXCEPTION 'Unknown action';
END;$$;
REVOKE ALL ON FUNCTION public.pf_manage_trainer(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pf_manage_trainer(text,text,text) TO authenticated;
-- Head coach can review assignments. Other trainers still see only their own rows.
CREATE POLICY "head assignment overview" ON public.coach_client_assignments FOR SELECT TO authenticated
 USING (public.pf_head_coach());
COMMIT;
