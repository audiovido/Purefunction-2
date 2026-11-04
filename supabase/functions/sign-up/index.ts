// Pure Function 2 sign-up (deployed as Edge Function "sign-up", verify_jwt = false).
// Only the coach's email or an invited client's email may sign up.
// A one-time verification link is sent via Resend before any login is possible.
// Never auto-confirm a new user's email.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { APP_URL, layout, sendEmail } from '../_shared/email.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' });
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim().slice(0, 80);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(400, { error: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: 'Password must be at least 8 characters.' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: role, error: roleError } = await admin.rpc('signup_role', { p_email: email });
  if (roleError) return json(500, { error: 'Could not check this email. Try again.' });
  if (!role) {
    return json(403, {
      error: 'This email isn’t on the list yet. Ask your coach to add your email first, then create your account.'
    });
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { display_name: name } }
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return json(409, { error: 'An account with this email already exists. Sign in instead.' });
    }
    return json(400, { error: 'Could not start verification. Try again.' });
  }
  const token = data.properties?.hashed_token;
  const userId = data.user?.id;
  if (!token || !userId) return json(503, { error: 'Verification could not be prepared.' });
  const link = new URL(APP_URL);
  link.searchParams.set('verify', token);
  const sent = await sendEmail(
    email,
    'Verify your Pure Function email',
    layout('Verify your email', ['Please verify that you own this email before signing in.'], {
      text: 'Verify email', url: link.toString()
    })
  );
  if (!sent.ok) {
    // Roll back this unconfirmed registration so the person can retry.
    await admin.auth.admin.deleteUser(userId);
    return json(sent.status, { error: sent.error });
  }
  return json(200, { ok: true, verificationRequired: true, role });
});
