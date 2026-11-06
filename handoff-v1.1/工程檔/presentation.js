function presentationSlides(career, concerts, memories) {
  const dated = [
    ...career.map((entry, index) => ({
      id: 'career-' + index, order: entry.timelineOrder, kind: 'career', entry
    })),
    ...concerts.map(entry => ({
      id: 'concert-' + entry.id, order: entry.timelineOrder || Number(entry.date.replaceAll('-', '').padEnd(8, '0')),
      kind: 'concert', entry
    }))
  ];
  const undated = [];
  for (const entry of memories) {
    if (entry.local || entry.sample) continue;
    const slide = {
      id: 'memory-' + entry.id, order: entry.y * 10000 + (entry.m || 0) * 100,
      kind: 'memory', entry
    };
    (entry.y ? dated : undated).push(slide);
  }
  dated.sort((a, b) => a.order - b.order);
  undated.sort((a, b) => a.entry.createdAt - b.entry.createdAt || a.entry.id - b.entry.id);
  return [...dated, ...undated];
}

const ProjectPresentation = (() => {
  const root = $('#presentation');
  const stage = $('#presentation-slide');
  const player = $('#presentation-player');
  const notes = $('#presentation-notes');
  const syncStatus = $('#presentation-sync');
  const controls = $('.presentation-controls', root);
  const pause = $('#presentation-pause');
  const next = $('#presentation-next');
  const music = $('#presentation-music');
  const live = $('#presentation-live');
  const qr = $('#presentation-qr');
  const qrSize = $('#presentation-qr-size');
  const qrSide = $('#presentation-qr-side');
  let running = false;
  let paused = false;
  let livePaused = false;
  let hasMemorySnapshot = false;
  let seen = null;
  let startedAt;
  let current = null;
  let currentLive = false;
  let timer;
  let slides = new Map();
  let regular = [];
  const pending = new Map();

  function collectSlides() {
    const catalogReady = !document.body.classList.contains('catalog-pending');
    const items = presentationSlides(catalogReady ? ARCHIVE.career : [], catalogReady ? CON : [], MEM);
    slides = new Map(items.map(slide => [slide.id, slide]));
  }

  function welcome() {
    const portrait = ASSETS['lu-portrait'];
    render({
      kicker: '現場展映 ・ In Loving Memory', title: '大呂的音樂，未完待續',
      story: '那些一起演奏的日子，那些一起走過的時光。',
      image: portrait.url, caption: '呂彥慶指揮', imageSource: portrait.source,
      start: !running
    });
  }

  function render({kicker, title, story, meta, note, image, caption, source, sourceName, imageSource, start}) {
    stage.classList.toggle('has-image', !!image);
    const heading = start ? 'h1' : 'h2';
    stage.innerHTML = `
      ${image ? `<figure><img src="${esc(image)}" alt="${esc(caption || title)}">
        ${caption || imageSource ? `<figcaption>${esc(caption)} ${sourceLink(imageSource, '影像來源')}</figcaption>` : ''}</figure>` : ''}
      <div class="presentation-copy">
        <p class="presentation-kicker">${esc(kicker)}</p>
        <${heading}>${esc(title)}</${heading}>
        ${story ? `<p class="presentation-story">${esc(story)}</p>` : ''}
        ${meta ? `<p class="presentation-meta">${esc(meta)}</p>` : ''}
        ${note || source ? `<p class="presentation-meta">${esc(note)} ${sourceLink(source, sourceName || '資料來源')}</p>` : ''}
        ${start ? '<button class="btn gold presentation-start" type="button">開始展映</button>' : ''}
      </div>`;
    $('figure img', stage)?.addEventListener('error', () => {
      $('figure', stage)?.remove();
      stage.classList.remove('has-image');
    }, {once: true});
  }

  function showSlide(slide) {
    current = slide;
    const {entry, kind} = slide;
    const source = entry.source;
    const note = entry.sourceNote;
    if (kind === 'career') {
      render({
        kicker: entry.label + ' ・ 大呂生平', title: entry.title, story: entry.description,
        meta: entry.venue, source, note
      });
      return;
    }
    if (kind === 'concert') {
      const image = ASSETS[entry.asset];
      const state = {cancelled: '已取消', planned: '行前計畫，實際演出待核', 'date-pending': '演出日期待核對'};
      render({
        kicker: (entry.dateLabel || fmtDate(entry.date)) + ' ・ 音樂會紀錄',
        title: entry.title, story: entry.story, image: image?.url, imageSource: image?.source,
        caption: entry.imageLabel || image?.label, source, sourceName: entry.sourceName, note,
        meta: [entry.ens, entry.place, entry.role, state[entry.status] || entry.status,
          entry.origin === 'visitor' ? '親友新增，尚未核對' : ''].filter(Boolean).join(' ・ ')
      });
      return;
    }
    const chars = storyCharacters(entry.story);
    const image = entry.media?.map(item => item.type === 'photo' || item.youtube ? item.url : item.poster).find(Boolean);
    const type = currentLive ? '剛收到的回憶' : entry.y ? '親友回憶' : '親友的話';
    render({
      kicker: entry.y ? dateTxt(entry) + ' ・ ' + type : type, title: entry.n,
      story: chars.length > 100 ? chars.slice(0, 100).join('') + '…' : entry.story,
      meta: [entry.rel, entry.place].filter(Boolean).join(' ・ '), source, sourceName: entry.sourceName, note,
      image: image || (entry.cloud ? '' : entry.src), imageSource: ASSETS[entry.asset]?.source
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (running && !paused && !document.hidden) timer = setTimeout(advance, 12000);
  }

  function advance() {
    if (!running) return;
    let id;
    if (!livePaused && pending.size) {
      id = pending.keys().next().value;
      pending.delete(id);
    }
    currentLive = id !== undefined;
    if (!currentLive) {
      regular = regular.filter(key => slides.has(key) && !pending.has(key));
      if (!regular.length) regular = [...slides.keys()].filter(key => !pending.has(key));
      id = regular.shift();
    }
    if (id !== undefined) showSlide(slides.get(id));
    else if (current) {
      current = null;
      welcome();
    }
    updateStatus();
    schedule();
  }

  function floatNote() {
    const note = document.createElement('span');
    note.className = 'presentation-note';
    note.textContent = '♪';
    note.style.setProperty('--note-left', (10 + Math.random() * 75) + '%');
    note.addEventListener('animationend', () => note.remove(), {once: true});
    notes.append(note);
  }

  let memorySyncFailed = false;
  function updateStatus() {
    const message = memorySyncFailed ? '投稿暫時無法同步，稍後重試。' :
      hasMemorySnapshot ? '公開投稿每 10 秒同步。' : '正在讀取公開投稿。';
    syncStatus.textContent = message + (pending.size ? ` 等候上屏 ${pending.size} 則。` : '');
  }

  function sync(memorySucceeded) {
    hasMemorySnapshot ||= memorySucceeded;
    memorySyncFailed = !memorySucceeded;
    if (root.hidden || !running) {
      updateStatus();
      return;
    }
    collectSlides();
    for (const id of pending.keys()) if (!slides.has(id)) pending.delete(id);
    if (memorySucceeded) {
      const cloud = MEM.filter(entry => entry.cloud).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
      seen ??= new Set(cloud.filter(entry => !(entry.createdAt >= startedAt)).map(entry => 'memory-' + entry.id));
      for (const entry of cloud) {
        const id = 'memory-' + entry.id;
        if (seen.has(id)) continue;
        seen.add(id);
        pending.set(id, !livePaused);
        if (!livePaused) floatNote();
      }
    }
    if (current) {
      const updated = slides.get(current.id);
      if (!updated) advance();
      else if (updated.entry !== current.entry) showSlide(updated);
    }
    updateStatus();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement === root) {
      void document.exitFullscreen().catch(() => {});
    } else {
      root.requestFullscreen?.().catch(() => {});
    }
  }

  function setMusic(on) {
    if (on) {
      const frame = createBackgroundMusicFrame();
      player.replaceChildren(frame);
      player.hidden = false;
    } else {
      player.hidden = true;
      player.replaceChildren();
    }
    music.setAttribute('aria-pressed', String(on));
    music.textContent = on ? '停止音樂' : '播放音樂';
  }

  stage.addEventListener('click', event => {
    if (!event.target.closest('.presentation-start')) return;
    running = true;
    startedAt = Date.now();
    seen = hasMemorySnapshot ? new Set(MEM.filter(entry => entry.cloud).map(entry => 'memory-' + entry.id)) : null;
    collectSlides();
    regular = [...slides.keys()];
    toggleFullscreen();
    if (location.protocol !== 'file:') setMusic(true);
    pause.disabled = next.disabled = false;
    music.disabled = location.protocol === 'file:';
    $('summary', controls).focus();
    welcome();
    schedule();
  });

  $('#presentation-fullscreen').onclick = toggleFullscreen;
  next.onclick = advance;
  pause.onclick = () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? '繼續輪播' : '暫停輪播';
    schedule();
  };
  music.onclick = () => setMusic(player.hidden);
  live.onclick = () => {
    livePaused = !livePaused;
    live.setAttribute('aria-pressed', String(livePaused));
    live.textContent = livePaused ? '恢復新投稿上屏' : '暫停新投稿上屏';
    if (!livePaused) {
      for (const [id, announced] of pending) {
        if (!announced) floatNote();
        pending.set(id, true);
      }
    }
  };
  $('#presentation-show-qr').onchange = event => { qr.hidden = !event.target.checked; };
  qrSize.onchange = () => { root.dataset.qrSize = qrSize.value; };
  qrSide.onchange = () => { root.dataset.qrSide = qrSide.value; };
  document.addEventListener('visibilitychange', schedule);

  function route(active) {
    if (active === !root.hidden) return;
    root.hidden = !active;
    document.body.classList.toggle('presentation-active', active);
    if (active) {
      $('button#music-close').click();
      $$('dialog[open]').forEach(dialog => dialog.close());
      welcome();
      $('.presentation-start', stage).focus({preventScroll: true});
    } else {
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
      running = paused = false;
      pause.setAttribute('aria-pressed', 'false');
      pause.textContent = '暫停輪播';
      pause.disabled = next.disabled = music.disabled = true;
      controls.open = false;
      current = null;
      regular = [];
      pending.clear();
      notes.replaceChildren();
      setMusic(false);
      schedule();
      $('#presentation-entry').focus({preventScroll: true});
    }
  }

  return {route, sync};
})();
