-- NEEDS ARMIN'S OK. Do not execute without explicit approval and database backup.
-- Enables 3 verification re-sends per rolling hour per invited, unconfirmed email.
-- Only the service role may call the function. No public account-existence oracle.
CREATE TABLE IF NOT EXISTS public.signup_verification_resends (
  email_digest text PRIMARY KEY,
  attempts timestamptz[] NOT NULL DEFAULT '{}'
);
REVOKE ALL ON TABLE public.signup_verification_resends FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_existing_signup_account(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(trim(p_email)));
$$;
REVOKE ALL ON FUNCTION public.is_existing_signup_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_existing_signup_account(text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_signup_verification(p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  addr text := lower(trim(p_email));
  digest text;
  recent timestamptz[];
BEGIN
  IF addr IS NULL OR char_length(addr) > 254 OR addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN false;
  END IF;
  -- Even a service-role call must not create a link for missing/confirmed accounts.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(u.email) = addr AND u.email_confirmed_at IS NULL
  ) THEN RETURN false; END IF;
  digest := encode(pg_catalog.sha256(pg_catalog.convert_to(addr, 'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(digest, 0));
  SELECT coalesce(array_agg(t) FILTER (WHERE t > now() - interval '1 hour'), ARRAY[]::timestamptz[])
    INTO recent
    FROM public.signup_verification_resends s,
         unnest(s.attempts) AS t
   WHERE s.email_digest = digest;
  recent := coalesce(recent, ARRAY[]::timestamptz[]);
  IF coalesce(array_length(recent, 1), 0) >= 3 THEN RETURN false; END IF;
  INSERT INTO public.signup_verification_resends (email_digest, attempts)
    VALUES (digest, array_append(recent, now()))
    ON CONFLICT (email_digest) DO UPDATE SET attempts = excluded.attempts;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_signup_verification(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_signup_verification(text) TO service_role;
