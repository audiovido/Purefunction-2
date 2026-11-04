-- Roll back only the standalone verification resend throttle. Existing auth unaffected.
REVOKE ALL ON FUNCTION public.reserve_signup_verification(text) FROM service_role;
DROP FUNCTION IF EXISTS public.reserve_signup_verification(text);
REVOKE ALL ON FUNCTION public.is_existing_signup_account(text) FROM service_role;
DROP FUNCTION IF EXISTS public.is_existing_signup_account(text);
DROP TABLE IF EXISTS public.signup_verification_resends;
