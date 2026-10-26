/* Platform-neutral connection helpers. No connection is made during initialization. */
const ProjectConnection = (() => {
  class ConnectionError extends Error {
    constructor(code, message, status = 0) {
      super(message);
      this.name = 'ConnectionError';
      this.code = code;
      this.status = status;
    }
  }

  function createHttpClient({ baseURL, fetchImpl = globalThis.fetch, timeoutMs = 10000, retries = 1 } = {}) {
    const base = new URL(baseURL);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new TypeError('baseURL 必須是沒有帳密、查詢參數或片段的 HTTP(S) 網址。');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(retries) || retries < 0 || retries > 3) {
      throw new TypeError('timeoutMs 必須大於零；retries 必須是 0–3。');
    }
    base.pathname = base.pathname.replace(/\/$/, '') + '/';

    async function request(path, { method = 'GET', body, signal, headers = {} } = {}) {
      // Only relative endpoints under the configured base are accepted.
      if (typeof path !== 'string' || !path || /^[\/\\]|^[a-z][a-z\d+.-]*:/i.test(path)) throw new TypeError('請使用相對 API 路徑。');
      const url = new URL(path, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new TypeError('API 路徑超出 baseURL。');
      method = method.toUpperCase();
      const attempts = method === 'GET' || method === 'HEAD' ? retries + 1 : 1;
      const requestHeaders = new Headers(headers);
      const payload = body === undefined ? undefined : JSON.stringify(body);
      if (payload !== undefined) requestHeaders.set('Content-Type', 'application/json');
      requestHeaders.set('Accept', 'application/json');

      for (let attempt = 0; attempt < attempts; attempt++) {
        if (signal?.aborted) throw new ConnectionError('CANCELLED', '已取消連線。');
        const controller = new AbortController();
        let timedOut = false;
        const cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        try {
          const response = await fetchImpl(url.href, {
            method, body: payload, headers: requestHeaders, signal: controller.signal,
            credentials: 'omit', redirect: 'error',
          });
          if (!response.ok) throw new ConnectionError('HTTP', '服務暫時無法完成要求。', response.status);
          if (response.status === 204 || method === 'HEAD') return null;
          try { return await response.json(); }
          catch (error) {
            if (controller.signal.aborted) throw error;
            throw new ConnectionError('INVALID_RESPONSE', '服務回傳的資料格式不正確。');
          }
        } catch (error) {
          const failure = signal?.aborted ? new ConnectionError('CANCELLED', '已取消連線。')
            : timedOut ? new ConnectionError('TIMEOUT', '連線逾時，請稍後再試。')
            : error instanceof ConnectionError ? error : new ConnectionError('NETWORK', '無法連線，請檢查網路後再試。');
          const retryable = ['NETWORK', 'TIMEOUT'].includes(failure.code)
            || (failure.code === 'HTTP' && [502, 503, 504].includes(failure.status));
          if (!retryable || attempt + 1 === attempts) throw failure;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
        }
      }
    }
    return Object.freeze({ request });
  }

  function createRepository({ list, save }) {
    if (typeof list !== 'function' || typeof save !== 'function') throw new TypeError('資料介面需要 list 與 save。');
    const collections = new Set(['memories', 'concerts', 'reports', 'settings']);
    const validate = name => { if (!collections.has(name)) throw new TypeError('未知的資料集合。'); };
    return Object.freeze({
      async list(name) { validate(name); return list(name); },
      async save(name, value) { validate(name); return save(name, value); },
    });
  }
  return Object.freeze({ ConnectionError, createHttpClient, createRepository });
})();
