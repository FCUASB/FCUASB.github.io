// Serial authenticated reads for the visible admin workspace only.
export function createAdminSync({ read, notify, canRead = () => true, interval = 5000,
  now = () => new Date().toISOString(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer, pending, stopped = false, lastSuccess = null;
  function schedule() {
    if (!stopped) timer = setTimer(() => { timer = undefined; void refresh(); }, interval);
  }
  function refresh() {
    if (stopped) return Promise.resolve();
    if (timer !== undefined) { clearTimer(timer); timer = undefined; }
    if (pending) return pending;
    if (!canRead()) { notify({ state: 'paused', lastSuccess }); schedule(); return Promise.resolve(); }
    notify({ state: 'loading', lastSuccess });
    pending = Promise.resolve().then(() => !stopped && canRead() ? read() : false).then(applied => {
      if (stopped) return;
      if (applied === false) notify({ state: 'paused', lastSuccess });
      else { lastSuccess = now(); notify({ state: 'ready', lastSuccess }); }
    }, () => { if (!stopped) notify({ state: 'failed', lastSuccess }); })
      .finally(() => { pending = undefined; schedule(); });
    return pending;
  }
  return { refresh, stop() { stopped = true; if (timer !== undefined) clearTimer(timer); timer = undefined; } };
}
