-- NEEDS ARMIN'S EXPLICIT OK before execution, including on staging.
-- Review-only: no migration, no writes, no emails. Run separately from the migration.
-- Requires the existing T8b + p5 schema. Missing prerequisites abort safely.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

-- 1. Prerequisites and whether Basic has already been applied.
SELECT
  to_regclass('public.clients') IS NOT NULL AS has_clients,
  to_regclass('public.coach_client_assignments') IS NOT NULL AS has_assignments,
  to_regclass('private.coach_allowlist') IS NOT NULL AS has_allowlist,
  to_regprocedure('public.pf_head_coach()') IS NOT NULL AS has_head_rpc,
  to_regprocedure('private.assign_new_client()') IS NOT NULL AS has_assignment_trigger_function,
  to_regprocedure('private.can_manage_client(text)') IS NOT NULL AS has_owner_helper,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='clients' AND column_name='coach_id')
    AS basic_owner_column_already_exists;

-- 2. Counts only: no names, emails, workout content or auth tokens in this output.
WITH owner_counts AS (
  SELECT c.id, count(a.coach_id) AS owners
  FROM public.clients c LEFT JOIN public.coach_client_assignments a ON a.client_id=c.id
  GROUP BY c.id
), invalid_owners AS (
  SELECT DISTINCT a.coach_id
  FROM public.coach_client_assignments a
  LEFT JOIN public.profiles p ON p.id=a.coach_id
  LEFT JOIN auth.users u ON u.id=p.id
  LEFT JOIN private.coach_allowlist l ON l.email=lower(u.email)
  WHERE p.role IS DISTINCT FROM 'coach' OR u.email_confirmed_at IS NULL OR l.email IS NULL
), duplicate_emails AS (
  SELECT lower(email) FROM public.clients WHERE email<>''
  GROUP BY lower(email) HAVING count(*)>1
), eligible_head AS (
  SELECT p.id FROM private.settings s
  JOIN auth.users u ON lower(u.email)=lower(s.value)
  JOIN public.profiles p ON p.id=u.id AND p.role='coach'
  JOIN private.coach_allowlist l ON l.email=lower(u.email)
  WHERE s.key='coach_email' AND u.email_confirmed_at IS NOT NULL
)
SELECT
  (SELECT count(*) FROM owner_counts) AS total_clients,
  (SELECT count(*) FROM owner_counts WHERE owners=0) AS clients_without_owner,
  (SELECT count(*) FROM owner_counts WHERE owners>1) AS clients_with_multiple_owners,
  (SELECT count(*) FROM invalid_owners) AS invalid_unverified_or_unallowlisted_owners,
  (SELECT count(*) FROM duplicate_emails) AS duplicate_nonempty_email_groups,
  (SELECT count(*) FROM eligible_head) AS eligible_head_coaches;
-- Proceed only if all four blocker counts are zero and eligible_head_coaches=1.

-- 3. Verify RLS remains enabled and inspect every policy; extra permissive policies
-- can widen access even if this migration's policies are correct. Compare with T8b/p5.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN (
  'clients','profiles','workouts','coach_client_assignments','coach_notes_secure','coach_messages',
  'food_entries','food_items','favorite_meals','posture_reviews_secure','posture_public_reports'))
   OR (n.nspname='storage' AND c.relname='objects')
ORDER BY n.nspname,c.relname;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN (
  'clients','profiles','workouts','coach_client_assignments','coach_notes_secure','coach_messages',
  'food_entries','food_items','favorite_meals','posture_reviews_secure','posture_public_reports'))
   OR (schemaname='storage' AND tablename='objects')
ORDER BY schemaname,tablename,policyname;

-- 4. Ensure creator assignment and data guards are actually installed and enabled.
SELECT t.tgname,c.relname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='clients' AND NOT t.tgisinternal
ORDER BY t.tgname;
ROLLBACK;
