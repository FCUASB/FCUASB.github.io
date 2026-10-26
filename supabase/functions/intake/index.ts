import { createIntakeHandler } from './handler.mjs';

const env = (name: string) => Deno.env.get(name) || '';
const origins = env('INTAKE_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
const base = env('SUPABASE_URL');
const key = env('SUPABASE_SERVICE_ROLE_KEY');
const challengeSecret = env('TURNSTILE_SECRET_KEY');
const hostnames = new Set(origins.map(value => new URL(value).hostname));
// All credentials stay in Edge secrets; default deployment cannot accept writes.
const enabled = env('INTAKE_ENABLED') === 'true' && !!base && !!key && !!challengeSecret && origins.length > 0;
async function rpc(name: string, args: object = {}) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Database request failed');
  return response.json();
}
Deno.serve(createIntakeHandler({ origins, enabled,
  maxUploadBytes: Number(env('MAX_UPLOAD_BYTES') || 50 * 1048576),
  consumeRate: (scope: string) => rpc('archive_consume_rate', { p_scope: scope }),
  async verifyChallenge(token: string, origin: string | null) {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: challengeSecret, response: token }),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.success === true && data.action === 'memory-submit'
      && hostnames.has(data.hostname) && (!origin || data.hostname === new URL(origin).hostname);
  },
  saveMemory: (record: object) => rpc('archive_receive_memory', { p_record: record }),
  listMemories: (before: string | null, beforeId: string | null) => rpc('archive_list_memories', { p_before: before, p_before_id: beforeId }),
}));
