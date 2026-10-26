// Generated from supabase/functions. Do not edit; run npm run build:edge.
(() => {
  // supabase/functions/intake/handler.mjs
  var IntakeError = class extends Error {
    constructor(status, code) {
      super(code);
      this.status = status;
      this.code = code;
    }
  };

  // supabase/functions/_shared/backend.ts
  var env = (name) => Deno.env.get(name) || "";
  var base = env("SUPABASE_URL");
  var key = env("SUPABASE_SERVICE_ROLE_KEY");
  var backendHeaders = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  async function rpc(name, args = {}) {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: backendHeaders,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15e3),
      redirect: "error"
    });
    const data = await response.json();
    if (!response.ok) {
      const mapping = {
        "42501": [403, "ACCESS_DENIED"],
        "40001": [409, "EDIT_CONFLICT"],
        P0002: [404, "NOT_FOUND"],
        "22023": [400, "INVALID_CHANGE"],
        "23514": [400, "INVALID_CHANGE"],
        "23503": [400, "INVALID_CHANGE"]
      };
      if (mapping[data.code]) throw new IntakeError(...mapping[data.code]);
      throw new Error("Backend unavailable");
    }
    return data;
  }

  // supabase/functions/archive-worker/drive.mjs
  var ArchiveError = class extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  };
  var ID = /^[A-Za-z0-9_-]{10,200}$/;
  function validateDriveSession(value) {
    try {
      const url = new URL(value);
      if (url.origin !== "https://www.googleapis.com" || url.username || url.password || !/^\/upload\/drive\/v3\/files(?:\/[A-Za-z0-9_-]{10,200})?$/.test(url.pathname) || !url.searchParams.get("upload_id")) throw Error();
      return url.href;
    } catch {
      throw new ArchiveError("REMOTE_ERROR");
    }
  }
  async function checked(response, { missing = false } = {}) {
    if (missing && response.status === 404) return null;
    if ([401, 403].includes(response.status)) {
      let data;
      try {
        data = await response.json();
      } catch {
      }
      const reason = data?.error?.errors?.[0]?.reason;
      throw new ArchiveError(["storageQuotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason) ? "DRIVE_QUOTA" : "AUTH_REQUIRED");
    }
    if (response.status === 429) throw new ArchiveError("DRIVE_QUOTA");
    if (!response.ok) throw new ArchiveError("REMOTE_ERROR");
    return response.json();
  }
  async function refreshDriveToken({ fetch: send = fetch, clientId: clientId2, clientSecret: clientSecret2, refreshToken: refreshToken2 }) {
    const response = await send("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15e3),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId2, client_secret: clientSecret2, refresh_token: refreshToken2, grant_type: "refresh_token" })
    });
    if ([400, 401].includes(response.status)) throw new ArchiveError("AUTH_REQUIRED");
    const data = await checked(response);
    if (!data?.access_token) throw new ArchiveError("AUTH_REQUIRED");
    return data.access_token;
  }
  function createDriveClient({ token, fetch: send = fetch }) {
    const headers = { Authorization: `Bearer ${token}` };
    const sendRequest = (url, options = {}) => send(url, { ...options, headers: { ...headers, ...options.headers }, redirect: "error", signal: AbortSignal.timeout(25e3) });
    async function getFile(id) {
      if (!ID.test(id)) throw new ArchiveError("REMOTE_ERROR");
      return checked(await sendRequest(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,mimeType,size,parents,appProperties,trashed`), { missing: true });
    }
    const matches = (file, folder, properties, size) => file && !file.trashed && file.parents?.includes(folder) && Object.entries(properties).every(([key2, value]) => file.appProperties?.[key2] === value) && (size == null || Number(file.size) === size);
    return {
      async generateId() {
        const data = await checked(await sendRequest("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files"));
        const id = data?.ids?.[0];
        if (!ID.test(id)) throw new ArchiveError("REMOTE_ERROR");
        return id;
      },
      async ensureFolder(id, parent, submissionId, createdAt) {
        if (!ID.test(parent)) throw new ArchiveError("REMOTE_ERROR");
        const properties = { archiveSubmission: submissionId };
        let folder = await getFile(id);
        if (!folder) {
          const response = await sendRequest("https://www.googleapis.com/drive/v3/files?fields=id,mimeType,parents,appProperties,trashed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name: `${createdAt.slice(0, 10)}_${submissionId}`, mimeType: "application/vnd.google-apps.folder", parents: [parent], appProperties: properties })
          });
          folder = response.status === 409 ? await getFile(id) : await checked(response);
        }
        if (!matches(folder, parent, properties) || folder.mimeType !== "application/vnd.google-apps.folder") throw new ArchiveError("FILE_MISMATCH");
        return folder.id;
      },
      async begin({ fileId, folderId, submissionId, attachmentId, revision, kind, mimeType, size, sessionUrl }) {
        const properties = { archiveSubmission: submissionId, archiveKind: kind, ...kind === "attachment" ? { archiveAttachment: attachmentId } : { archiveRevision: String(revision) } };
        const file = await getFile(fileId);
        if (file && matches(file, folderId, properties, size)) return { done: true, offset: size };
        if (file && kind === "attachment") throw new ArchiveError("FILE_MISMATCH");
        if (file && !matches(file, folderId, { archiveSubmission: submissionId, archiveKind: kind })) throw new ArchiveError("FILE_MISMATCH");
        if (sessionUrl) {
          const response2 = await sendRequest(validateDriveSession(sessionUrl), { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${size}` } });
          if (response2.status === 308) {
            const range = response2.headers.get("range");
            const offset = range ? Number(/^bytes=0-(\d+)$/.exec(range)?.[1]) + 1 : 0;
            if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) throw new ArchiveError("FILE_MISMATCH");
            return { sessionUrl, offset, done: false };
          }
          if (response2.ok) {
            const completed = await getFile(fileId);
            if (matches(completed, folderId, properties, size)) return { done: true, offset: size };
            throw new ArchiveError("FILE_MISMATCH");
          }
          if (![404, 410].includes(response2.status)) await checked(response2);
        }
        const metadata = {
          ...file ? {} : { id: fileId, parents: [folderId] },
          name: kind === "manifest" ? "submission.json" : `${attachmentId}.${mimeType.split("/")[1].replace(/[^a-z0-9]/gi, "") || "bin"}`,
          mimeType,
          appProperties: properties
        };
        const endpoint = `https://www.googleapis.com/upload/drive/v3/files${file ? "/" + fileId : ""}?uploadType=resumable&fields=id,size,parents,appProperties,trashed`;
        const response = await sendRequest(endpoint, { method: file ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(size) }, body: JSON.stringify(metadata) });
        if (!response.ok) await checked(response);
        const next = validateDriveSession(response.headers.get("location"));
        return { sessionUrl: next, offset: 0, done: false, fresh: true };
      },
      async chunk(sessionUrl, bytes, offset, size) {
        const response = await sendRequest(validateDriveSession(sessionUrl), {
          method: "PUT",
          body: bytes,
          headers: { "Content-Length": String(bytes.byteLength), "Content-Range": `bytes ${offset}-${offset + bytes.byteLength - 1}/${size}` }
        });
        if (response.status === 308) {
          const next = Number(/^bytes=0-(\d+)$/.exec(response.headers.get("range") || "")?.[1]) + 1;
          if (!Number.isSafeInteger(next) || next <= offset || next > offset + bytes.byteLength || next > size) throw new ArchiveError("FILE_MISMATCH");
          return { offset: next, done: false };
        }
        if (!response.ok) await checked(response);
        if (![200, 201].includes(response.status) || offset + bytes.byteLength !== size) throw new ArchiveError("FILE_MISMATCH");
        return { offset: size, done: true };
      },
      async verify(fileId, folderId, job, size) {
        const properties = {
          archiveSubmission: job.submissionId,
          archiveKind: job.kind,
          ...job.kind === "attachment" ? { archiveAttachment: job.attachmentId } : { archiveRevision: String(job.revision) }
        };
        if (!matches(await getFile(fileId), folderId, properties, size)) throw new ArchiveError("FILE_MISMATCH");
      }
    };
  }

  // supabase/functions/archive-worker/worker.mjs
  var CHUNK = 4 * 1024 * 1024;
  async function runArchiveTick({ claim, work, getDrive, readSource, rootFolderId: rootFolderId2, maxChunks = 4 }) {
    const job = await claim();
    if (!job) return { state: "idle" };
    const change = (action, data = {}) => work(action, job.jobId, job.token, data);
    try {
      const drive = await getDrive();
      let folderId = job.folderId;
      if (!folderId) folderId = (await change("folder", { fileId: await drive.generateId() })).fileId;
      await drive.ensureFolder(folderId, rootFolderId2, job.submissionId, job.createdAt);
      let fileId = job.driveFileId;
      if (!fileId) fileId = (await change("reserve_file", { fileId: await drive.generateId() })).fileId;
      const manifest = job.kind === "manifest" ? new TextEncoder().encode(JSON.stringify(job.manifest, null, 2) + "\n") : null;
      const size = manifest?.byteLength ?? job.size;
      const mimeType = manifest ? "application/json" : job.mimeType;
      if (!Number.isSafeInteger(size) || size <= 0) throw new ArchiveError("FILE_MISMATCH");
      let upload = await drive.begin({ ...job, fileId, folderId, mimeType, size });
      if (upload.fresh) await change("session", { url: upload.sessionUrl, revision: job.revision });
      const sessionUrl = upload.sessionUrl;
      let offset = upload.offset;
      for (let index = 0; !upload.done && index < maxChunks; index++) {
        await change("progress", { offset });
        const end = Math.min(size, offset + CHUNK);
        const bytes = manifest ? manifest.slice(offset, end) : await readSource(job.objectPath, offset, end - 1);
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== end - offset) throw new ArchiveError("FILE_MISMATCH");
        upload = await drive.chunk(sessionUrl, bytes, offset, size);
        offset = upload.offset;
        if (!upload.done) await change("progress", { offset });
      }
      if (!upload.done) {
        await change("yield");
        return { state: "pending" };
      }
      await drive.verify(fileId, folderId, job, size);
      await change("complete", { revision: job.revision });
      return { state: "completed" };
    } catch (error) {
      const code = error instanceof ArchiveError ? error.code : "REMOTE_ERROR";
      try {
        await change("fail", { code });
      } catch {
      }
      return { state: "failed", code };
    }
  }
  async function sameSecret(actual, expected) {
    const encoder = new TextEncoder();
    const [a, b] = await Promise.all([actual, expected].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))));
    const left = new Uint8Array(a), right = new Uint8Array(b);
    let difference = 0;
    for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
    return difference === 0;
  }
  function createWorkerHandler({ enabled = false, secret: secret2, tick }) {
    return async (request) => {
      const reply = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
      if (!enabled || typeof secret2 !== "string" || secret2.length < 32) return reply(503, { error: "WORKER_NOT_READY" });
      if (request.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" });
      const bearer = request.headers.get("authorization") || "";
      if (!await sameSecret(bearer, "Bearer " + secret2)) return reply(401, { error: "UNAUTHORIZED" });
      try {
        return reply(200, await tick());
      } catch {
        return reply(503, { error: "WORKER_UNAVAILABLE" });
      }
    };
  }

  // supabase/functions/archive-worker/index.ts
  var secret = env("ARCHIVE_WORKER_SECRET");
  var rootFolderId = env("DRIVE_FOLDER_ID");
  var clientId = env("GOOGLE_DRIVE_CLIENT_ID");
  var clientSecret = env("GOOGLE_DRIVE_CLIENT_SECRET");
  var refreshToken = env("GOOGLE_DRIVE_REFRESH_TOKEN");
  Deno.serve(createWorkerHandler({
    secret,
    enabled: env("ARCHIVE_ENABLED") === "true" && !!base && !!key && !!clientId && !!clientSecret && !!refreshToken && !!rootFolderId,
    tick: () => runArchiveTick({
      rootFolderId,
      claim: () => rpc("archive_work", { p_action: "claim" }),
      work: (action, id, token, data) => rpc("archive_work", { p_action: action, p_id: id, p_token: token, p_data: data }),
      async getDrive() {
        return createDriveClient({ token: await refreshDriveToken({ clientId, clientSecret, refreshToken }) });
      },
      async readSource(path, start, end) {
        const object = path.split("/").map(encodeURIComponent).join("/");
        const response = await fetch(`${base}/storage/v1/object/authenticated/submission-media/${object}`, {
          headers: { ...backendHeaders, Range: `bytes=${start}-${end}` },
          redirect: "error",
          signal: AbortSignal.timeout(2e4)
        });
        if (response.status === 404) throw new ArchiveError("SOURCE_MISSING");
        if (![200, 206].includes(response.status) || !response.body) throw new ArchiveError("REMOTE_ERROR");
        if (response.status === 206 && !new RegExp(`^bytes ${start}-${end}/[0-9]+$`).test(response.headers.get("content-range") || "")) throw new ArchiveError("FILE_MISMATCH");
        const maximum = end - start + 1, reader = response.body.getReader();
        const output = new Uint8Array(maximum);
        let offset = 0;
        try {
          for (; ; ) {
            const { done, value } = await reader.read();
            if (done) break;
            if (offset + value.length > maximum) {
              await reader.cancel();
              throw new ArchiveError("FILE_MISMATCH");
            }
            output.set(value, offset);
            offset += value.length;
          }
        } finally {
          reader.releaseLock();
        }
        if (offset !== maximum) throw new ArchiveError("FILE_MISMATCH");
        return output;
      }
    })
  }));
})();
