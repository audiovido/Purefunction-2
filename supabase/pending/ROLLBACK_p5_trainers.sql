-- Roll back only p5 additions. Keep T8b assignments and existing trainer accounts intact.
BEGIN;
DROP POLICY IF EXISTS "head assignment overview" ON public.coach_client_assignments;
DROP FUNCTION IF EXISTS public.pf_manage_trainer(text,text,text);
DROP FUNCTION IF EXISTS public.pf_list_trainers();
DROP FUNCTION IF EXISTS public.pf_trainer_is_allowed(text);
DROP FUNCTION IF EXISTS public.pf_head_coach();
COMMIT;
