import { boundedJSON, IntakeError } from '../intake/handler.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeMime = value => /^(image\/(jpeg|png|webp|gif|avif|heic|heif)|video\/(mp4|webm|quicktime|mpeg))$/.test(value || '');
export function createMediaHandler({ origins, enabled = false, consumeRate, uploadAction, signUpload, inspectObject,
  publicMedia, authenticate, adminMedia, readObject }) {
  const allowed = new Set(origins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Cache-Control': 'no-store, max-age=0', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, range',
      'Access-Control-Expose-Headers': 'content-range, accept-ranges, content-length, content-disposition', 'Content-Security-Policy': "sandbox; default-src 'none'" };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    if (origin && !allowed.has(origin)) return reply(403, { error: 'ORIGIN_DENIED' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!enabled) return reply(503, { error: 'MEDIA_NOT_READY' });
    try {
      if (request.method === 'POST') {
        if (!await consumeRate('upload_ticket')) throw new IntakeError(429, 'RATE_LIMITED');
        const input = await boundedJSON(request, 4096);
        if (!UUID.test(input.id) || !UUID.test(input.key) || !['list', 'ticket', 'complete', 'fail'].includes(input.action)) throw new IntakeError(400, 'INVALID_INPUT');
        const object = await uploadAction(input.key, input.id, input.action === 'complete' ? 'ticket' : input.action);
        if (input.action === 'list') return reply(200, { attachments: object });
        if (!object) throw new IntakeError(404, 'NOT_FOUND');
        if (input.action === 'ticket') return reply(200, { url: await signUpload(object.path) });
        if (input.action === 'complete') {
          const metadata = await inspectObject(object.path);
          if (!metadata || metadata.size !== object.size || metadata.mimeType !== object.mimeType || !safeMime(metadata.mimeType)) throw new IntakeError(400, 'FILE_MISMATCH');
          await uploadAction(input.key, input.id, 'complete', metadata.size, metadata.mimeType);
        }
        return reply(200, { status: input.action === 'complete' ? 'ready' : 'failed' });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      const id = new URL(request.url).pathname.split('/').at(-1);
      if (!UUID.test(id)) throw new IntakeError(404, 'NOT_FOUND');
      const bearer = request.headers.get('authorization');
      let metadata, download = false;
      if (bearer) {
        if (!/^Bearer [^\s]+$/.test(bearer)) throw new IntakeError(401, 'LOGIN_REQUIRED');
        const identity = await authenticate(bearer.slice(7));
        if (!identity) throw new IntakeError(401, 'LOGIN_REQUIRED');
        metadata = await adminMedia(identity, id); download = true;
      } else metadata = await publicMedia(id);
      if (!metadata || !safeMime(metadata.mimeType)) throw new IntakeError(404, 'NOT_FOUND');
      const range = request.headers.get('range');
      if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) throw new IntakeError(416, 'INVALID_RANGE');
      const upstream = await readObject(metadata.path, request.method, range);
      if (![200, 206, 416].includes(upstream.status)) throw new IntakeError(404, 'NOT_FOUND');
      for (const name of ['content-range', 'accept-ranges', 'content-length']) if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
      headers['Content-Type'] = metadata.mimeType;
      headers['Content-Disposition'] = download ? `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename || id).replaceAll("'", '%27')}` : 'inline';
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return reply(error instanceof IntakeError ? error.status : 503, { error: error instanceof IntakeError ? error.code : 'SERVICE_UNAVAILABLE' });
    }
  };
}
