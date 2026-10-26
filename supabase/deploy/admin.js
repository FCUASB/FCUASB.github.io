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

  // supabase/functions/admin/handler.mjs
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var ACTIONS = /* @__PURE__ */ new Set(["audit", "profile", "search", "contacts", "export", "members", "set_role", "edit", "visibility", "attachment_visibility", "archive_status", "retry_archive"]);
  function validateAdminInput(action, raw) {
    if (!ACTIONS.has(action) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new IntakeError(400, "INVALID_ACTION");
    const input = {};
    if (["contacts", "edit", "visibility", "attachment_visibility", "retry_archive"].includes(action)) {
      if (!UUID.test(raw.id)) throw new IntakeError(400, "INVALID_ID");
      input.id = raw.id;
    }
    if (action === "audit") {
      for (const field of ["actorId", "targetId"]) {
        if (raw[field]) {
          if (!UUID.test(raw[field])) throw new IntakeError(400, "INVALID_ID");
          input[field] = raw[field];
        }
      }
      if (raw.action) {
        if (typeof raw.action !== "string" || !/^[a-z][a-z0-9_.]{0,79}$/.test(raw.action)) throw new IntakeError(400, "INVALID_ACTION");
        input.action = raw.action;
      }
    }
    if (["search", "export", "audit"].includes(action)) {
      if (raw.query != null && (typeof raw.query !== "string" || raw.query.length > 200)) throw new IntakeError(400, "INVALID_QUERY");
      if (raw.filter != null && !["all", "active", "deleted", "upload_failed", "archive_failed"].includes(raw.filter)) throw new IntakeError(400, "INVALID_FILTER");
      input.query = raw.query || "";
      input.filter = raw.filter || "all";
      if (raw.before != null || raw.beforeId != null) {
        if (typeof raw.before !== "string" || !Number.isFinite(Date.parse(raw.before)) || !UUID.test(raw.beforeId)) throw new IntakeError(400, "INVALID_CURSOR");
        input.before = raw.before;
        input.beforeId = raw.beforeId;
      }
    }
    if (["edit", "visibility"].includes(action)) {
      if (typeof raw.updatedAt !== "string" || !Number.isFinite(Date.parse(raw.updatedAt))) throw new IntakeError(400, "VERSION_REQUIRED");
      input.updatedAt = raw.updatedAt;
    }
    if (action === "edit") {
      if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 200 || typeof raw.body !== "string" || raw.body.length > 5e3) throw new IntakeError(400, "INVALID_CONTENT");
      if (raw.year != null && (!Number.isInteger(raw.year) || raw.year < 1977 || raw.year > (/* @__PURE__ */ new Date()).getUTCFullYear())) throw new IntakeError(400, "INVALID_YEAR");
      input.name = raw.name.trim();
      input.body = raw.body.trim();
      input.year = raw.year ?? null;
    }
    if (["visibility", "attachment_visibility"].includes(action)) {
      if (typeof raw.deleted !== "boolean") throw new IntakeError(400, "INVALID_STATE");
      input.deleted = raw.deleted;
    }
    if (action === "set_role") {
      if (!UUID.test(raw.userId) || !["system_admin", "content_admin", "data_curator"].includes(raw.role) || typeof raw.active !== "boolean") throw new IntakeError(400, "INVALID_ROLE");
      input.userId = raw.userId;
      input.role = raw.role;
      input.active = raw.active;
    }
    return input;
  }
  function createAdminHandler({ origins: origins2, authenticate: authenticate2, execute, consumeRate, enabled = false }) {
    const allowed = new Set(origins2);
    return async (request) => {
      const origin = request.headers.get("origin");
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey"
      };
      const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
      if (origin && !allowed.has(origin)) return reply(403, { error: "ORIGIN_DENIED" });
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" });
      if (!enabled) return reply(503, { error: "ADMIN_NOT_READY" });
      try {
        const bearer = request.headers.get("authorization") || "";
        if (!/^Bearer [^\s]+$/.test(bearer)) throw new IntakeError(401, "LOGIN_REQUIRED");
        const identity = await authenticate2(bearer.slice(7));
        if (!identity || !UUID.test(identity.id) || !UUID.test(identity.sessionId)) throw new IntakeError(401, "LOGIN_REQUIRED");
        if (typeof consumeRate !== "function") throw new Error("Rate limiter missing");
        if (!await consumeRate("admin")) throw new IntakeError(429, "RATE_LIMITED");
        const body = await boundedJSON(request);
        const input = validateAdminInput(body.action, body.input || {});
        return reply(200, { result: await execute(identity, body.action, input) });
      } catch (error) {
        return reply(
          error instanceof IntakeError ? error.status : 503,
          { error: error instanceof IntakeError ? error.code : "SERVICE_UNAVAILABLE" }
        );
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

  // supabase/functions/admin/index.ts
  var origins = env("ADMIN_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
  Deno.serve(createAdminHandler({
    origins,
    enabled: env("ADMIN_ENABLED") === "true" && !!base && !!key && origins.length > 0,
    authenticate,
    consumeRate: (scope) => rpc("archive_consume_rate", { p_scope: scope }),
    execute: (identity, action, input) => action === "audit" ? rpc("archive_list_audit", {
      p_actor: identity.id,
      p_session: identity.sessionId,
      p_input: input
    }) : rpc("archive_admin_action", {
      p_actor: identity.id,
      p_session: identity.sessionId,
      p_action: action,
      p_input: input
    })
  }));
})();
