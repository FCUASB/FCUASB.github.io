// Runtime-independent intake boundary; tested using Node and served by Deno.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class IntakeError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
function text(value, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new IntakeError(400, 'INVALID_INPUT');
  return value.trim();
}
export function validateMemory(input, maxUploadBytes = 50 * 1048576) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new IntakeError(400, 'INVALID_INPUT');
  if (!UUID.test(input.idempotencyKey)) throw new IntakeError(400, 'INVALID_IDEMPOTENCY_KEY');
  const name = text(input.name, 200, true), body = text(input.body, 5000);
  const email = text(input.email, 254), phone = text(input.phone, 80);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IntakeError(400, 'INVALID_EMAIL');
  const year = input.year == null ? null : input.year;
  if (year !== null && (!Number.isInteger(year) || year < 1977 || year > new Date().getUTCFullYear())) throw new IntakeError(400, 'INVALID_YEAR');
  const month = input.month == null ? null : input.month;
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) throw new IntakeError(400, 'INVALID_MONTH');
  const youtubeId = text(input.youtubeId, 11);
  if (youtubeId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) throw new IntakeError(400, 'INVALID_YOUTUBE');
  const uploads = input.uploads ?? [];
  if (!Array.isArray(uploads) || uploads.length + (youtubeId ? 1 : 0) > 10) throw new IntakeError(400, 'TOO_MANY_ATTACHMENTS');
  const mimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg']);
  const files = uploads.map(file => {
    if (!file || typeof file.mimeType !== 'string' || file.mimeType.length > 200 || !Number.isSafeInteger(file.size) || file.size < 0) throw new IntakeError(400, 'INVALID_FILE');
    const initial_error = !mimeTypes.has(file.mimeType) ? 'UNSUPPORTED_FORMAT' : file.size === 0 ? 'EMPTY_FILE' : file.size > maxUploadBytes ? 'FILE_TOO_LARGE' : null;
    const width = file.width ?? 400, height = file.height ?? 300;
    if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 100000)) throw new IntakeError(400, 'INVALID_DIMENSIONS');
    return { filename: text(file.name, 255, true), mime_type: file.mimeType, size_bytes: file.size, width, height, initial_error };
  });
  if (!body && !youtubeId && !files.length) throw new IntakeError(400, 'EMPTY_SUBMISSION');
  if (input.consent !== true) throw new IntakeError(400, 'CONSENT_REQUIRED');
  return { idempotency_key: input.idempotencyKey, display_name: name, body, memory_year: year,
    phone: phone || null, email: email || null, youtube_id: youtubeId || null, uploads: files,
    context: { month, place: text(input.place, 200), relationship: text(input.relationship, 200) } };
}
export async function boundedJSON(request, maxBytes = 32768) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new IntakeError(415, 'JSON_REQUIRED');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new IntakeError(413, 'PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new IntakeError(400, 'INVALID_JSON');
  let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new IntakeError(413, 'PAYLOAD_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new IntakeError(400, 'INVALID_JSON'); }
}
export function createIntakeHandler({ origins, verifyChallenge, saveMemory, listMemories, consumeRate, maxUploadBytes, enabled = false }) {
  const allowed = new Set(origins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed.has(origin)) return reply(403, { error: 'ORIGIN_DENIED' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'content-type, apikey';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    if (!enabled) return reply(503, { error: 'INTAKE_NOT_READY' });
    try {
      if (typeof consumeRate !== 'function') throw new Error('Rate limiter missing');
      if (!await consumeRate('intake_request')) throw new IntakeError(429, 'RATE_LIMITED');
      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams;
        const before = params.get('before'), beforeId = params.get('beforeId');
        if ((before || beforeId) && (!before || !Number.isFinite(Date.parse(before)) || !UUID.test(beforeId || ''))) throw new IntakeError(400, 'INVALID_CURSOR');
        const records = await listMemories(before, beforeId);
        const last = records.at(-1);
        return reply(200, { records, next: records.length === 100 ? { before: last.createdAt, beforeId: last.id } : null });
      }
      const input = await boundedJSON(request);
      const memory = validateMemory(input, maxUploadBytes);
      const token = text(input.challengeToken, 2048, true);
      if (!await verifyChallenge(token, origin)) throw new IntakeError(403, 'CHALLENGE_FAILED');
      if (!await consumeRate('intake_write')) throw new IntakeError(429, 'RATE_LIMITED');
      const result = await saveMemory(memory);
      // Never echo input/contact data or arbitrary upstream error objects.
      if (!result || !UUID.test(result.id)) throw new Error('Invalid receipt');
      return reply(201, { id: result.id, status: 'received' });
    } catch (error) {
      return reply(error instanceof IntakeError ? error.status : 503,
        { error: error instanceof IntakeError ? error.code : 'SERVICE_UNAVAILABLE' });
    }
  };
}
