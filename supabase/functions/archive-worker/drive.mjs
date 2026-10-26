export class ArchiveError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const ID = /^[A-Za-z0-9_-]{10,200}$/;
export function validateDriveSession(value) {
  try { const url = new URL(value); if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || !/^\/upload\/drive\/v3\/files(?:\/[A-Za-z0-9_-]{10,200})?$/.test(url.pathname) || !url.searchParams.get('upload_id')) throw Error(); return url.href; }
  catch { throw new ArchiveError('REMOTE_ERROR'); }
}
async function checked(response, { missing = false } = {}) {
  if (missing && response.status === 404) return null;
  if ([401, 403].includes(response.status)) {
    let data; try { data = await response.json(); } catch {}
    const reason = data?.error?.errors?.[0]?.reason;
    throw new ArchiveError(['storageQuotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'].includes(reason) ? 'DRIVE_QUOTA' : 'AUTH_REQUIRED');
  }
  if (response.status === 429) throw new ArchiveError('DRIVE_QUOTA');
  if (!response.ok) throw new ArchiveError('REMOTE_ERROR');
  return response.json();
}
export async function refreshDriveToken({ fetch: send = fetch, clientId, clientSecret, refreshToken }) {
  const response = await send('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  if ([400, 401].includes(response.status)) throw new ArchiveError('AUTH_REQUIRED');
  const data = await checked(response);
  if (!data?.access_token) throw new ArchiveError('AUTH_REQUIRED');
  return data.access_token;
}
export function createDriveClient({ token, fetch: send = fetch }) {
  const headers = { Authorization: `Bearer ${token}` };
  const sendRequest = (url, options = {}) => send(url, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(25000) });
  async function getFile(id) {
    if (!ID.test(id)) throw new ArchiveError('REMOTE_ERROR');
    return checked(await sendRequest(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,mimeType,size,parents,appProperties,trashed`), { missing: true });
  }
  const matches = (file, folder, properties, size) => file && !file.trashed && file.parents?.includes(folder)
    && Object.entries(properties).every(([key, value]) => file.appProperties?.[key] === value) && (size == null || Number(file.size) === size);
  return {
    async generateId() {
      const data = await checked(await sendRequest('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files'));
      const id = data?.ids?.[0]; if (!ID.test(id)) throw new ArchiveError('REMOTE_ERROR'); return id;
    },
    async ensureFolder(id, parent, submissionId, createdAt) {
      if (!ID.test(parent)) throw new ArchiveError('REMOTE_ERROR');
      const properties = { archiveSubmission: submissionId };
      let folder = await getFile(id);
      if (!folder) {
        const response = await sendRequest('https://www.googleapis.com/drive/v3/files?fields=id,mimeType,parents,appProperties,trashed', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name: `${createdAt.slice(0, 10)}_${submissionId}`, mimeType: 'application/vnd.google-apps.folder', parents: [parent], appProperties: properties }),
        });
        folder = response.status === 409 ? await getFile(id) : await checked(response);
      }
      if (!matches(folder, parent, properties) || folder.mimeType !== 'application/vnd.google-apps.folder') throw new ArchiveError('FILE_MISMATCH');
      return folder.id;
    },
    async begin({ fileId, folderId, submissionId, attachmentId, revision, kind, mimeType, size, sessionUrl }) {
      const properties = { archiveSubmission: submissionId, archiveKind: kind, ...(kind === 'attachment' ? { archiveAttachment: attachmentId } : { archiveRevision: String(revision) }) };
      const file = await getFile(fileId);
      if (file && matches(file, folderId, properties, size)) return { done: true, offset: size };
      if (file && kind === 'attachment') throw new ArchiveError('FILE_MISMATCH');
      if (file && !matches(file, folderId, { archiveSubmission: submissionId, archiveKind: kind })) throw new ArchiveError('FILE_MISMATCH');
      if (sessionUrl) {
        const response = await sendRequest(validateDriveSession(sessionUrl), { method: 'PUT', headers: { 'Content-Length': '0', 'Content-Range': `bytes */${size}` } });
        if (response.status === 308) {
          const range = response.headers.get('range'); const offset = range ? Number(/^bytes=0-(\d+)$/.exec(range)?.[1]) + 1 : 0;
          if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) throw new ArchiveError('FILE_MISMATCH');
          return { sessionUrl, offset, done: false };
        }
        if (response.ok) {
          const completed = await getFile(fileId); if (matches(completed, folderId, properties, size)) return { done: true, offset: size };
          throw new ArchiveError('FILE_MISMATCH');
        }
        if (![404, 410].includes(response.status)) await checked(response);
      }
      const metadata = { ...(file ? {} : { id: fileId, parents: [folderId] }),
        name: kind === 'manifest' ? 'submission.json' : `${attachmentId}.${mimeType.split('/')[1].replace(/[^a-z0-9]/gi, '') || 'bin'}`,
        mimeType, appProperties: properties };
      const endpoint = `https://www.googleapis.com/upload/drive/v3/files${file ? '/' + fileId : ''}?uploadType=resumable&fields=id,size,parents,appProperties,trashed`;
      const response = await sendRequest(endpoint, { method: file ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(size) }, body: JSON.stringify(metadata) });
      if (!response.ok) await checked(response);
      const next = validateDriveSession(response.headers.get('location'));
      return { sessionUrl: next, offset: 0, done: false, fresh: true };
    },
    async chunk(sessionUrl, bytes, offset, size) {
      const response = await sendRequest(validateDriveSession(sessionUrl), { method: 'PUT', body: bytes,
        headers: { 'Content-Length': String(bytes.byteLength), 'Content-Range': `bytes ${offset}-${offset + bytes.byteLength - 1}/${size}` } });
      if (response.status === 308) {
        const next = Number(/^bytes=0-(\d+)$/.exec(response.headers.get('range') || '')?.[1]) + 1;
        if (!Number.isSafeInteger(next) || next <= offset || next > offset + bytes.byteLength || next > size) throw new ArchiveError('FILE_MISMATCH');
        return { offset: next, done: false };
      }
      if (!response.ok) await checked(response);
      if (![200, 201].includes(response.status) || offset + bytes.byteLength !== size) throw new ArchiveError('FILE_MISMATCH');
      return { offset: size, done: true };
    },
    async verify(fileId, folderId, job, size) {
      const properties = { archiveSubmission: job.submissionId, archiveKind: job.kind,
        ...(job.kind === 'attachment' ? { archiveAttachment: job.attachmentId } : { archiveRevision: String(job.revision) }) };
      if (!matches(await getFile(fileId), folderId, properties, size)) throw new ArchiveError('FILE_MISMATCH');
    },
  };
}
