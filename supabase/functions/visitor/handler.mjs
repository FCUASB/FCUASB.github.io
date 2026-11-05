import { boundedJSON, IntakeError } from '../intake/handler.mjs';
import { validateVisitorConcert, validateSupplement, validateReport, VisitorInputError } from '../../../shared/visitor.mjs';
const validators = { concert: validateVisitorConcert, supplement: validateSupplement, report: validateReport };
// Visitors publish without review; only verified, validated, rate-limited writes reach the database.
export function createVisitorHandler({ origins, enabled = false, verifyChallenge, saveConcert, saveContribution, consumeRate }) {
  const allowed = new Set(origins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed.has(origin)) return reply(403, { error: 'ORIGIN_DENIED' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    if (!enabled) return reply(503, { error: 'VISITOR_NOT_READY' });
    try {
      if (typeof consumeRate !== 'function') throw new Error('Rate limiter missing');
      if (!await consumeRate('intake_request')) throw new IntakeError(429, 'RATE_LIMITED');
      const input = await boundedJSON(request, 65536);
      const validate = validators[input?.type];
      if (!validate) throw new IntakeError(400, 'INVALID_TYPE');
      let record;
      try { record = validate(input.payload); } catch (error) {
        if (error instanceof VisitorInputError) throw new IntakeError(400, error.message);
        throw error;
      }
      const token = typeof input.challengeToken === 'string' ? input.challengeToken : '';
      if (!token || token.length > 2048 || !await verifyChallenge(token, origin)) throw new IntakeError(403, 'CHALLENGE_FAILED');
      if (!await consumeRate('visitor_write')) throw new IntakeError(429, 'RATE_LIMITED');
      const result = input.type === 'concert' ? await saveConcert(record) : await saveContribution(record);
      if (!result || typeof result.id !== 'string' || result.status !== 'received') throw new Error('Invalid receipt');
      return reply(201, { id: result.id, status: 'received' });
    } catch (error) {
      return reply(error instanceof IntakeError ? error.status : 503, { error: error instanceof IntakeError ? error.code : 'SERVICE_UNAVAILABLE' });
    }
  };
}
