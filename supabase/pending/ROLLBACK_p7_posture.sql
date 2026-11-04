-- WARNING: export dated posture reviews and public reports before rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.pf_publish_posture_review(text,text);
DROP TABLE IF EXISTS public.posture_public_reports;
DROP TABLE IF EXISTS public.posture_reviews_secure CASCADE;
DROP FUNCTION IF EXISTS private.guard_posture_frozen();
COMMIT;
