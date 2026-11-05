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

  // shared/catalog.mjs
  function validateCatalogDocument(kind, raw) {
    const fail2 = () => {
      throw new Error("\u5167\u5BB9\u683C\u5F0F\u4E0D\u7B26\uFF0C\u8ACB\u6AA2\u67E5\u5FC5\u586B\u6B04\u4F4D\u3001\u65E5\u671F\u3001\u4F86\u6E90\u7DB2\u5740\u53CA\u9577\u5EA6\u3002");
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > 24e3) fail2();
    const doc = structuredClone(raw);
    const string = (value, max = 5e3, required = false) => {
      if (typeof value !== "string" || value.length > max || required && !value.trim()) fail2();
    };
    const sourced = (item) => {
      if (!item.source && !item.sourceNote) fail2();
    };
    const url = (value) => {
      if (!value) return;
      try {
        if (!["https:", "http:"].includes(new URL(value).protocol)) fail2();
      } catch {
        fail2();
      }
    };
    function links(value, depth = 0) {
      if (depth > 8) fail2();
      if (Array.isArray(value)) {
        if (value.length > 200) fail2();
        value.forEach((v) => links(v, depth + 1));
      } else if (value && typeof value === "object") for (const [key2, child] of Object.entries(value)) {
        if (["source", "externalVideo", "url"].includes(key2)) {
          string(child, 2e3);
          url(child);
        } else if (key2 === "sources") {
          if (!Array.isArray(child)) fail2();
          child.forEach(url);
        } else links(child, depth + 1);
      }
      else if (typeof value === "string" && value.length > 1e4) fail2();
    }
    if (kind === "biography") {
      string(doc.biography, 5e3, true);
      string(doc.biographyMore, 5e3);
      if (!Array.isArray(doc.career) || doc.career.length > 100) fail2();
      for (const item of doc.career) {
        string(item.label, 100, true);
        string(item.title, 200, true);
        string(item.description, 3e3, true);
        if (!Number.isInteger(item.timelineOrder) || item.timelineOrder < 1977e4 || item.timelineOrder > 30001231) fail2();
        sourced(item);
      }
    } else if (kind === "memory") {
      if (!Number.isSafeInteger(doc.id) || doc.id < 1) fail2();
      string(doc.n, 200, true);
      string(doc.story, 5e3);
      if (!["text", "photo", "video"].includes(doc.type)) fail2();
      if (doc.type === "text" && !doc.story.trim()) fail2();
      if (doc.y != null && (!Number.isInteger(doc.y) || doc.y < 1977 || doc.y > 3e3)) fail2();
      if (doc.m != null && (!Number.isInteger(doc.m) || doc.m < 1 || doc.m > 12 || doc.y == null)) fail2();
      for (const key2 of ["place", "sourceName", "sourceNote", "asset", "youtube", "externalVideo"]) if (doc[key2] != null) string(doc[key2], 2e3);
      if (doc.type !== "text" && (typeof doc.asset !== "string" || !/^[A-Za-z0-9_-]+$/.test(doc.asset))) fail2();
      if (doc.youtube && !/^[A-Za-z0-9_-]{11}$/.test(doc.youtube)) fail2();
      sourced(doc);
    } else if (kind === "concert") {
      if (!Number.isSafeInteger(doc.id) || doc.id < 1) fail2();
      string(doc.title, 300, true);
      string(doc.date, 10, true);
      if (!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(doc.date)) fail2();
      if (doc.date.length === 10 && (/* @__PURE__ */ new Date(doc.date + "T00:00:00Z")).toISOString().slice(0, 10) !== doc.date) fail2();
      if (!Number.isInteger(doc.year) || doc.year < 1977 || doc.year > 3e3 || doc.year !== Number(doc.date.slice(0, 4))) fail2();
      for (const key2 of ["ens", "place", "cond", "story"]) string(doc[key2], key2 === "story" ? 5e3 : 500);
      for (const key2 of ["time", "role", "host", "dateLabel", "rowsNote", "sourceName", "sourceNote", "imageLabel", "asset", "status"]) if (doc[key2] != null) string(doc[key2], 2e3);
      if (doc.timelineOrder != null && (!Number.isInteger(doc.timelineOrder) || doc.timelineOrder < 1977e4 || doc.timelineOrder > 30001231)) fail2();
      if (!Array.isArray(doc.rows) || doc.rows.length > 200) fail2();
      for (const row of doc.rows) {
        if (!row || typeof row !== "object") fail2();
        for (const key2 of ["zh", "orig", "composer", "arr"]) if (row[key2] != null) string(row[key2], 500);
        if (!row.zh && !row.orig) fail2();
      }
      sourced(doc);
      if (doc.videoIds && (!Array.isArray(doc.videoIds) || doc.videoIds.length > 10 || doc.videoIds.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id)))) fail2();
    } else fail2();
    links(doc);
    return doc;
  }

  // shared/visitor.mjs
  var VisitorInputError = class extends Error {
  };
  var fail = () => {
    throw new VisitorInputError("INVALID_INPUT");
  };
  var text = (value, max, required = false) => {
    if (value == null && !required) return "";
    if (typeof value !== "string" || value.length > max) fail();
    const trimmed = value.trim();
    if (required && !trimmed) fail();
    return trimmed;
  };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var MAX_ROWS = 50;
  var REPORT_TYPES = ["\u8CC7\u6599\u6709\u8AA4", "\u5167\u5BB9\u4E0D\u7576", "\u6D89\u53CA\u96B1\u79C1\u6216\u7248\u6B0A", "\u5176\u4ED6"];
  function rows(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > MAX_ROWS) fail();
    return value.map((row) => {
      if (!row || typeof row !== "object") fail();
      const clean = { zh: text(row.zh, 200), orig: text(row.orig, 200), composer: text(row.composer, 200), arr: text(row.arr, 200) };
      if (!clean.zh && !clean.orig) fail();
      return clean;
    });
  }
  function visitorDate(value) {
    const date = text(value, 10, true);
    if (!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(date)) fail();
    const year = Number(date.slice(0, 4));
    if (year < 1977 || year > 3e3) fail();
    if (date.length === 10 && (/* @__PURE__ */ new Date(date + "T00:00:00Z")).toISOString().slice(0, 10) !== date) fail();
    return { date, year, timelineOrder: Number(date.replaceAll("-", "").padEnd(8, "0")) };
  }
  function envelope(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail();
    if (!UUID.test(input.idempotencyKey)) throw new VisitorInputError("INVALID_IDEMPOTENCY_KEY");
    if (input.consent !== true) throw new VisitorInputError("CONSENT_REQUIRED");
    return { idempotencyKey: input.idempotencyKey, name: text(input.name, 200, true) };
  }
  function validateVisitorConcert(input) {
    const base2 = envelope(input), when = visitorDate(input.date), dateNote = text(input.dateNote, 200);
    const partial = when.date.length < 10;
    const doc = {
      id: 1,
      origin: "visitor",
      title: text(input.title, 300, true),
      ...when,
      ...partial || dateNote ? { dateLabel: when.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1 \u5E74 $2 \u6708 $3 \u65E5").replace(/^(\d{4})-(\d{2})$/, "$1 \u5E74 $2 \u6708").replace(/^(\d{4})$/, "$1 \u5E74") + "\uFF08" + (dateNote || "\u6F14\u51FA\u65E5\u671F\u5F85\u6838\u5C0D") + "\uFF09" } : {},
      time: text(input.time, 20),
      place: text(input.place, 500),
      ens: text(input.ens, 500),
      cond: text(input.cond, 500),
      host: text(input.host, 500),
      story: text(input.story, 5e3),
      rows: rows(input.rows),
      status: partial || dateNote ? "date-pending" : "",
      need: true,
      asset: "lu-portrait",
      imageLabel: "\u5442\u5F65\u6176\u6307\u63EE\u8CC7\u6599\u7167\uFF08\u975E\u8A72\u5834\u6F14\u51FA\u7167\u7247\uFF09",
      sourceName: "\u89AA\u53CB\u65B0\u589E",
      sourceNote: "\u89AA\u53CB\u65B0\u589E\uFF0C\u5C1A\u672A\u6838\u5C0D",
      contributor: base2.name
    };
    for (const key2 of ["time", "host", "status"]) if (!doc[key2]) delete doc[key2];
    try {
      validateCatalogDocument("concert", doc);
    } catch {
      fail();
    }
    return { idempotencyKey: base2.idempotencyKey, document: doc };
  }
  function validateSupplement(input) {
    const base2 = envelope(input);
    const targetId = text(input.concertId == null ? "" : String(input.concertId), 16, true);
    if (!/^[1-9]\d{0,15}$/.test(targetId)) fail();
    const body = { text: text(input.text, 2e3), rows: rows(input.rows) };
    if (!body.text && !body.rows.length) fail();
    return { idempotencyKey: base2.idempotencyKey, kind: "supplement", targetKind: "concert", targetId, name: base2.name, body };
  }
  function validateReport(input) {
    const base2 = envelope(input);
    const targetKind = input.targetKind;
    if (!["concert", "memory"].includes(targetKind)) fail();
    const targetId = text(input.targetId == null ? "" : String(input.targetId), 64, true);
    if (!/^[A-Za-z0-9-]{1,64}$/.test(targetId)) fail();
    if (!REPORT_TYPES.includes(input.type)) fail();
    const detail = text(input.detail, 2e3, true);
    return { idempotencyKey: base2.idempotencyKey, kind: "report", targetKind, targetId, name: base2.name, body: { type: input.type, detail } };
  }

  // supabase/functions/visitor/handler.mjs
  var validators = { concert: validateVisitorConcert, supplement: validateSupplement, report: validateReport };
  function createVisitorHandler({ origins: origins2, enabled: enabled2 = false, verifyChallenge, saveConcert, saveContribution, consumeRate }) {
    const allowed = new Set(origins2);
    return async (request) => {
      const origin = request.headers.get("origin");
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, apikey"
      };
      const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
      if (origin && !allowed.has(origin)) return reply(403, { error: "ORIGIN_DENIED" });
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" });
      if (!enabled2) return reply(503, { error: "VISITOR_NOT_READY" });
      try {
        if (typeof consumeRate !== "function") throw new Error("Rate limiter missing");
        if (!await consumeRate("intake_request")) throw new IntakeError(429, "RATE_LIMITED");
        const input = await boundedJSON(request, 65536);
        const validate = validators[input?.type];
        if (!validate) throw new IntakeError(400, "INVALID_TYPE");
        let record;
        try {
          record = validate(input.payload);
        } catch (error) {
          if (error instanceof VisitorInputError) throw new IntakeError(400, error.message);
          throw error;
        }
        const token = typeof input.challengeToken === "string" ? input.challengeToken : "";
        if (!token || token.length > 2048 || !await verifyChallenge(token, origin)) throw new IntakeError(403, "CHALLENGE_FAILED");
        if (!await consumeRate("visitor_write")) throw new IntakeError(429, "RATE_LIMITED");
        const result = input.type === "concert" ? await saveConcert(record) : await saveContribution(record);
        if (!result || typeof result.id !== "string" || result.status !== "received") throw new Error("Invalid receipt");
        return reply(201, { id: result.id, status: "received" });
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

  // supabase/functions/visitor/index.ts
  var origins = env("INTAKE_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
  var challengeSecret = env("TURNSTILE_SECRET_KEY");
  var hostnames = new Set(origins.map((value) => new URL(value).hostname));
  var enabled = env("VISITOR_ENABLED") === "true" && !!base && !!key && !!challengeSecret && origins.length > 0;
  Deno.serve(createVisitorHandler({
    origins,
    enabled,
    consumeRate: (scope) => rpc("archive_consume_rate", { p_scope: scope }),
    async verifyChallenge(token, origin) {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: challengeSecret, response: token }),
        signal: AbortSignal.timeout(1e4),
        redirect: "error"
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.success === true && data.action === "visitor-submit" && hostnames.has(data.hostname) && (!origin || data.hostname === new URL(origin).hostname);
    },
    saveConcert: (record) => rpc("archive_visitor_concert", { p_record: record }),
    saveContribution: (record) => rpc("archive_visitor_contribution", { p_record: record })
  }));
})();
