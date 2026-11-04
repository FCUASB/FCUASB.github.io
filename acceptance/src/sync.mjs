// Explicit reads only, one in flight; failed reads never claim freshness.
export function createAcceptanceSync({ read, notify, now = () => new Date().toISOString() }) {
  let pending, stopped = false, lastSuccess = null;
  function refresh() {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    notify({ state: 'loading', lastSuccess });
    pending = Promise.resolve().then(read).then(() => {
      if (!stopped) { lastSuccess = now(); notify({ state: 'ready', lastSuccess }); }
    }, () => { if (!stopped) notify({ state: 'failed', lastSuccess }); })
      .finally(() => { pending = null; });
    return pending;
  }
  return { refresh, stop() { stopped = true; } };
}
