// One in-flight read, visible pages only; failed reads never claim freshness.
export function createAcceptanceSync({ read, notify, active = () => true, intervalMs = 10000,
  setTimer = setTimeout, clearTimer = clearTimeout, now = () => new Date().toISOString() }) {
  let timer, pending, stopped = false, lastSuccess = null;
  function schedule() {
    if (stopped) return;
    timer = setTimer(() => { timer = null; if (active()) void refresh(); else schedule(); }, intervalMs);
  }
  function refresh() {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    if (timer != null) { clearTimer(timer); timer = null; }
    notify({ state: 'loading', lastSuccess });
    pending = Promise.resolve().then(read).then(() => {
      if (!stopped) { lastSuccess = now(); notify({ state: 'ready', lastSuccess }); }
    }, () => { if (!stopped) notify({ state: 'failed', lastSuccess }); })
      .finally(() => { pending = null; schedule(); });
    return pending;
  }
  return { refresh, stop() { stopped = true; if (timer != null) clearTimer(timer); } };
}
