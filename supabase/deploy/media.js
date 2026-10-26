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
  async function boundedJSON(request, maxBytes = 32768) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new IntakeError(415, "JSON_REQUIRED");
    if (Number(request.headers.get("content-length")) > maxBytes) throw new IntakeError(413, "PAYLOAD_TOO_LARGE");
    const reader = request.body?.getReader();
    if (!reader) throw new IntakeError(400, "INVALID_JSON");
    let size = 0;
    const chunks = [];
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new IntakeError(413, "PAYLOAD_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new IntakeError(400, "INVALID_JSON");
    }
  }

  // supabase/functions/media/handler.mjs
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var safeMime = (value) => /^(image\/(jpeg|png|webp|gif|avif|heic|heif)|video\/(mp4|webm|quicktime|mpeg))$/.test(value || "");
  function createMediaHandler({
    origins: origins2,
    enabled = false,
    consumeRate,
    uploadAction,
    signUpload,
    inspectObject,
    publicMedia,
    authenticate: authenticate2,
    adminMedia,
    readObject
  }) {
    const allowed = new Set(origins2);
    return async (request) => {
      const origin = request.headers.get("origin");
      const headers = {
        "Cache-Control": "no-store, max-age=0",
        "Vary": "Origin",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, range",
        "Access-Control-Expose-Headers": "content-range, accept-ranges, content-length, content-disposition",
        "Content-Security-Policy": "sandbox; default-src 'none'"
      };
      const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
      if (origin && !allowed.has(origin)) return reply(403, { error: "ORIGIN_DENIED" });
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (!enabled) return reply(503, { error: "MEDIA_NOT_READY" });
      try {
        if (request.method === "POST") {
          if (!await consumeRate("upload_ticket")) throw new IntakeError(429, "RATE_LIMITED");
          const input = await boundedJSON(request, 4096);
          if (!UUID.test(input.id) || !UUID.test(input.key) || !["list", "ticket", "complete", "fail"].includes(input.action)) throw new IntakeError(400, "INVALID_INPUT");
          const object = await uploadAction(input.key, input.id, input.action === "complete" ? "ticket" : input.action);
          if (input.action === "list") return reply(200, { attachments: object });
          if (!object) throw new IntakeError(404, "NOT_FOUND");
          if (input.action === "ticket") return reply(200, { url: await signUpload(object.path) });
          if (input.action === "complete") {
            const metadata2 = await inspectObject(object.path);
            if (!metadata2 || metadata2.size !== object.size || metadata2.mimeType !== object.mimeType || !safeMime(metadata2.mimeType)) throw new IntakeError(400, "FILE_MISMATCH");
            await uploadAction(input.key, input.id, "complete", metadata2.size, metadata2.mimeType);
          }
          return reply(200, { status: input.action === "complete" ? "ready" : "failed" });
        }
        if (!["GET", "HEAD"].includes(request.method)) return reply(405, { error: "METHOD_NOT_ALLOWED" });
        const id = new URL(request.url).pathname.split("/").at(-1);
        if (!UUID.test(id)) throw new IntakeError(404, "NOT_FOUND");
        const bearer = request.headers.get("authorization");
        let metadata, download = false;
        if (bearer) {
          if (!/^Bearer [^\s]+$/.test(bearer)) throw new IntakeError(401, "LOGIN_REQUIRED");
          const identity = await authenticate2(bearer.slice(7));
          if (!identity) throw new IntakeError(401, "LOGIN_REQUIRED");
          metadata = await adminMedia(identity, id);
          download = true;
        } else metadata = await publicMedia(id);
        if (!metadata || !safeMime(metadata.mimeType)) throw new IntakeError(404, "NOT_FOUND");
        const range = request.headers.get("range");
        if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) throw new IntakeError(416, "INVALID_RANGE");
        const upstream = await readObject(metadata.path, request.method, range);
        if (![200, 206, 416].includes(upstream.status)) throw new IntakeError(404, "NOT_FOUND");
        for (const name of ["content-range", "accept-ranges", "content-length"]) if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
        headers["Content-Type"] = metadata.mimeType;
        headers["Content-Disposition"] = download ? `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename || id).replaceAll("'", "%27")}` : "inline";
        return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
      } catch (error) {
        return reply(error instanceof IntakeError ? error.status : 503, { error: error instanceof IntakeError ? error.code : "SERVICE_UNAVAILABLE" });
      }
    };
  }

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
  async function authenticate(token) {
    const response = await fetch(`${base}/auth/v1/user`, {
      headers: { ...backendHeaders, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4),
      redirect: "error"
    });
    if ([401, 403].includes(response.status)) return null;
    if (!response.ok) throw new Error("Auth unavailable");
    const user = await response.json();
    try {
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
      return claims.sub === user.id && /^[0-9a-f-]{36}$/i.test(claims.session_id) ? { id: user.id, sessionId: claims.session_id } : null;
    } catch {
      return null;
    }
  }

  // supabase/functions/media/index.ts
  var origins = env("INTAKE_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
  var objectPath = (path) => "submission-media/" + path.split("/").map(encodeURIComponent).join("/");
  Deno.serve(createMediaHandler({
    origins,
    enabled: env("MEDIA_ENABLED") === "true" && !!base && !!key && origins.length > 0,
    consumeRate: (scope) => rpc("archive_consume_rate", { p_scope: scope }),
    uploadAction: (key2, id, action, size, mime) => rpc("archive_upload_action", { p_key: key2, p_id: id, p_action: action, p_size: size ?? null, p_mime: mime ?? null }),
    async signUpload(path) {
      const response = await fetch(`${base}/storage/v1/object/upload/sign/${objectPath(path)}`, {
        method: "POST",
        headers: backendHeaders,
        body: "{}",
        redirect: "error",
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) throw new Error("Storage unavailable");
      const data = await response.json();
      const url = new URL(`${base}/storage/v1${data.url}`);
      if (url.origin !== new URL(base).origin || !url.searchParams.get("token")) throw new Error("Invalid upload response");
      return url.href;
    },
    async inspectObject(path) {
      const response = await fetch(`${base}/storage/v1/object/info/${objectPath(path)}`, { headers: backendHeaders, redirect: "error", signal: AbortSignal.timeout(1e4) });
      if (!response.ok) return null;
      const data = await response.json();
      return { size: data.size, mimeType: data.content_type };
    },
    publicMedia: (id) => rpc("archive_public_media", { p_id: id }),
    authenticate,
    adminMedia: (identity, id) => rpc("archive_admin_action", { p_actor: identity.id, p_session: identity.sessionId, p_action: "download_metadata", p_input: { id } }),
    readObject: (path, method, range) => fetch(`${base}/storage/v1/object/authenticated/${objectPath(path)}`, {
      method,
      headers: { ...backendHeaders, ...range ? { Range: range } : {} },
      redirect: "error",
      signal: AbortSignal.timeout(3e4)
    })
  }));
})();
