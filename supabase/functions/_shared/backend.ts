import { IntakeError } from '../intake/handler.mjs';
export const env = (name: string) => Deno.env.get(name) || '';
export const base = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
export const backendHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
export async function rpc(name: string, args: object = {}) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: backendHeaders,
    body: JSON.stringify(args), signal: AbortSignal.timeout(15000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok) {
    const mapping: Record<string, [number, string]> = { '42501': [403, 'ACCESS_DENIED'], '40001': [409, 'EDIT_CONFLICT'], P0002: [404, 'NOT_FOUND'],
      '22023': [400, 'INVALID_CHANGE'], '23514': [400, 'INVALID_CHANGE'], '23503': [400, 'INVALID_CHANGE'] };
    if (mapping[data.code]) throw new IntakeError(...mapping[data.code]);
    throw new Error('Backend unavailable');
  }
  return data;
}
export async function authenticate(token: string) {
  const response = await fetch(`${base}/auth/v1/user`, { headers: { ...backendHeaders, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000), redirect: 'error' });
  if ([401, 403].includes(response.status)) return null;
  if (!response.ok) throw new Error('Auth unavailable');
  const user = await response.json();
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return claims.sub === user.id && /^[0-9a-f-]{36}$/i.test(claims.session_id) ? { id: user.id, sessionId: claims.session_id } : null;
  } catch { return null; }
}
