/* 电脑预览的界面和时间调度。脸怎么画、怎么动都在 face-model.js；这里没有网络请求，也不接 echo-agent。 */
(function () {
  'use strict';
  const F = window.EchoBotFace;
  const $ = id => document.getElementById(id);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const options = { ...F.DEFAULTS, blink: !reduced, glance: !reduced, breath: !reduced };
  let follow = !reduced, cycleTimer = null;
  const animator = new F.BotAnimator(options);
  const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const env = { px: 2, createCanvas };

  const screen = $('screen'), sctx = screen.getContext('2d');
  const actual = $('actual'), actx = actual.getContext('2d');
  const MODES = [['bot', '整只 Bot'], ['face', '脸铺满屏幕']];
  const WAITS = [['wave', '招手'], ['bang', '感叹号']];
  const EFFECTS = [['confetti', '撒彩屑'], ['stars', '冒星星'], ['check', '对勾']];
  const thumbs = [];

  /** 一格缩略图：小画布上画一只不动的 Bot。 */
  function thumb(canvas, overrides) {
    const draw = () => {
      const ctx = canvas.getContext('2d'), side = canvas.width;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, side, side);
      const scene = F.staticScene({ ...options, state: 'idle', mode: 'bot', ...overrides() });
      // 留出手、感叹号、z、天线的地方
      const size = side * 0.7;
      F.drawBot(ctx, scene, side * 0.1, side * 0.24, size, { px: 1, createCanvas });
    };
    thumbs.push(draw);
    return draw;
  }
  function optionButton(group, value, label, extra) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'option'; button.dataset.group = group; button.dataset.value = value;
    const canvas = createCanvas(128, 128);
    button.append(canvas);
    const text = document.createElement('span'); text.textContent = label; button.append(text);
    if (extra && extra.code) { const small = document.createElement('small'); small.textContent = extra.code; button.append(small); }
    if (extra && extra.proposed) { const dot = document.createElement('i'); dot.className = 'dot'; dot.title = '提议，等你确认'; button.append(dot); button.setAttribute('aria-label', `${label}（提议，等你确认）`); }
    return { button, canvas };
  }
  function segment(group, value, label) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'segment'; button.dataset.group = group; button.dataset.value = value; button.textContent = label;
    return button;
  }

  F.STATES.forEach((state, index) => {
    const { button, canvas } = optionButton('state', state.id, state.label, { code: String(index + 1), proposed: state.proposed });
    thumb(canvas, () => ({ state: state.id }));
    $('states').append(button);
  });
  F.STYLE_ORDER.forEach(id => {
    const { button, canvas } = optionButton('style', id, F.STYLES[id].name);
    thumb(canvas, () => ({ style: id }));
    $('styles').append(button);
  });
  F.RESTING.forEach(name => {
    const { button, canvas } = optionButton('face', name, F.FACE_NAMES[name]);
    thumb(canvas, () => ({ face: name }));
    $('faces').append(button);
  });
  F.SHAPE_ORDER.forEach(id => {
    const { button, canvas } = optionButton('shape', id, F.SHAPES[id].name);
    thumb(canvas, () => ({ shape: id }));
    $('shapes').append(button);
  });
  Object.entries(F.TONES).forEach(([id, tones]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'swatch'; button.dataset.group = 'color'; button.dataset.value = id;
    button.setAttribute('aria-label', tones.name); button.title = tones.name;
    const chip = document.createElement('i'); chip.style.background = `linear-gradient(160deg, ${tones.light}, ${tones.base} 45%, ${tones.dark})`;
    button.append(chip); $('colors').append(button);
  });
  MODES.forEach(([value, label]) => $('modes').append(segment('mode', value, label)));
  WAITS.forEach(([value, label]) => $('waits').append(segment('waitLook', value, label)));
  EFFECTS.forEach(([value, label]) => $('effects').append(segment('doneEffect', value, label)));
  const brand = thumb($('brand-bot'), () => ({}));

  function refresh() {
    const applied = animator.set(options);
    Object.assign(options, applied);
    const state = F.lookupState(options.state), tones = F.tonesOf(options.color);
    document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(options[button.dataset.group] === button.dataset.value)));
    const root = document.documentElement.style;
    root.setProperty('--accent', tones.base); root.setProperty('--accent-light', tones.light); root.setProperty('--accent-dark', tones.dark);
    $('state-name').textContent = state.label;
    $('state-code').textContent = state.id;
    $('state-origin').textContent = state.proposed ? '提议 · 等你确认' : state.origin;
    $('state-origin').dataset.kind = state.proposed ? 'proposed' : 'original';
    $('state-description').textContent = state.description;
    $('face-key').textContent = F.lookKey(F.lookNow(options));
    $('color-name').textContent = `${tones.name} ${tones.base}`;
    $('shape-group').hidden = options.mode === 'face';
    screen.setAttribute('aria-label', `玩偶屏幕：${state.label}，${F.STYLES[options.style].name}样式`);
    document.title = `${state.label} · BuilderSpace 吉祥物`;
    thumbs.forEach(draw => draw());
  }
  function choose(group, value) {
    options[group] = value;
    if (group === 'state' && cycleTimer) scheduleCycle();
    refresh();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-group]');
    if (button) choose(button.dataset.group, button.dataset.value);
  });
  for (const id of ['blink', 'glance', 'breath']) {
    $(id).checked = options[id];
    $(id).addEventListener('change', event => { options[id] = event.target.checked; refresh(); });
  }
  $('follow').checked = follow;
  $('follow').addEventListener('change', event => { follow = event.target.checked; if (!follow) animator.lookAt(null); });

  // 看鼠标：照原版，往光标那边挪，横 2.6、竖 1.9 格，离得近时按距离 / 120 缩小
  screen.addEventListener('pointermove', event => {
    if (!follow) return;
    const rect = screen.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * F.SCREEN.width, y = (event.clientY - rect.top) / rect.height * F.SCREEN.height;
    const dx = x - 160, dy = y - (options.mode === 'face' ? 120 : F.BOT_BOX.y + F.BOT_BOX.size / 2), distance = Math.hypot(dx, dy);
    if (distance < 0.5) return;
    const f = Math.min(1, distance / 120);
    animator.lookAt({ x: dx / distance * 2.6 * f, y: dy / distance * 1.9 * f });
  });
  screen.addEventListener('pointerleave', () => animator.lookAt(null));
  screen.addEventListener('pointerdown', () => animator.press());

  function scheduleCycle() {
    clearInterval(cycleTimer);
    cycleTimer = setInterval(() => {
      const index = F.STATES.findIndex(state => state.id === options.state);
      options.state = F.STATES[(index + 1) % F.STATES.length].id;
      refresh();
    }, 4000);
  }
  $('cycle').addEventListener('click', () => {
    if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; } else scheduleCycle();
    $('cycle').setAttribute('aria-pressed', String(Boolean(cycleTimer)));
    $('cycle-label').textContent = cycleTimer ? '停止演示' : '自动演示';
  });
  $('pause').addEventListener('click', () => {
    animator.paused = !animator.paused;
    $('pause').setAttribute('aria-pressed', String(animator.paused));
    $('pause').textContent = animator.paused ? '继续' : '暂停';
  });
  $('blink-now').addEventListener('click', () => animator.blinkNow());
  $('fullscreen').addEventListener('click', () => {
    const frame = $('frame');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => { $('notice').textContent = '这个浏览器不允许全屏。'; });
    else $('notice').textContent = '这个浏览器不支持全屏。';
  });
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(F.exportParameters(options), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'builderspace-face-parameters.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    $('notice').textContent = '已导出 builderspace-face-parameters.json。';
  });
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < F.STATES.length) { choose('state', F.STATES[index].id); return; }
    if (event.key === ' ' && !event.target.closest('button, input, a')) { event.preventDefault(); animator.blinkNow(); }
  });

  let frames = 0, since = performance.now();
  function frame(now) {
    const scene = animator.frame(now / 1000);
    sctx.setTransform(env.px, 0, 0, env.px, 0, 0);
    F.draw(sctx, scene, env);
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.drawImage(screen, 0, 0, actual.width, actual.height);
    frames++;
    if (now - since >= 1000) { $('fps').textContent = String(Math.round(frames * 1000 / (now - since))); frames = 0; since = now; }
    requestAnimationFrame(frame);
  }
  refresh();
  brand();
  requestAnimationFrame(frame);
})();
