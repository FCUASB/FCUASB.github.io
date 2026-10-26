import { createMediaHandler } from './handler.mjs';
import { env, base, key, rpc, backendHeaders, authenticate } from '../_shared/backend.ts';
const origins = env('INTAKE_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
const objectPath = (path: string) => 'submission-media/' + path.split('/').map(encodeURIComponent).join('/');
Deno.serve(createMediaHandler({ origins, enabled: env('MEDIA_ENABLED') === 'true' && !!base && !!key && origins.length > 0,
  consumeRate: (scope: string) => rpc('archive_consume_rate', { p_scope: scope }),
  uploadAction: (key: string, id: string, action: string, size?: number, mime?: string) => rpc('archive_upload_action', { p_key: key, p_id: id, p_action: action, p_size: size ?? null, p_mime: mime ?? null }),
  async signUpload(path: string) {
    const response = await fetch(`${base}/storage/v1/object/upload/sign/${objectPath(path)}`, { method: 'POST', headers: backendHeaders,
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Storage unavailable');
    const data = await response.json(); const url = new URL(`${base}/storage/v1${data.url}`);
    if (url.origin !== new URL(base).origin || !url.searchParams.get('token')) throw new Error('Invalid upload response');
    return url.href;
  },
  async inspectObject(path: string) {
    const response = await fetch(`${base}/storage/v1/object/info/${objectPath(path)}`, { headers: backendHeaders, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const data = await response.json(); return { size: data.size, mimeType: data.content_type };
  },
  publicMedia: (id: string) => rpc('archive_public_media', { p_id: id }), authenticate,
  adminMedia: (identity: { id: string; sessionId: string }, id: string) => rpc('archive_admin_action', { p_actor: identity.id, p_session: identity.sessionId, p_action: 'download_metadata', p_input: { id } }),
  readObject: (path: string, method: string, range: string | null) => fetch(`${base}/storage/v1/object/authenticated/${objectPath(path)}`, {
    method, headers: { ...backendHeaders, ...(range ? { Range: range } : {}) }, redirect: 'error', signal: AbortSignal.timeout(30000),
  }),
}));
