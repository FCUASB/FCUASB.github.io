import { env, base, key, rpc, backendHeaders } from '../_shared/backend.ts';
import { refreshDriveToken, createDriveClient, ArchiveError } from './drive.mjs';
import { createWorkerHandler, runArchiveTick } from './worker.mjs';
const secret = env('ARCHIVE_WORKER_SECRET'), rootFolderId = env('DRIVE_FOLDER_ID');
const clientId = env('GOOGLE_DRIVE_CLIENT_ID'), clientSecret = env('GOOGLE_DRIVE_CLIENT_SECRET'), refreshToken = env('GOOGLE_DRIVE_REFRESH_TOKEN');
Deno.serve(createWorkerHandler({ secret,
  enabled: env('ARCHIVE_ENABLED') === 'true' && !!base && !!key && !!clientId && !!clientSecret && !!refreshToken && !!rootFolderId,
  tick: () => runArchiveTick({ rootFolderId,
    claim: () => rpc('archive_work', { p_action: 'claim' }),
    work: (action: string, id: string, token: string, data: object) => rpc('archive_work', { p_action: action, p_id: id, p_token: token, p_data: data }),
    async getDrive() { return createDriveClient({ token: await refreshDriveToken({ clientId, clientSecret, refreshToken }) }); },
    async readSource(path: string, start: number, end: number) {
      const object = path.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(`${base}/storage/v1/object/authenticated/submission-media/${object}`, {
        headers: { ...backendHeaders, Range: `bytes=${start}-${end}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
      });
      if (response.status === 404) throw new ArchiveError('SOURCE_MISSING');
      if (![200, 206].includes(response.status) || !response.body) throw new ArchiveError('REMOTE_ERROR');
      if (response.status === 206 && !new RegExp(`^bytes ${start}-${end}/[0-9]+$`).test(response.headers.get('content-range') || '')) throw new ArchiveError('FILE_MISMATCH');
      const maximum = end - start + 1, reader = response.body.getReader();
      const output = new Uint8Array(maximum); let offset = 0;
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break;
          if (offset + value.length > maximum) { await reader.cancel(); throw new ArchiveError('FILE_MISMATCH'); }
          output.set(value, offset); offset += value.length;
        }
      } finally { reader.releaseLock(); }
      if (offset !== maximum) throw new ArchiveError('FILE_MISMATCH'); return output;
    },
  }),
}));
