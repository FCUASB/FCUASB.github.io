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

  // shared/catalog.mjs
  function validateCatalogDocument(kind, raw) {
    const fail = () => {
      throw new Error("\u5167\u5BB9\u683C\u5F0F\u4E0D\u7B26\uFF0C\u8ACB\u6AA2\u67E5\u5FC5\u586B\u6B04\u4F4D\u3001\u65E5\u671F\u3001\u4F86\u6E90\u7DB2\u5740\u53CA\u9577\u5EA6\u3002");
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > 24e3) fail();
    const doc = structuredClone(raw);
    const string = (value, max = 5e3, required = false) => {
      if (typeof value !== "string" || value.length > max || required && !value.trim()) fail();
    };
    const sourced = (item) => {
      if (!item.source && !item.sourceNote) fail();
    };
    const url = (value) => {
      if (!value) return;
      try {
        if (!["https:", "http:"].includes(new URL(value).protocol)) fail();
      } catch {
        fail();
      }
    };
    function links(value, depth = 0) {
      if (depth > 8) fail();
      if (Array.isArray(value)) {
        if (value.length > 200) fail();
        value.forEach((v) => links(v, depth + 1));
      } else if (value && typeof value === "object") for (const [key2, child] of Object.entries(value)) {
        if (["source", "externalVideo", "url"].includes(key2)) {
          string(child, 2e3);
          url(child);
        } else if (key2 === "sources") {
          if (!Array.isArray(child)) fail();
          child.forEach(url);
        } else links(child, depth + 1);
      }
      else if (typeof value === "string" && value.length > 1e4) fail();
    }
    if (kind === "biography") {
      string(doc.biography, 5e3, true);
      string(doc.biographyMore, 5e3);
      if (!Array.isArray(doc.career) || doc.career.length > 100) fail();
      for (const item of doc.career) {
        string(item.label, 100, true);
        string(item.title, 200, true);
        string(item.description, 3e3, true);
        if (!Number.isInteger(item.timelineOrder) || item.timelineOrder < 1977e4 || item.timelineOrder > 30001231) fail();
        sourced(item);
      }
    } else if (kind === "memory") {
      if (!Number.isSafeInteger(doc.id) || doc.id < 1) fail();
      string(doc.n, 200, true);
      string(doc.story, 5e3);
      if (!["text", "photo", "video"].includes(doc.type)) fail();
      if (doc.type === "text" && !doc.story.trim()) fail();
      if (doc.y != null && (!Number.isInteger(doc.y) || doc.y < 1977 || doc.y > 3e3)) fail();
      if (doc.m != null && (!Number.isInteger(doc.m) || doc.m < 1 || doc.m > 12 || doc.y == null)) fail();
      for (const key2 of ["place", "sourceName", "sourceNote", "asset", "youtube", "externalVideo"]) if (doc[key2] != null) string(doc[key2], 2e3);
      if (doc.type !== "text" && (typeof doc.asset !== "string" || !/^[A-Za-z0-9_-]+$/.test(doc.asset))) fail();
      if (doc.youtube && !/^[A-Za-z0-9_-]{11}$/.test(doc.youtube)) fail();
      sourced(doc);
    } else if (kind === "concert") {
      if (!Number.isSafeInteger(doc.id) || doc.id < 1) fail();
      string(doc.title, 300, true);
      string(doc.date, 10, true);
      if (!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(doc.date)) fail();
      if (doc.date.length === 10 && (/* @__PURE__ */ new Date(doc.date + "T00:00:00Z")).toISOString().slice(0, 10) !== doc.date) fail();
      if (!Number.isInteger(doc.year) || doc.year < 1977 || doc.year > 3e3 || doc.year !== Number(doc.date.slice(0, 4))) fail();
      for (const key2 of ["ens", "place", "cond", "story"]) string(doc[key2], key2 === "story" ? 5e3 : 500);
      for (const key2 of ["time", "role", "host", "dateLabel", "rowsNote", "sourceName", "sourceNote", "imageLabel", "asset", "status"]) if (doc[key2] != null) string(doc[key2], 2e3);
      if (doc.timelineOrder != null && (!Number.isInteger(doc.timelineOrder) || doc.timelineOrder < 1977e4 || doc.timelineOrder > 30001231)) fail();
      if (!Array.isArray(doc.rows) || doc.rows.length > 200) fail();
      for (const row of doc.rows) {
        if (!row || typeof row !== "object") fail();
        for (const key2 of ["zh", "orig", "composer", "arr"]) if (row[key2] != null) string(row[key2], 500);
        if (!row.zh && !row.orig) fail();
      }
      sourced(doc);
      if (doc.videoIds && (!Array.isArray(doc.videoIds) || doc.videoIds.length > 10 || doc.videoIds.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id)))) fail();
    } else fail();
    links(doc);
    return doc;
  }

  // supabase/functions/catalog/handler.mjs
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function createCatalogHandler({ origins: origins2, enabled = false, authenticate: authenticate2, execute, readPublic, consumeRate }) {
    return async (request) => {
      const origin = request.headers.get("origin");
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey"
      };
      const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
      if (origin && !origins2.includes(origin)) return reply(403, { error: "ORIGIN_DENIED" });
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (!["GET", "POST"].includes(request.method)) return reply(405, { error: "METHOD_NOT_ALLOWED" });
      if (!enabled) return reply(503, { error: "CATALOG_NOT_READY" });
      try {
        if (request.method === "GET") {
          if (!await consumeRate("intake_request")) throw new IntakeError(429, "RATE_LIMITED");
          return reply(200, { result: await readPublic() });
        }
        const bearer = request.headers.get("authorization") || "";
        if (!/^Bearer [^\s]+$/.test(bearer)) throw new IntakeError(401, "LOGIN_REQUIRED");
        const identity = await authenticate2(bearer.slice(7));
        if (!identity || !uuid.test(identity.id) || !uuid.test(identity.sessionId)) throw new IntakeError(401, "LOGIN_REQUIRED");
        if (!await consumeRate("admin")) throw new IntakeError(429, "RATE_LIMITED");
        const body = await boundedJSON(request, 98304);
        if (!["list", "save", "visibility", "history"].includes(body.action)) throw new IntakeError(400, "INVALID_ACTION");
        const input = body.input || {};
        if (!["concert", "biography", "memory"].includes(input.kind)) throw new IntakeError(400, "INVALID_INPUT");
        const clean = { kind: input.kind };
        if (body.action !== "list") {
          if (typeof input.id !== "string" || !(input.kind === "biography" ? input.id === "main" : /^[1-9]\d{0,15}$/.test(input.id))) throw new IntakeError(400, "INVALID_ID");
          clean.id = input.id;
        }
        if (["save", "visibility"].includes(body.action)) {
          if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new IntakeError(400, "VERSION_REQUIRED");
          clean.revision = input.revision;
          if (body.action === "save") {
            try {
              clean.document = validateCatalogDocument(input.kind, input.document);
            } catch {
              throw new IntakeError(400, "INVALID_CONTENT");
            }
            if (input.kind !== "biography" && String(clean.document.id) !== clean.id) throw new IntakeError(400, "INVALID_ID");
          } else {
            if (!["concert", "memory"].includes(input.kind) || typeof input.deleted !== "boolean") throw new IntakeError(400, "INVALID_STATE");
            clean.deleted = input.deleted;
          }
        }
        return reply(200, { result: await execute(identity, body.action, clean) });
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

  // supabase/functions/catalog/index.ts
  var origins = env("ADMIN_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
  Deno.serve(createCatalogHandler({
    origins,
    enabled: env("CATALOG_ENABLED") === "true" && !!base && !!key && origins.length > 0,
    authenticate,
    consumeRate: (scope) => rpc("archive_consume_rate", { p_scope: scope }),
    readPublic: () => rpc("archive_catalog_public"),
    execute: (identity, action, input) => rpc("archive_catalog_action", {
      p_actor: identity.id,
      p_session: identity.sessionId,
      p_action: action,
      p_input: input
    })
  }));
})();
