import { boundedJSON, IntakeError } from '../intake/handler.mjs';
import { validateCatalogDocument } from '../../../shared/catalog.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createCatalogHandler({ origins, enabled = false, authenticate, execute, readPublic, consumeRate }) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.includes(origin)) return reply(403, { error: 'ORIGIN_DENIED' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    if (!enabled) return reply(503, { error: 'CATALOG_NOT_READY' });
    try {
      if (request.method === 'GET') {
        if (!await consumeRate('intake_request')) throw new IntakeError(429, 'RATE_LIMITED');
        return reply(200, { result: await readPublic() });
      }
      const bearer = request.headers.get('authorization') || '';
      if (!/^Bearer [^\s]+$/.test(bearer)) throw new IntakeError(401, 'LOGIN_REQUIRED');
      const identity = await authenticate(bearer.slice(7));
      if (!identity || !uuid.test(identity.id) || !uuid.test(identity.sessionId)) throw new IntakeError(401, 'LOGIN_REQUIRED');
      if (!await consumeRate('admin')) throw new IntakeError(429, 'RATE_LIMITED');
      const body = await boundedJSON(request, 98304);
      if (!['list', 'save', 'visibility', 'history'].includes(body.action)) throw new IntakeError(400, 'INVALID_ACTION');
      const input = body.input || {};
      if (!['concert', 'biography', 'memory'].includes(input.kind)) throw new IntakeError(400, 'INVALID_INPUT');
      const clean = { kind: input.kind };
      if (body.action !== 'list') {
        if (typeof input.id !== 'string' || !(input.kind === 'biography' ? input.id === 'main' : /^[1-9]\d{0,15}$/.test(input.id))) throw new IntakeError(400, 'INVALID_ID');
        clean.id = input.id;
      }
      if (['save', 'visibility'].includes(body.action)) {
        if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new IntakeError(400, 'VERSION_REQUIRED');
        clean.revision = input.revision;
        if (body.action === 'save') {
          try { clean.document = validateCatalogDocument(input.kind, input.document); } catch { throw new IntakeError(400, 'INVALID_CONTENT'); }
          if (input.kind !== 'biography' && String(clean.document.id) !== clean.id) throw new IntakeError(400, 'INVALID_ID');
        } else {
          if (!['concert','memory'].includes(input.kind) || typeof input.deleted !== 'boolean') throw new IntakeError(400, 'INVALID_STATE');
          clean.deleted = input.deleted;
        }
      }
      return reply(200, { result: await execute(identity, body.action, clean) });
    } catch (error) {
      return reply(error instanceof IntakeError ? error.status : 503, { error: error instanceof IntakeError ? error.code : 'SERVICE_UNAVAILABLE' });
    }
  };
}
