import { createVisitorHandler } from './handler.mjs';
import { env, base, key, rpc } from '../_shared/backend.ts';

const origins = env('INTAKE_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
const challengeSecret = env('TURNSTILE_SECRET_KEY');
const hostnames = new Set(origins.map(value => new URL(value).hostname));
// Default deployment cannot accept writes until VISITOR_ENABLED is set with the shared intake secrets.
const enabled = env('VISITOR_ENABLED') === 'true' && !!base && !!key && !!challengeSecret && origins.length > 0;
Deno.serve(createVisitorHandler({ origins, enabled,
  consumeRate: (scope: string) => rpc('archive_consume_rate', { p_scope: scope }),
  async verifyChallenge(token: string, origin: string | null) {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: challengeSecret, response: token }),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.success === true && data.action === 'visitor-submit'
      && hostnames.has(data.hostname) && (!origin || data.hostname === new URL(origin).hostname);
  },
  saveConcert: (record: object) => rpc('archive_visitor_concert', { p_record: record }),
  saveContribution: (record: object) => rpc('archive_visitor_contribution', { p_record: record }),
}));
