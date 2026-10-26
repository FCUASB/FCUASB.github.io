import { createCatalogHandler } from './handler.mjs';
import { env, base, key, rpc, authenticate } from '../_shared/backend.ts';
const origins = env('ADMIN_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
Deno.serve(createCatalogHandler({ origins, enabled: env('CATALOG_ENABLED') === 'true' && !!base && !!key && origins.length > 0,
  authenticate, consumeRate: (scope: string) => rpc('archive_consume_rate', { p_scope: scope }),
  readPublic: () => rpc('archive_catalog_public'),
  execute: (identity: { id: string; sessionId: string }, action: string, input: object) => rpc('archive_catalog_action', {
    p_actor: identity.id, p_session: identity.sessionId, p_action: action, p_input: input,
  }),
}));
