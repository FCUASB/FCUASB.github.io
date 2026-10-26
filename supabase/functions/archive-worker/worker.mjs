import { ArchiveError } from './drive.mjs';
const CHUNK = 4 * 1024 * 1024;
export async function runArchiveTick({ claim, work, getDrive, readSource, rootFolderId, maxChunks = 4 }) {
  const job = await claim(); if (!job) return { state: 'idle' };
  const change = (action, data = {}) => work(action, job.jobId, job.token, data);
  try {
    const drive = await getDrive();
    let folderId = job.folderId;
    if (!folderId) folderId = (await change('folder', { fileId: await drive.generateId() })).fileId;
    await drive.ensureFolder(folderId, rootFolderId, job.submissionId, job.createdAt);
    let fileId = job.driveFileId;
    if (!fileId) fileId = (await change('reserve_file', { fileId: await drive.generateId() })).fileId;
    const manifest = job.kind === 'manifest' ? new TextEncoder().encode(JSON.stringify(job.manifest, null, 2) + '\n') : null;
    const size = manifest?.byteLength ?? job.size;
    const mimeType = manifest ? 'application/json' : job.mimeType;
    if (!Number.isSafeInteger(size) || size <= 0) throw new ArchiveError('FILE_MISMATCH');
    let upload = await drive.begin({ ...job, fileId, folderId, mimeType, size });
    if (upload.fresh) await change('session', { url: upload.sessionUrl, revision: job.revision });
    const sessionUrl = upload.sessionUrl;
    let offset = upload.offset;
    for (let index = 0; !upload.done && index < maxChunks; index++) {
      // Renew/check lease before each external write; stale workers cannot checkpoint.
      await change('progress', { offset });
      const end = Math.min(size, offset + CHUNK);
      const bytes = manifest ? manifest.slice(offset, end) : await readSource(job.objectPath, offset, end - 1);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== end - offset) throw new ArchiveError('FILE_MISMATCH');
      upload = await drive.chunk(sessionUrl, bytes, offset, size);
      offset = upload.offset;
      if (!upload.done) await change('progress', { offset });
    }
    if (!upload.done) { await change('yield'); return { state: 'pending' }; }
    await drive.verify(fileId, folderId, job, size);
    await change('complete', { revision: job.revision });
    return { state: 'completed' };
  } catch (error) {
    const code = error instanceof ArchiveError ? error.code : 'REMOTE_ERROR';
    try { await change('fail', { code }); } catch { /* Lease may already belong to another worker. */ }
    return { state: 'failed', code };
  }
}
async function sameSecret(actual, expected) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b); let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export function createWorkerHandler({ enabled = false, secret, tick }) {
  return async request => {
    const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!enabled || typeof secret !== 'string' || secret.length < 32) return reply(503, { error: 'WORKER_NOT_READY' });
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    const bearer = request.headers.get('authorization') || '';
    if (!await sameSecret(bearer, 'Bearer ' + secret)) return reply(401, { error: 'UNAUTHORIZED' });
    try { return reply(200, await tick()); } catch { return reply(503, { error: 'WORKER_UNAVAILABLE' }); }
  };
}
