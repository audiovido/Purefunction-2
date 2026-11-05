-- Roll back ONLY after app is rolled back. BACK UP first; this restores prior shared-assignment access.
-- The migration preflight refused multi-assigned clients, so existing assignments were not removed.
BEGIN;
DROP TRIGGER IF EXISTS basic_owner_on_insert ON public.clients;
DROP TRIGGER IF EXISTS basic_owner_on_update ON public.clients;
DROP FUNCTION IF EXISTS private.basic_set_client_owner();
DROP FUNCTION IF EXISTS private.basic_owner_immutable();
DROP POLICY IF EXISTS "clients coach insert" ON public.clients;
CREATE POLICY "clients coach insert" ON public.clients FOR INSERT TO authenticated WITH CHECK(private.is_coach());
CREATE POLICY "head assignment overview" ON public.coach_client_assignments FOR SELECT TO authenticated USING(public.pf_head_coach());
CREATE OR REPLACE FUNCTION private.can_manage_client(p_client_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.coach_client_assignments a JOIN public.profiles p ON p.id=a.coach_id
  WHERE a.client_id=p_client_id AND a.coach_id=auth.uid() AND p.role='coach');
$$;
CREATE OR REPLACE FUNCTION private.is_coach() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='coach');
$$;
CREATE OR REPLACE FUNCTION private.assign_new_client() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='coach') THEN
   INSERT INTO public.coach_client_assignments(coach_id,client_id) VALUES(auth.uid(),new.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN new;
END;$$;
-- Exact p5 assignment management function, restored for full-feature rollout after rollback.
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
DROP INDEX IF EXISTS public.basic_one_coach_per_client;
DROP INDEX IF EXISTS public.clients_basic_unique_email;
DROP INDEX IF EXISTS public.clients_basic_coach_idx;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_basic_coach_fk;
ALTER TABLE public.clients DROP COLUMN IF EXISTS coach_id;
DROP FUNCTION IF EXISTS private.basic_is_coach();
COMMIT;
