import { boundedJSON, IntakeError } from '../intake/handler.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['audit', 'profile', 'search', 'contacts', 'export', 'members', 'set_role', 'edit', 'visibility', 'attachment_visibility', 'archive_status', 'retry_archive']);
export function validateAdminInput(action, raw) {
  if (!ACTIONS.has(action) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new IntakeError(400, 'INVALID_ACTION');
  // Copy allowlisted fields only; callers cannot choose actor, session, or role claims.
  const input = {};
  if (['contacts', 'edit', 'visibility', 'attachment_visibility', 'retry_archive'].includes(action)) {
    if (!UUID.test(raw.id)) throw new IntakeError(400, 'INVALID_ID');
    input.id = raw.id;
  }
  if (action === 'audit') {
    for (const field of ['actorId', 'targetId']) {
      if (raw[field]) { if (!UUID.test(raw[field])) throw new IntakeError(400, 'INVALID_ID'); input[field] = raw[field]; }
    }
    if (raw.action) {
      if (typeof raw.action !== 'string' || !/^[a-z][a-z0-9_.]{0,79}$/.test(raw.action)) throw new IntakeError(400, 'INVALID_ACTION');
      input.action = raw.action;
    }
  }
  if (['search', 'export', 'audit'].includes(action)) {
    if (raw.query != null && (typeof raw.query !== 'string' || raw.query.length > 200)) throw new IntakeError(400, 'INVALID_QUERY');
    if (raw.filter != null && !['all', 'active', 'deleted', 'upload_failed', 'archive_failed'].includes(raw.filter)) throw new IntakeError(400, 'INVALID_FILTER');
    input.query = raw.query || ''; input.filter = raw.filter || 'all';
    if (raw.before != null || raw.beforeId != null) {
      if (typeof raw.before !== 'string' || !Number.isFinite(Date.parse(raw.before)) || !UUID.test(raw.beforeId)) throw new IntakeError(400, 'INVALID_CURSOR');
      input.before = raw.before; input.beforeId = raw.beforeId;
    }
  }
  if (['edit', 'visibility'].includes(action)) {
    if (typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) throw new IntakeError(400, 'VERSION_REQUIRED');
    input.updatedAt = raw.updatedAt;
  }
  if (action === 'edit') {
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 200 || typeof raw.body !== 'string' || raw.body.length > 5000) throw new IntakeError(400, 'INVALID_CONTENT');
    if (raw.year != null && (!Number.isInteger(raw.year) || raw.year < 1977 || raw.year > new Date().getUTCFullYear())) throw new IntakeError(400, 'INVALID_YEAR');
    input.name = raw.name.trim(); input.body = raw.body.trim(); input.year = raw.year ?? null;
  }
  if (['visibility', 'attachment_visibility'].includes(action)) {
    if (typeof raw.deleted !== 'boolean') throw new IntakeError(400, 'INVALID_STATE');
    input.deleted = raw.deleted;
  }
  if (action === 'set_role') {
    if (!UUID.test(raw.userId) || !['system_admin', 'content_admin', 'data_curator'].includes(raw.role) || typeof raw.active !== 'boolean') throw new IntakeError(400, 'INVALID_ROLE');
    input.userId = raw.userId; input.role = raw.role; input.active = raw.active;
  }
  return input;
}
export function createAdminHandler({ origins, authenticate, execute, consumeRate, enabled = false }) {
  const allowed = new Set(origins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !allowed.has(origin)) return reply(403, { error: 'ORIGIN_DENIED' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    if (!enabled) return reply(503, { error: 'ADMIN_NOT_READY' });
    try {
      const bearer = request.headers.get('authorization') || '';
      if (!/^Bearer [^\s]+$/.test(bearer)) throw new IntakeError(401, 'LOGIN_REQUIRED');
      const identity = await authenticate(bearer.slice(7));
      if (!identity || !UUID.test(identity.id) || !UUID.test(identity.sessionId)) throw new IntakeError(401, 'LOGIN_REQUIRED');
      if (typeof consumeRate !== 'function') throw new Error('Rate limiter missing');
      if (!await consumeRate('admin')) throw new IntakeError(429, 'RATE_LIMITED');
      const body = await boundedJSON(request);
      const input = validateAdminInput(body.action, body.input || {});
      return reply(200, { result: await execute(identity, body.action, input) });
    } catch (error) {
      return reply(error instanceof IntakeError ? error.status : 503,
        { error: error instanceof IntakeError ? error.code : 'SERVICE_UNAVAILABLE' });
    }
  };
}
