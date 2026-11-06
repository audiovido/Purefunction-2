import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
  .split('\n').filter(line => !line.startsWith('import ')).join('\n');
const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;
function setup({ linkError = false, networkError = false, delivery = { ok: true } as { ok: boolean; error?: string; status?: number } } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const sendEmail = vi.fn(async (..._args: unknown[]) => {
    if (networkError) throw Error('Network error containing sensitive user data');
    return delivery;
  });
  const generateLink = vi.fn(async () => ({
    data: linkError ? null : { properties: { hashed_token: 'PRIVATE-RECOVERY-TOKEN' } },
    error: linkError ? { message: 'User not found' } : null
  }));
  const logs = { warn: vi.fn(), info: vi.fn() };
  new Function('Deno', 'createClient', 'APP_URL', 'cors', 'json', 'layout', 'sendEmail', 'console', code)(
    { env: { get: () => 'PRIVATE-KEY' }, serve: (fn: typeof handler) => { handler = fn; } },
    () => ({ auth: { admin: { generateLink } } }), 'https://example.com/app/?source=recovery', {},
    (status: number, body: unknown) => Response.json(body, { status }),
    (_heading: string, _paragraphs: string[], button: { url: string }) => button.url, sendEmail, logs
  );
  const request = (email = 'person@example.com', method = 'POST') => handler(new Request('https://example.com/reset-password', {
    method, headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ email }) } : {})
  }));
  return { request, generateLink, sendEmail, logs };
}

describe('password recovery delivery diagnostics', () => {
  it('sends the one-time link only to the requested address without logging credentials', async () => {
    const s = setup();
    const response = await s.request(' Person@Example.com ');
    expect(await response.json()).toEqual({ ok: true });
    expect(s.generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'person@example.com' });
    expect(s.sendEmail.mock.calls[0][0]).toBe('person@example.com');
    const link = new URL(s.sendEmail.mock.calls[0][2] as string);
    expect(link.searchParams.get('source')).toBe('recovery');
    expect(link.searchParams.get('reset')).toBe('PRIVATE-RECOVERY-TOKEN');
    expect(s.logs.info).toHaveBeenCalledWith(JSON.stringify({ event: 'password_recovery_mail_accepted' }));
    expect(JSON.stringify(s.logs.info.mock.calls)).not.toMatch(/person@|PRIVATE/);
  });
  it.each([
    [{ ok: false, error: 'Email works only to your own address until a domain is verified in Resend.', status: 403 }, 'test_sender_restricted'],
    [{ ok: false, error: 'Email is not set up yet (RESEND_API_KEY missing).', status: 503 }, 'mail_not_configured'],
    [{ ok: false, error: 'Provider error with person@example.com and PRIVATE-KEY', status: 502 }, 'provider_rejected']
  ] as const)('records a safe failure reason and keeps the public response generic', async (delivery, reason) => {
    const s = setup({ delivery });
    const response = await s.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(s.logs.warn).toHaveBeenCalledWith(JSON.stringify({ event: 'password_recovery_failed', reason, status: delivery.status }));
    expect(JSON.stringify(s.logs.warn.mock.calls)).not.toMatch(/person@|PRIVATE|https:/);
  });
  it.each([{ linkError: true }, { networkError: true }])('does not expose account existence or network error contents: %j', async options => {
    const s = setup(options);
    expect(await (await s.request()).json()).toEqual({ ok: true });
    expect(JSON.stringify(s.logs.warn.mock.calls)).not.toMatch(/person@|PRIVATE|User not found|sensitive/);
    if (options.linkError) expect(s.sendEmail).not.toHaveBeenCalled();
  });
  it('rejects invalid addresses and unsupported methods before requesting a link', async () => {
    const s = setup();
    expect((await s.request('not-email')).status).toBe(400);
    expect((await s.request('a'.repeat(250) + '@example.com')).status).toBe(400);
    expect((await s.request('', 'OPTIONS')).status).toBe(200);
    expect((await s.request('', 'GET')).status).toBe(405);
    expect(s.generateLink).not.toHaveBeenCalled();
  });
});
