import { createAdminHandler } from './handler.mjs';
import { env, base, key, rpc, authenticate } from '../_shared/backend.ts';
const origins = env('ADMIN_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
Deno.serve(createAdminHandler({ origins, enabled: env('ADMIN_ENABLED') === 'true' && !!base && !!key && origins.length > 0,
  authenticate,
  consumeRate: (scope: string) => rpc('archive_consume_rate', { p_scope: scope }),
  execute: (identity: { id: string; sessionId: string }, action: string, input: object) => action === 'audit' ? rpc('archive_list_audit', {
    p_actor: identity.id, p_session: identity.sessionId, p_input: input,
  }) : rpc('archive_admin_action', {
    p_actor: identity.id, p_session: identity.sessionId, p_action: action, p_input: input,
  }),
}));
