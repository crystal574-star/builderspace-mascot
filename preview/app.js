(function () {
  'use strict';
  const model = window.MascotFace;
  const $ = id => document.getElementById(id);
  const canvas = $('face');
  const ctx = canvas.getContext('2d');
  if (!ctx) { $('notice').textContent = '浏览器未能创建绘图画布，请尝试更新后的浏览器。'; return; }
  const animator = new model.Animator('idle');
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mediaQuery.matches;
  let stateId = 'idle';
  let clock = 0;
  let previousFrame = null;
  let paused = false;
  let cycling = false;
  let cycleStarted = 0;
  let blinkStarted = -Infinity;
  let nextBlink = 2300;
  let blinkNumber = 0;
  let pointer = null;
  let gaze = { x: 0, y: 0 };
  let fpsFrames = 0;
  let fpsStarted = null;

  const icons = {
    idle: '<path d="M5 8v5m8-5v5m-7 4q3 2 6 0"/>',
    listening: '<path d="M5 6v7m8-7v7"/><ellipse cx="9" cy="17" rx="1.8" ry="2"/>',
    working: '<path d="M3 9h4m4 0h4m-9 7h.01m3 0h.01m3 0h.01"/>',
    waiting: '<path d="M4 6h3m5 3h3M5 10v3m8-1v3m-6 3h4"/>',
    done: '<path d="M3 11q2-5 4 0m4 0q2-5 4 0M6 16q3 4 6 0"/>',
    failed: '<path d="m3 7 4 2m5 0 4-2M5 11v2m9-2v3m-7 5q3-3 6 0"/>',
    offline: '<path d="M3 12h4m4 0h4m-7 5h3"/>'
  };
  const buttons = new Map();
  for (const [index, state] of model.states.entries()) {
    const button = document.createElement('button');
    button.className = 'state-button';
    button.type = 'button';
    button.dataset.state = state.id;
    button.style.setProperty('--state-color', state.color);
    button.setAttribute('aria-label', `${index + 1} ${state.label} ${state.id}`);
    button.setAttribute('aria-pressed', String(state.id === stateId));
    button.innerHTML = `<span class="state-face" aria-hidden="true"><svg viewBox="0 0 18 23">${icons[state.id]}</svg></span><span><b>${state.label}</b><small>${state.id}</small></span><kbd aria-hidden="true">${index + 1}</kbd>`;
    button.addEventListener('click', () => select(state.id));
    buttons.set(state.id, button);
    $('states').append(button);
  }

  function select(id) {
    const state = animator.setState(id, clock, reduced || paused ? 0 : 420);
    stateId = state.id;
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === stateId));
    $('state-name').textContent = state.label;
    $('state-code').textContent = state.id;
    $('state-description').textContent = state.description;
    $('detail-dot').style.background = state.color;
    $('screen').dataset.state = state.id;
    canvas.setAttribute('aria-label', `${state.label}表情：${state.description}`);
    document.title = `${state.label} · BuilderSpace 表情实验室`;
    cycleStarted = clock;
  }

  function updateMotionLabel() {
    const hasMovement = $('auto-blink').checked || $('auto-look').checked || $('follow-pointer').checked;
    $('motion-status').textContent = paused ? '动画已暂停' : hasMovement ? '自然动作已开启' : '静态表情预览';
  }
  function triggerBlink() {
    if (paused) return;
    blinkStarted = clock;
    nextBlink = clock + 3500;
  }
  $('blink-now').addEventListener('click', triggerBlink);
  for (const id of ['auto-blink', 'auto-look', 'follow-pointer']) $(id).addEventListener('change', () => {
    if (id === 'auto-blink') { blinkStarted = -Infinity; nextBlink = clock + 2300; }
    updateMotionLabel();
  });
  $('pause').addEventListener('click', () => {
    paused = !paused;
    $('pause').textContent = paused ? '继续动画' : '暂停动画';
    $('pause').setAttribute('aria-pressed', String(paused));
    $('blink-now').disabled = paused;
    updateMotionLabel();
  });
  $('cycle').addEventListener('click', () => {
    cycling = !cycling;
    cycleStarted = clock;
    $('cycle').setAttribute('aria-pressed', String(cycling));
    $('cycle-label').textContent = cycling ? '停止自动演示' : '自动演示七态';
    $('cycle').querySelector('.play-symbol').textContent = cycling ? '■' : '▶';
  });
  canvas.addEventListener('pointermove', event => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: model.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), y: model.clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1) };
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  window.addEventListener('blur', () => { pointer = null; });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('input, select, textarea, [contenteditable]')) return;
    if (/^[1-7]$/.test(event.key)) { event.preventDefault(); select(model.states[Number(event.key) - 1].id); }
    // Space retains normal keyboard activation when a control has focus.
    if (event.code === 'Space' && !event.target.closest('button, a')) { event.preventDefault(); triggerBlink(); }
  });
  $('fullscreen').disabled = !document.fullscreenEnabled;
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('screen').requestFullscreen();
    } catch { $('notice').textContent = '浏览器没有开启全屏；你仍然可以在当前页面查看表情。'; }
  });
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(model.exportParameters(), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'builderspace-face-parameters-v1.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('notice').textContent = '已导出表情参数，可交给固件负责人参考；它不是屏幕接线配置或设备协议。';
  });

  function applyMotionPreference() {
    reduced = mediaQuery.matches;
    $('auto-blink').checked = !reduced;
    $('auto-look').checked = !reduced;
    $('follow-pointer').checked = !reduced;
    blinkStarted = -Infinity;
    gaze = { x: 0, y: 0 };
    animator.setState(stateId, clock, 0);
    if (reduced) $('notice').textContent = '已遵循系统“减少动态效果”设置。你可以自行开启动作，或点击“眨一下眼”。';
    else if ($('notice').textContent.startsWith('已遵循系统')) $('notice').textContent = '';
    updateMotionLabel();
  }
  mediaQuery.addEventListener('change', applyMotionPreference);
  applyMotionPreference();
  document.addEventListener('visibilitychange', () => { previousFrame = null; fpsStarted = null; fpsFrames = 0; });

  function frame(timestamp) {
    const delta = previousFrame === null ? 0 : Math.min(100, timestamp - previousFrame);
    previousFrame = timestamp;
    if (!paused && !document.hidden) clock += delta;
    if (cycling && !paused && clock - cycleStarted >= 5000) {
      const current = model.states.findIndex(state => state.id === stateId);
      select(model.states[(current + 1) % model.states.length].id);
    }
    if (!paused) {
      if ($('auto-blink').checked && clock >= nextBlink) {
        blinkStarted = clock;
        blinkNumber++;
        nextBlink = clock + (blinkNumber % 5 === 0 ? 340 : 3100 + blinkNumber % 3 * 620);
      }
      const target = $('follow-pointer').checked && pointer ? pointer : $('auto-look').checked ? model.naturalGaze(clock) : { x: 0, y: 0 };
      const amount = 1 - Math.exp(-delta / 115);
      gaze = { x: gaze.x + (target.x - gaze.x) * amount, y: gaze.y + (target.y - gaze.y) * amount };
    }
    model.draw(ctx, animator.sample(clock), { now: reduced ? 0 : clock, gaze, blink: model.blinkAmount(clock - blinkStarted) });
    if (fpsStarted === null) fpsStarted = timestamp;
    fpsFrames++;
    if (timestamp - fpsStarted >= 1000) {
      $('fps').textContent = String(Math.round(fpsFrames * 1000 / (timestamp - fpsStarted)));
      fpsStarted = timestamp;
      fpsFrames = 0;
    }
    requestAnimationFrame(frame);
  }
  select('idle');
  requestAnimationFrame(frame);
})();
