import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

// Execute the real Edge handler with stubbed network dependencies, including caller RLS.
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
  .split('\n').filter(line => !line.startsWith('import ')).join('\n');
const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;
function setup({ uid = 'coach-a', role = 'coach', owner = 'coach-a', denied = false } = {}) {
  let handler!: (req: Request) => Promise<Response>;
  const sendEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
  const callerFrom = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: denied ? null : { id: 'client-a', email: 'client@example.com', data: { name: 'Client A' }, coach_id: owner },
    error: denied ? { message: 'Access denied' } : null
  }) }) }) }));
  const adminFrom = vi.fn((table: string) => {
    if (table !== 'profiles') throw Error('Service role must never read clients');
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role, display_name: 'Coach A' } }) }) }) };
  });
  const createClient = vi.fn((_url: string, key: string) => key === 'service' ? {
    auth: { getUser: async () => ({ data: { user: uid ? { id: uid } : null } }) }, from: adminFrom
  } : { from: callerFrom });
  const env: Record<string, string> = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon' };
  new Function('Deno', 'createClient', 'APP_URL', 'cors', 'json', 'layout', 'sendEmail', code)(
    { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient, 'https://example.com/', {}, (status: number, body: unknown) => Response.json(body, { status }),
    () => '<html>Invitation</html>', sendEmail
  );
  const request = (method = 'POST') => handler(new Request('https://example.com/send-invite', {
    method, headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ clientId: 'client-a' }) } : {})
  }));
  return { request, sendEmail, createClient, callerFrom };
}

describe('send-invite owner authorization', () => {
  it('reads the client with caller RLS and emails only the owner’s client', async () => {
    const s = setup();
    expect((await s.request()).status).toBe(200);
    expect(s.createClient).toHaveBeenLastCalledWith('https://example.supabase.co', 'anon', {
      global: { headers: { Authorization: 'Bearer user-token' } }, auth: { persistSession: false }
    });
    expect(s.callerFrom).toHaveBeenCalledWith('clients');
    expect(s.sendEmail).toHaveBeenCalledTimes(1);
    expect(s.sendEmail.mock.calls[0][0]).toBe('client@example.com');
  });
  it.each([{ owner: 'coach-b' }, { denied: true }, { role: 'client' }])('rejects foreign or RLS-denied access: %j', async options => {
    const s = setup(options);
    expect((await s.request()).status).toBe(403);
    expect(s.sendEmail).not.toHaveBeenCalled();
  });
  it('rejects missing authentication before sending', async () => {
    const s = setup({ uid: '' });
    expect((await s.request()).status).toBe(401);
    expect(s.sendEmail).not.toHaveBeenCalled();
  });
  it('handles preflight and rejects unsupported methods without sending', async () => {
    const s = setup();
    expect((await s.request('OPTIONS')).status).toBe(200);
    expect((await s.request('GET')).status).toBe(405);
    expect(s.createClient).not.toHaveBeenCalled();
    expect(s.sendEmail).not.toHaveBeenCalled();
  });
});
