-- NEEDS ARMIN'S OK. Requires applied T8b. Keeps private expert classifications away from clients.
BEGIN;
CREATE TABLE public.posture_reviews_secure (
 client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 assessment_id text NOT NULL,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id,assessment_id)
);
CREATE TABLE public.posture_public_reports (
 client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 assessment_id text NOT NULL,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id,assessment_id)
);
ALTER TABLE public.posture_reviews_secure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posture_public_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.posture_reviews_secure TO authenticated;
GRANT SELECT ON public.posture_public_reports TO authenticated;
CREATE POLICY posture_review_coach_read ON public.posture_reviews_secure FOR SELECT TO authenticated USING(private.can_manage_client(client_id));
CREATE POLICY posture_review_coach_insert ON public.posture_reviews_secure FOR INSERT TO authenticated WITH CHECK(private.can_manage_client(client_id) AND assessment_id='draft');
CREATE POLICY posture_review_coach_edit ON public.posture_reviews_secure FOR UPDATE TO authenticated USING(private.can_manage_client(client_id) AND assessment_id='draft') WITH CHECK(private.can_manage_client(client_id) AND assessment_id='draft');
CREATE POLICY posture_public_read ON public.posture_public_reports FOR SELECT TO authenticated USING(client_id=private.my_client_id() OR private.can_manage_client(client_id));
-- Preserve frozen dated assessments forever, even if an internal function is changed later.
CREATE FUNCTION private.guard_posture_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF old.assessment_id <> 'draft' THEN RAISE EXCEPTION 'Historical posture report is immutable'; END IF;
 RETURN new;
END;$$;
CREATE TRIGGER posture_freeze_guard BEFORE UPDATE OR DELETE ON public.posture_reviews_secure FOR EACH ROW EXECUTE FUNCTION private.guard_posture_frozen();
CREATE FUNCTION public.pf_publish_posture_review(p_client_id text,p_assessment_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc jsonb; clean jsonb; chosen jsonb;
BEGIN
 IF NOT private.can_manage_client(p_client_id) THEN RAISE EXCEPTION 'Not assigned' USING ERRCODE='42501'; END IF;
 IF p_assessment_id IS NULL OR p_assessment_id NOT LIKE 'as-%' OR NOT EXISTS (
   SELECT 1 FROM public.clients c, jsonb_array_elements(coalesce(c.data->'assessments','[]'::jsonb)) a
   WHERE c.id=p_client_id AND a->>'id'=p_assessment_id) THEN
   RAISE EXCEPTION 'Save dated assessment first'; END IF;
 SELECT data INTO doc FROM public.posture_reviews_secure WHERE client_id=p_client_id AND assessment_id='draft';
 IF doc IS NULL OR doc->>'summaryApprovedByCoach' <> 'true' OR trim(coalesce(doc->>'summary',''))='' THEN
  RAISE EXCEPTION 'Coach-approved summary required'; END IF;
 INSERT INTO public.posture_reviews_secure(client_id,assessment_id,data)
 VALUES(p_client_id,p_assessment_id,doc) ON CONFLICT DO NOTHING;
 SELECT data INTO chosen FROM public.posture_reviews_secure WHERE client_id=p_client_id AND assessment_id=p_assessment_id;
 IF chosen->>'summaryApprovedByCoach' <> 'true' THEN RAISE EXCEPTION 'Historical snapshot is not approved'; END IF;
 -- Explicit client whitelist. NEVER include private interpretation, conflicts, reviewer notes, rule internals.
 SELECT coalesce(jsonb_agg(o),'[]'::jsonb) INTO clean FROM jsonb_array_elements(coalesce(chosen->'observations','[]'::jsonb)) o
 WHERE o->>'confirmed'='true';
 INSERT INTO public.posture_public_reports(client_id,assessment_id,data)
 VALUES(p_client_id,p_assessment_id,jsonb_build_object(
  'recordedAt',chosen->>'recordedAt','measurements',coalesce(chosen->'measurements','[]'::jsonb),
  'observations',clean,'summary',chosen->>'summary','summaryApprovedByCoach',true,
  'visualSettings',coalesce(chosen->'visualSettings','{}'::jsonb))) ON CONFLICT DO NOTHING;
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.pf_publish_posture_review(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pf_publish_posture_review(text,text) TO authenticated;
COMMIT;
