/*
 * BuilderSpace 玩偶屏幕表情模型：照 EchoAgent 刘海 Bot 的脸、样式、身形、配色和动作移植。
 * 来源见 SOURCE；数值与规则取自那几份文件，画法改成 Canvas。纯数值与绘制，无 DOM、网络和外部资源依赖。
 * 坐标沿用原版的 40×40 格（y 朝下）。标了 proposed 的状态不是原版内容，是本项目的提议，等用户确认。
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
  const SOURCE = Object.freeze({
    repository: 'EdwinjJ1/voice-agent',
    commit: '5f4735aa22a9f20a9b21c42320f77f0396b4fdc3',
    files: Object.freeze(['Sources/EchoTools/BotFaceGeometry.swift', 'Sources/EchoTools/NotchStyle.swift',
      'Sources/VoiceAgent/NotchBotView.swift', 'docs/notch-bots.md'])
  });

  // ---- SVG 路径子集（M m L l H h V v Q q T t Z z），数字可连写成「3.2-5」「-.4」----
  function tokenize(d) {
    const tokens = [];
    let buffer = '';
    const flush = () => { if (buffer !== '' && Number.isFinite(Number(buffer))) tokens.push(Number(buffer)); buffer = ''; };
    for (const ch of d) {
      if (/[a-zA-Z]/.test(ch)) { flush(); tokens.push(ch); }
      else if (ch === '-') { flush(); buffer = '-'; }
      else if (ch === '.') { if (buffer.includes('.')) flush(); buffer += ch; }
      else if (/[0-9]/.test(ch)) buffer += ch;
      else flush();
    }
    flush();
    return tokens;
  }
  function parsePath(d) {
    const tokens = tokenize(d), out = [];
    let i = 0, command = 'M', cx = 0, cy = 0, sx = 0, sy = 0, control = null;
    const isNumber = () => i < tokens.length && typeof tokens[i] === 'number';
    const number = () => (isNumber() ? tokens[i++] : 0);
    while (i < tokens.length) {
      if (typeof tokens[i] === 'string') {
        command = tokens[i++];
        if (command === 'z' || command === 'Z') { out.push(['Z']); cx = sx; cy = sy; control = null; continue; }
      }
      if (!isNumber()) continue;
      const relative = command === command.toLowerCase();
      const ox = relative ? cx : 0, oy = relative ? cy : 0;
      const upper = command.toUpperCase();
      if (upper === 'M') {
        cx = ox + number(); cy = oy + number(); out.push(['M', cx, cy]);
        sx = cx; sy = cy; command = relative ? 'l' : 'L'; control = null;
      } else if (upper === 'L' || upper === 'H' || upper === 'V') {
        if (upper !== 'V') cx = ox + number();
        if (upper !== 'H') cy = oy + number();
        out.push(['L', cx, cy]); control = null;
      } else if (upper === 'Q') {
        const qx = ox + number(), qy = oy + number(), ex = ox + number(), ey = oy + number();
        out.push(['Q', qx, qy, ex, ey]); control = [qx, qy]; cx = ex; cy = ey;
      } else if (upper === 'T') {
        const c = control ? [2 * cx - control[0], 2 * cy - control[1]] : [cx, cy];
        const ex = ox + number(), ey = oy + number();
        out.push(['Q', c[0], c[1], ex, ey]); control = c; cx = ex; cy = ey;
      } else i++;
    }
    return out;
  }
  const ellipse = (cx, cy, rx, ry = rx) => ['E', cx, cy, rx, ry];
  const roundRect = (x, y, w, h, r) => ['R', x, y, w, h, r];
  function trace(ctx, path) {
    for (const s of path) {
      if (s[0] === 'M') ctx.moveTo(s[1], s[2]);
      else if (s[0] === 'L') ctx.lineTo(s[1], s[2]);
      else if (s[0] === 'Q') ctx.quadraticCurveTo(s[1], s[2], s[3], s[4]);
      else if (s[0] === 'C') ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
      else if (s[0] === 'Z') ctx.closePath();
      else if (s[0] === 'E') { ctx.moveTo(s[1] + s[3], s[2]); ctx.ellipse(s[1], s[2], s[3], s[4], 0, 0, TAU); ctx.closePath(); }
      else if (s[0] === 'R') {
        const [, x, y, w, h, radius] = s, r = Math.min(radius, w / 2, h / 2);
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      }
    }
  }

  // ---- 脸：眼睛 × 嘴 × 配饰（BotFaceGeometry.swift）----
  const EYES = Object.freeze(['dot', 'big', 'arc', 'line', 'squint', 'ring', 'none']);
  const MOUTHS = Object.freeze(['smile', 'tiny', 'w', 'open', 'o', 'smirk', 'none']);
  const EXTRAS = Object.freeze(['none', 'shades', 'glasses', 'brows', 'blush']);
  const look = (eyes, mouth, extra = 'none') => Object.freeze({ eyes, mouth, extra });
  const lookKey = l => `${l.eyes}.${l.mouth}.${l.extra}`;
  function lookFromKey(key) {
    const parts = String(key).split('.');
    if (parts.length !== 3 || !EYES.includes(parts[0]) || !MOUTHS.includes(parts[1]) || !EXTRAS.includes(parts[2])) return null;
    return look(parts[0], parts[1], parts[2]);
  }
  const FACES = Object.freeze({
    calm: look('dot', 'tiny'), smile: look('dot', 'smile'), cat: look('dot', 'w'), happy: look('arc', 'w'),
    glad: look('arc', 'open'), squint: look('squint', 'w'), wide: look('big', 'smile'), cool: look('none', 'smirk', 'shades'),
    keen: look('dot', 'w', 'brows'), wow: look('ring', 'o'), sleepy: look('line', 'tiny')
  });
  const FACE_NAMES = Object.freeze({ calm: '平静', smile: '微笑', cat: '猫嘴', happy: '弯眼开心', glad: '大笑', squint: '挤眼',
    wide: '睁大眼', cool: '墨镜', keen: '认真', wow: '哦', sleepy: '困' });
  const RESTING = Object.freeze(['calm', 'smile', 'cat', 'happy', 'glad', 'squint', 'wide', 'cool']);
  /** 字串落到一个不变的整数：按 UTF-16 码元，乘 31 累加，32 位回绕。 */
  function seed(text) {
    let s = 0;
    for (let i = 0; i < text.length; i++) s = (Math.imul(s, 31) + text.charCodeAt(i)) >>> 0;
    return s;
  }
  function lookFor(id, mood = 'rest') {
    if (mood === 'working') return FACES.keen;
    if (mood === 'waiting') return FACES.wow;
    if (mood === 'asleep') return FACES.sleepy;
    if (mood === 'done') return FACES.glad;
    return FACES[RESTING[seed(id) % RESTING.length]];
  }
  const blinkInterval = id => (3200 + (seed(id) % 2800)) / 1000;
  const EYE_LEFT = 12.6, EYE_RIGHT = 27.4, EYE_Y = 18.6;
  const EYE_PATHS = { arc: 'M9.6 20q3-4 6 0M24.4 20q3-4 6 0', line: 'M9.8 18.8h5.6M24.6 18.8h5.6', squint: 'M10 15.8l5 2.8-5 2.8M30 15.8l-5 2.8 5 2.8' };
  const MOUTH_PATHS = { tiny: 'M19 24.4h2', smile: 'M17 23.4q3 3.2 6 0', w: 'M15.9 22.8q0 3.2 2.05 3.2t2.05-2.6q0 2.6 2.05 2.6t2.05-3.2',
    open: 'M17.2 23.2h5.6q-.4 3.6-2.8 3.6t-2.8-3.6z', smirk: 'M16.6 24.6q3.6 1.6 6.8-1.6' };
  const EXTRA_PATHS = { brows: 'M9.2 13.2l6 2.2M30.8 13.2l-6 2.2', glasses: 'M17.4 18.2q2.6-1.6 5.2 0M7.8 17.6l-3 -1.2M32.2 17.6l3 -1.2',
    shades: 'M17.6 16.4h4.8M7 16.4l-3.2 -1M33 16.4l3.2 -1' };
  const SHADE_LENSES = ['M7 15h10.6v3.2q0 4.4-5.3 4.4t-5.3-4.4z', 'M22.4 15h10.6v3.2q0 4.4-5.3 4.4t-5.3-4.4z'];
  const SHADE_GLINTS = 'M9.2 17.2l2.4-1M24.6 17.2l2.4-1';
  /** 一张脸的所有笔画，顺序即从下往上叠。layer: face 跟着脸动；eyes 眨眼时缩；overlay 是配饰。ink: line 白线，dark 墨色。 */
  function marks(l, line) {
    const out = [];
    const add = (layer, path, o) => out.push({ layer, path, fill: o.fill || null, stroke: o.stroke || null, width: o.width || 0, opacity: o.opacity === undefined ? 1 : o.opacity });
    if (l.extra === 'blush') add('face', [ellipse(9.6, 24, 3, 1.9), ellipse(30.4, 24, 3, 1.9)], { fill: 'line', opacity: 0.38 });
    if (l.mouth === 'o') add('face', [ellipse(20, 25, 1.7)], { stroke: 'line', width: line });
    else if (l.mouth === 'open') add('face', parsePath(MOUTH_PATHS.open), { fill: 'line', stroke: 'line', width: 1 });
    else if (MOUTH_PATHS[l.mouth]) add('face', parsePath(MOUTH_PATHS[l.mouth]), { stroke: 'line', width: line });
    const eyes = l.extra === 'shades' ? 'none' : l.eyes;
    if (eyes === 'dot') add('eyes', [ellipse(EYE_LEFT, EYE_Y, 2.2, 2.8), ellipse(EYE_RIGHT, EYE_Y, 2.2, 2.8)], { fill: 'line' });
    else if (eyes === 'big') {
      add('eyes', [ellipse(14, 18.4, 5, 6.2), ellipse(26, 18.4, 5, 6.2)], { fill: 'line' });
      add('eyes', [ellipse(15, 19.4, 2.6), ellipse(27, 19.4, 2.6)], { fill: 'dark' });
    } else if (eyes === 'ring') add('eyes', [ellipse(EYE_LEFT, EYE_Y, 2.5), ellipse(EYE_RIGHT, EYE_Y, 2.5)], { stroke: 'line', width: line });
    else if (EYE_PATHS[eyes]) add('eyes', parsePath(EYE_PATHS[eyes]), { stroke: 'line', width: line });
    if (l.extra === 'shades') {
      for (const lens of SHADE_LENSES) add('overlay', parsePath(lens), { fill: 'dark', stroke: 'line', width: 1.3 });
      add('overlay', parsePath(SHADE_GLINTS), { stroke: 'line', width: 1.1, opacity: 0.85 });
      add('overlay', parsePath(EXTRA_PATHS.shades), { stroke: 'line', width: 1.5 });
    } else if (l.extra === 'glasses') {
      add('overlay', [ellipse(EYE_LEFT, EYE_Y, 4.9), ellipse(EYE_RIGHT, EYE_Y, 4.9)], { stroke: 'line', width: 1.5 });
      add('overlay', parsePath(EXTRA_PATHS.glasses), { stroke: 'line', width: 1.5 });
    } else if (l.extra === 'brows') add('overlay', parsePath(EXTRA_PATHS.brows), { stroke: 'line', width: line });
    return out;
  }

  // ---- 样式、身形、配色（NotchStyle.swift）----
  const STYLES = Object.freeze({
    toy: Object.freeze({ id: 'toy', name: '潮玩', english: 'Toy', burst: 'POP!', motion: Object.freeze({ squish: 0.42, breath: 0.55, line: 1.12, blush: 0 }) }),
    sticker: Object.freeze({ id: 'sticker', name: '贴纸', english: 'Sticker', burst: 'SLAP!', motion: Object.freeze({ squish: 0.7, breath: 0.8, line: 1.05, blush: 0.3 }) }),
    jelly: Object.freeze({ id: 'jelly', name: '软糖', english: 'Jelly', burst: 'BOING!', motion: Object.freeze({ squish: 1, breath: 1, line: 1, blush: 0.5 }) }),
    visor: Object.freeze({ id: 'visor', name: '屏幕脸', english: 'Visor', burst: 'BZZT!', motion: Object.freeze({ squish: 0.35, breath: 0.5, line: 0.95, blush: 0 }) }),
    pixel: Object.freeze({ id: 'pixel', name: '像素', english: 'Pixel', burst: 'BLIP!', motion: Object.freeze({ squish: 0, breath: 0, line: 1, blush: 0 }) })
  });
  const STYLE_ORDER = Object.freeze(['toy', 'sticker', 'jelly', 'visor', 'pixel']);
  const faceLine = (style, size) => (size < 30 ? 2.7 : 2.2) * STYLES[style].motion.line;
  const SHAPES = Object.freeze({
    circle: { id: 'circle', name: '圆', top: 1, box: { x: 1, y: 1, w: 38, h: 38 }, path: [ellipse(20, 20, 19)] },
    squircle: { id: 'squircle', name: '方糖', top: 1.5, box: { x: 1.5, y: 1.5, w: 37, h: 37 }, path: [roundRect(1.5, 1.5, 37, 37, 14)] },
    bean: { id: 'bean', name: '豆子', top: 3.5, box: { x: -1, y: 3.5, w: 42, h: 35 }, path: [ellipse(20, 21, 21, 17.5)] },
    dome: { id: 'dome', name: '团子', top: 2, box: { x: 2.5, y: 2, w: 35, h: 36.5 },
      path: [['M', 2.5, 30.5], ['C', 2.5, 12, 9.5, 2, 20, 2], ['C', 30.5, 2, 37.5, 12, 37.5, 30.5], ['C', 37.5, 35.5, 34.9, 38.5, 30, 38.5],
        ['L', 10, 38.5], ['C', 5.1, 38.5, 2.5, 35.5, 2.5, 30.5], ['Z']] }
  });
  const SHAPE_ORDER = Object.freeze(['circle', 'squircle', 'bean', 'dome']);
  const shapeOf = (id, style = 'toy') => SHAPE_ORDER[(((seed(id) >>> 5) % 4) + Math.max(0, STYLE_ORDER.indexOf(style))) % 4];
  const TONES = Object.freeze({
    violet: { name: '紫', light: '#E3D5FF', base: '#8B5CF6', dark: '#5B21B6' },
    navy: { name: '蓝', light: '#C3D0FF', base: '#4C6EF5', dark: '#1E3A8A' },
    orange: { name: '橙', light: '#FFE0B8', base: '#FB8C3A', dark: '#C2410C' },
    teal: { name: '青', light: '#C4F4FA', base: '#22B8CC', dark: '#0E7490' },
    rose: { name: '玫红', light: '#FFD0E5', base: '#EC4899', dark: '#A3144F' },
    forest: { name: '绿', light: '#CFF7DF', base: '#2DB673', dark: '#1F5C3F' },
    ink: { name: '墨', light: '#E4E4E7', base: '#52525B', dark: '#18181B' },
    burgundy: { name: '酒红', light: '#FFD3DC', base: '#C7375A', dark: '#7A1F33' }
  });
  const tonesOf = color => TONES[color] || TONES.violet;
  const DARK = '#18181B';

  // ---- 动作（NotchMotion）----
  class Spring {
    constructor(x = 0, k = 240, d = 19) { this.x = x; this.v = 0; this.target = x; this.k = k; this.d = d; }
    step(dt = 1 / 60) { this.v += (this.k * (this.target - this.x) - this.d * this.v) * dt; this.x += this.v * dt; }
  }
  function simulate(spring, duration, events = []) {
    const pending = events.slice().sort((a, b) => a.at - b.at), values = [];
    const frames = Math.round(duration * 60);
    for (let frame = 0; frame <= frames; frame++) {
      const t = frame / 60;
      while (pending.length && pending[0].at <= t + 1e-9) pending.shift().change(spring);
      values.push(spring.x);
      spring.step();
    }
    return values;
  }
  const breathOf = id => { const s = seed(id); return { period: 2.6 + (s % 9) / 10, phase: (s % 628) / 100 }; };
  function glances(id, count = 8) {
    let state = (seed(id) | 1) >>> 0;
    const random = () => {
      state = (state ^ (state << 13)) >>> 0; state = (state ^ (state >>> 17)) >>> 0; state = (state ^ (state << 5)) >>> 0;
      return (state % 10000) / 10000;
    };
    const stops = [];
    let t = 0;
    for (let i = 0; i < count; i++) {
      const r = random();
      stops.push({ at: t, x: r < 0.35 ? -2.2 : r < 0.7 ? 2.2 : 0, y: (random() - 0.5) * 1.2 });
      t += 1.6 + random() * 2.6;
    }
    return { stops, duration: t };
  }
  const NOD_PERIOD = 1 / 1.35;
  /** 眨眼时眼睛竖向缩到多少：p 是合眼那 0.16 秒里走到哪（0–1），之外是 1。 */
  const blinkScale = p => (p <= 0 || p >= 1 ? 1 : 1 - 0.88 * Math.sin(Math.PI * p));
  const BLINK_SECONDS = 0.16;

  // ---- 玩偶的状态：协议七态 + 原版多出来的打瞌睡 ----
  const STATES = Object.freeze([
    { id: 'idle', label: '待机', mood: 'rest', origin: '原版「平时」', description: '用你选的那张平时脸，眨眼、张望、轻轻呼吸。' },
    { id: 'listening', label: '正在听', mood: 'rest', look: look('big', 'tiny'), proposed: true, origin: '提议', description: '原版没有这一态。提议用原版零件拼：大眼睛加小横嘴。' },
    { id: 'working', label: '在干活', mood: 'working', origin: '原版「在干活」', description: '认真脸（皱眉）并且点头，每秒 1.35 下。' },
    { id: 'waiting', label: '等你确认', mood: 'waiting', origin: '原版「等你点头」', description: '圈眼睛、「哦」嘴，招手或头顶冒感叹号。确认仍在电脑上做。' },
    { id: 'done', label: '做完了', mood: 'done', origin: '原版「刚做完」', description: '弯眼大笑，跳一下，放一个完成特效。' },
    { id: 'failed', label: '出错了', mood: 'rest', look: look('squint', 'tiny'), proposed: true, origin: '提议', description: '原版没有这一态。提议用原版零件拼：挤眼加小横嘴。' },
    { id: 'offline', label: '离线', mood: 'rest', look: look('line', 'none'), dim: 0.5, proposed: true, origin: '提议', description: '原版没有这一态。提议：横线眼、整体调暗，不冒 z，和打瞌睡区分开。' },
    { id: 'asleep', label: '打瞌睡', mood: 'asleep', extra: true, origin: '原版「睡着」', description: '不属于协议七态。原版闲 3 分钟后：横线眼、下沉、歪头、冒 z。' }
  ].map(Object.freeze));
  const STATE_BY_ID = Object.freeze(Object.fromEntries(STATES.map(s => [s.id, s])));
  const PROTOCOL_STATES = Object.freeze(STATES.filter(s => !s.extra).map(s => s.id));
  /** 不认识的状态按离线处理，不能显示成成功。 */
  const lookupState = id => STATE_BY_ID[id] || STATE_BY_ID.offline;

  const BOT_ID = 'builderspace';
  const DEFAULTS = Object.freeze({
    state: 'idle', style: 'toy', face: RESTING[seed(BOT_ID) % RESTING.length], color: 'violet', shape: shapeOf(BOT_ID),
    mode: 'bot', waitLook: 'wave', doneEffect: 'confetti', blink: true, glance: true, breath: true
  });
  function normalize(options) {
    const o = { ...DEFAULTS, ...options };
    o.state = lookupState(o.state).id;
    if (!STYLES[o.style]) o.style = DEFAULTS.style;
    if (!FACES[o.face]) o.face = DEFAULTS.face;
    if (!TONES[o.color]) o.color = DEFAULTS.color;
    if (!SHAPES[o.shape]) o.shape = DEFAULTS.shape;
    if (o.mode !== 'face') o.mode = 'bot';
    if (o.waitLook !== 'bang') o.waitLook = 'wave';
    if (!['confetti', 'stars', 'check'].includes(o.doneEffect)) o.doneEffect = 'confetti';
    return o;
  }
  /** 这会儿画哪张脸：待机是选的那张；提议的三态用各自拼的；别的照原版按状态换。 */
  function lookNow(options) {
    const state = lookupState(options.state);
    if (state.look) return state.look;
    return state.mood === 'rest' ? FACES[options.face] || FACES[DEFAULTS.face] : lookFor(BOT_ID, state.mood);
  }

  const STEP = 1 / 60;
  const PIXEL_CELL = 64 / 37; // 整只 Bot 时像素样式一格多大（40 格里）
  const EFFECT_UNIT = 0.55; // 特效的尺寸单位（40 格里）。原版按刘海里的小脸定，这里按 320×240 的屏幕缩过
  class BotAnimator {
    constructor(options) {
      this.o = normalize(options);
      this.t = 0; this.last = null; this.acc = 0; this.paused = false;
      this.breath = breathOf(BOT_ID);
      this.blinkEvery = blinkInterval(BOT_ID);
      this.glancePlan = glances(BOT_ID);
      this.glancePhase = (seed(BOT_ID) % 1000) / 1000 * this.glancePlan.duration;
      this.lookX = new Spring(0, 70, 12); this.lookY = new Spring(0, 70, 12); this.turn = new Spring(0, 90, 12);
      this.squash = new Spring(0, 520, 13); this.mover = new Spring(0, 130, 11);
      this.pointer = null; this.events = []; this.particles = [];
      this.swapAt = -1; this.blinkAt = -1; this.rng = 0x9E3779B9;
    }
    random() {
      let s = this.rng; s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
      this.rng = s; return (s % 100000) / 100000;
    }
    set(patch) {
      const before = lookKey(lookNow(this.o)), previous = this.o.state;
      this.o = normalize({ ...this.o, ...patch });
      if (lookKey(lookNow(this.o)) !== before) this.swapAt = this.t;
      if (this.o.state !== previous) {
        this.events = []; this.particles = [];
        this.squash.v += 0.18;
        if (this.o.state === 'done') this.playDone();
      }
      return this.o;
    }
    /** 做完了：蹲一下、蹦起来、落地压扁并放特效。原版是从刘海里跳出来再跳回去，这里改成原地跳。 */
    playDone() {
      const t = this.t;
      this.events.push({ at: t, run: () => { this.squash.v += 0.22; } });
      this.events.push({ at: t + 0.14, run: () => { this.mover.v = -110; this.squash.v -= 4; } });
      this.events.push({ at: t + 0.46, run: () => { this.squash.v += 0.42; this.spawn(this.o.doneEffect); } });
    }
    blinkNow() { this.blinkAt = this.t; }
    /** 按一下：缩一下再弹回（原版的按压反馈）。 */
    press() { this.squash.v += 0.32; }
    /** 看向哪儿（40 格里的偏移），null 是没人理、改成张望。 */
    lookAt(target) { this.pointer = target; }
    spawn(kind) {
      const U = EFFECT_UNIT, tones = tonesOf(this.o.color), r = () => this.random();
      const ox = 20, oy = this.o.mode === 'face' ? 33 : 38;
      if (kind === 'confetti') {
        const colors = [tones.light, tones.base, tones.dark, '#FFFFFF', '#FFD43B'];
        for (let i = 0; i < 26; i++) {
          const angle = (-90 + (r() * 2 - 1) * 75) * Math.PI / 180, speed = (130 + r() * 160) * U;
          this.particles.push({ kind: 'confetti', x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rot: r() * TAU,
            spin: (r() * 2 - 1) * 7, w: (2.5 + r() * 2.5) * U, h: (1.5 + r() * 2) * U, round: r() < 0.3, color: colors[Math.floor(r() * colors.length)],
            age: 0, life: 1.1 + r() * 0.5 });
        }
      } else if (kind === 'stars') {
        const colors = ['#FFD43B', tones.base, '#FFB224', tones.light];
        for (let i = 0; i < 12; i++) {
          const angle = i / 12 * TAU, speed = (95 + r() * 85) * U;
          this.particles.push({ kind: 'star', x: ox, y: oy - 3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rot: r() * TAU, spin: (r() * 2 - 1) * 5,
            size: (5 + r() * 4.5) * U, color: colors[i % colors.length], age: 0, life: 0.85 + r() * 0.3 });
        }
        this.particles.push({ kind: 'ring', x: ox, y: oy - 3, color: tones.base, age: 0, life: 0.6 });
      } else {
        this.particles.push({ kind: 'check', x: this.o.mode === 'face' ? 34 : 42, y: this.o.mode === 'face' ? 12 : 8, color: tones.base, age: 0, life: 1.5 });
        this.particles.push({ kind: 'ring', x: ox, y: oy - 3, color: tones.base, age: 0, life: 0.6 });
      }
    }
    tick(dt) {
      this.t += dt;
      while (this.events.length && this.events[0].at <= this.t + 1e-9) this.events.shift().run();
      const state = lookupState(this.o.state);
      let x = 0, y = 0, degrees = 0;
      if (state.mood === 'asleep') { y = 0.8; degrees = -4; }
      else if (this.pointer) { x = this.pointer.x; y = this.pointer.y; degrees = x * 2.2; }
      else if (this.o.glance && !state.dim) { const g = this.glanceAt(this.t); x = g.x; y = g.y; degrees = g.x * 1.6; }
      this.lookX.target = x; this.lookY.target = y; this.turn.target = degrees;
      for (const spring of [this.lookX, this.lookY, this.turn, this.squash, this.mover]) spring.step(dt);
      const frames = dt * 60;
      for (const p of this.particles) {
        p.age += dt;
        if (p.kind === 'confetti') { p.vy += 450 * EFFECT_UNIT * dt; p.vx *= Math.pow(0.985, frames); }
        if (p.kind === 'star') { p.vx *= Math.pow(0.93, frames); p.vy *= Math.pow(0.93, frames); }
        if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; }
      }
      this.particles = this.particles.filter(p => p.age < p.life);
    }
    glanceAt(t) {
      const plan = this.glancePlan, at = (t + this.glancePhase) % plan.duration;
      let current = plan.stops[0];
      for (const stop of plan.stops) if (stop.at <= at) current = stop;
      return current;
    }
    /** now 以秒计。暂停时时间不走。 */
    frame(now) {
      if (this.last === null) this.last = now;
      const dt = this.paused ? 0 : clamp(now - this.last, 0, 0.25);
      this.last = now;
      this.acc += dt;
      while (this.acc >= STEP) { this.tick(STEP); this.acc -= STEP; }
      return this.scene();
    }
    scene() {
      const o = this.o, t = this.t, state = lookupState(o.state), style = STYLES[o.style], m = style.motion;
      const pixel = o.style === 'pixel', asleep = state.mood === 'asleep', working = state.mood === 'working', waiting = state.mood === 'waiting';
      const cell = o.mode === 'face' ? 1 : PIXEL_CELL, snap = v => (pixel ? Math.round(v / cell) * cell : v);
      const period = this.breath.period * (asleep ? 1.6 : 1), wave = Math.sin(TAU * t / period + this.breath.phase);
      let sx = 1, sy = 1, hop = 0, nodFace = 0;
      if (o.breath) {
        if (pixel) hop = ((t / period + this.breath.phase / TAU) % 1) < 0.5 ? -cell : 0;
        else { const amount = m.breath * (asleep ? 1.6 : 1) * (state.dim ? 0.5 : 1); sx *= 1 - 0.02 * wave * amount; sy *= 1 + 0.028 * wave * amount; }
      }
      if (working) {
        const s = Math.max(0, Math.sin(TAU * t / NOD_PERIOD)), n = s * s, k = Math.max(m.squish, 0.4);
        if (pixel) nodFace = n > 0.5 ? cell : 0;
        else { sx *= 1 + 0.035 * n * k; sy *= 1 - 0.05 * n * k; nodFace = 1.4 * n; }
      }
      const q = this.squash.x * m.squish;
      sx *= 1 + 0.85 * q; sy *= 1 - q;
      let eyeScale = 1;
      const canBlink = state.mood !== 'done' && !asleep && !state.dim;
      if (o.blink && canBlink) {
        const at = t % this.blinkEvery, from = this.blinkEvery - BLINK_SECONDS;
        if (at >= from) eyeScale = pixel ? (at < this.blinkEvery - 0.04 ? 0.15 : 1) : blinkScale((at - from) / BLINK_SECONDS);
      }
      if (this.blinkAt >= 0 && t - this.blinkAt < BLINK_SECONDS) eyeScale = Math.min(eyeScale, blinkScale((t - this.blinkAt) / BLINK_SECONDS));
      if (this.swapAt >= 0 && t - this.swapAt < 0.13) eyeScale = Math.min(eyeScale, 0.12 + 0.88 * (t - this.swapAt) / 0.13);
      let turn = pixel ? 0 : this.turn.x;
      let hand = null, bang = null;
      if (waiting && o.waitLook === 'wave') {
        const degrees = Math.sin(10 * t) * 28 - 6;
        hand = { degrees: pixel ? Math.round(degrees / 20) * 20 : degrees };
        if (!pixel) turn += Math.sin(3.2 * t) * 5;
      }
      if (waiting && o.waitLook === 'bang') bang = { lift: snap(Math.abs(Math.sin(5 * t)) * 3) };
      const zs = [];
      if (asleep) {
        const cycle = 1 / 0.45;
        [10, 8, 6.4].forEach((size, index) => {
          if (pixel) { if (((t / 1.5) % 1) >= index / 3) zs.push({ x: 31 + index * 3.4, y: 8 - index * 4.2, size: 10, opacity: 1 }); }
          else { const p = (t / cycle + index / 3) % 1; zs.push({ x: 30 + p * 9, y: 9 - p * 16, size, opacity: Math.sin(p * Math.PI) }); }
        });
      }
      const size = o.mode === 'face' ? 320 : 160;
      return {
        mode: o.mode, style: o.style, shape: o.shape, color: o.color, tones: tonesOf(o.color), state: state.id, mood: state.mood,
        look: lookNow(o), line: faceLine(o.style, size) + (pixel ? 0.2 : 0), blush: m.blush, pixel, cell,
        lookX: snap(this.lookX.x), lookY: snap(this.lookY.x), nodFace, turn, scaleX: sx, scaleY: sy, hop, moverY: snap(this.mover.x),
        eyeScale, hand, bang, zs, bulb: working ? ((t % 0.9) < 0.45 ? 1 : 0.35) : waiting ? 1 : 0.75,
        dim: state.dim || 0, particles: this.particles
      };
    }
  }
  /** 不动的一张：缩略图用。 */
  const staticScene = options => { const scene = new BotAnimator({ ...options, blink: false, glance: false, breath: false }).scene(); scene.hand = scene.hand && { degrees: -20 }; return scene; };

  // ---- 画 ----
  const rgba = (alpha, value = 0) => `rgba(${value},${value},${value},${alpha})`;
  function fillPath(ctx, path, style) { ctx.beginPath(); trace(ctx, path); ctx.fillStyle = style; ctx.fill(); }
  function strokePath(ctx, path, style, width) {
    ctx.beginPath(); trace(ctx, path); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function clipped(ctx, path, draw) { ctx.save(); ctx.beginPath(); trace(ctx, path); ctx.clip(); draw(); ctx.restore(); }
  function linear(ctx, box, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(box.x + x0 * box.w, box.y + y0 * box.h, box.x + x1 * box.w, box.y + y1 * box.h);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  /** 椭圆的径向渐变：圆心 (cx, cy)，到 (rx, ry) 处走完；可以转个角度。 */
  function radial(ctx, cx, cy, rx, ry, stops, degrees = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    if (degrees) ctx.rotate(degrees * Math.PI / 180);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(-60, -60, 120, 120);
    ctx.restore();
  }
  const glow = (ctx, cx, cy, rx, ry, blur, alpha, degrees = 0) =>
    radial(ctx, cx, cy, rx + 2 * blur, ry + 2 * blur, [[0, rgba(alpha, 255)], [0.45, rgba(alpha * 0.85, 255)], [1, rgba(0, 255)]], degrees);
  function rotateAbout(ctx, degrees, x, y) { if (degrees) { ctx.translate(x, y); ctx.rotate(degrees * Math.PI / 180); ctx.translate(-x, -y); } }
  function scaleAbout(ctx, sx, sy, x, y) { ctx.translate(x, y); ctx.scale(sx, sy); ctx.translate(-x, -y); }

  /** 身体（40 格里）。shape 给路径、外框、头顶；整屏当身体时传一个矩形。 */
  function paintBody(ctx, style, shape, tones, screen) {
    const { box, path } = shape;
    const full = () => ctx.fillRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    // 高光的位置照原版；整屏当身体时挪到屏幕左上角，不压在眼睛上
    const ox = screen ? -5.2 : 0, oy = screen ? box.y - 4.4 : 0;
    if (style === 'toy' || style === 'visor') {
      clipped(ctx, path, () => {
        ctx.fillStyle = linear(ctx, box, 0, 0, 0, 1, [[0, tones.base], [1, tones.dark]]); full();
        radial(ctx, box.x + 0.5 * box.w, box.y + 0.16 * box.h, 0.95 * box.w, 0.95 * box.h, [[0, rgba(0)], [0.55, rgba(0)], [1, rgba(style === 'toy' ? 0.3 : 0.28)]]);
        if (style === 'toy') {
          glow(ctx, 15 + ox, 9 + oy, 11, 6, 2.4, 0.15);
          ctx.save(); rotateAbout(ctx, -30, 11.1 + ox, 7.7 + oy);
          fillPath(ctx, [roundRect(8.4 + ox, 6.6 + oy, 5.4, 2.2, 1.1)], rgba(0.8, 255)); ctx.restore();
        }
      });
      if (style === 'toy') strokePath(ctx, path, linear(ctx, box, 0, 0, 0, 1, [[0, rgba(0.6, 255)], [0.36, rgba(0, 255)], [1, rgba(0, 255)]]), 1.1);
    } else if (style === 'jelly') {
      clipped(ctx, path, () => {
        ctx.fillStyle = linear(ctx, box, 0.1, 0, 0.85, 1, [[0, tones.light], [0.3, tones.base], [1, tones.dark]]); full();
        radial(ctx, box.x + 0.45 * box.w, box.y + 0.3 * box.h, 0.75 * box.w, 0.75 * box.h, [[0, rgba(0)], [0.62, rgba(0)], [1, rgba(0.16)]]);
        glow(ctx, 13 + ox, 9.6 + oy, 7.6, 4.4, 1.5, 0.5, -24);
        ctx.save(); rotateAbout(ctx, -34, 9.4 + ox, 9 + oy);
        fillPath(ctx, [ellipse(9.4 + ox, 9 + oy, 2.1, 1.3)], rgba(0.9, 255)); ctx.restore();
      });
    } else if (style === 'sticker') {
      if (!screen) { ctx.save(); ctx.translate(1.4, 2); fillPath(ctx, path, rgba(0.22)); ctx.restore(); }
      fillPath(ctx, path, tones.base);
      strokePath(ctx, path, '#FFFFFF', 2.8);
    } else if (style === 'pixel') {
      fillPath(ctx, path, tones.dark);
      ctx.save();
      if (screen) scaleAbout(ctx, 0.93, 0.9, box.x + box.w / 2, box.y + box.h / 2);
      else { ctx.translate(19.2, 20); ctx.scale(0.86, 0.86); ctx.translate(-20, -21); }
      fillPath(ctx, path, tones.base);
      ctx.restore();
      ctx.fillStyle = tones.light;
      ctx.fillRect(7 + ox, 6.5 + oy, 6, 2.6); ctx.fillRect(5.6 + ox, 9 + oy, 2.6, 3);
    }
  }
  function visorBox(shapeId) {
    const x = shapeId === 'bean' ? 3.5 : 5.5, w = shapeId === 'bean' ? 33 : 29, y = shapeId === 'dome' ? 11 : 9.5;
    return { x, y, w, h: 20.5 };
  }
  function paintVisor(ctx, box, radius) {
    const path = [roundRect(box.x, box.y, box.w, box.h, radius)];
    fillPath(ctx, path, linear(ctx, box, 0, 0, 0, 1, [[0, '#26262E'], [1, '#050507']]));
    if (radius) strokePath(ctx, path, rgba(0.22, 255), 0.7);
    strokePath(ctx, [['M', box.x + 4.5, box.y + 3.2], ['Q', box.x + box.w / 2, box.y + 0.8, box.x + box.w - 4.5, box.y + 3.2]], rgba(0.18, 255), 1.6);
    return path;
  }
  function drawMark(ctx, mark, inks) {
    const alpha = ctx.globalAlpha;
    ctx.beginPath(); trace(ctx, mark.path);
    if (mark.fill) { ctx.globalAlpha = alpha * mark.opacity; ctx.fillStyle = inks[mark.fill]; ctx.fill(); }
    if (mark.stroke) {
      ctx.globalAlpha = alpha * (mark.fill ? 1 : mark.opacity);
      ctx.strokeStyle = inks[mark.stroke]; ctx.lineWidth = mark.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }
  /** 脸：腮红和嘴 → 眼睛（眨眼时绕眼睛的高度缩）→ 配饰。 */
  function paintFace(ctx, scene, inks, withBlush = true) {
    const all = marks(scene.look, scene.line);
    ctx.save();
    ctx.translate(scene.lookX, scene.lookY + scene.nodFace);
    if (withBlush && scene.blush > 0) {
      ctx.save(); ctx.globalAlpha *= scene.blush;
      fillPath(ctx, [ellipse(8.6, 25, 3.6, 2.2), ellipse(31.4, 25, 3.6, 2.2)], '#FF9EC0'); ctx.restore();
    }
    for (const mark of all) if (mark.layer === 'face') drawMark(ctx, mark, inks);
    ctx.save(); scaleAbout(ctx, 1, scene.eyeScale, 20, EYE_Y);
    for (const mark of all) if (mark.layer === 'eyes') drawMark(ctx, mark, inks);
    ctx.restore();
    for (const mark of all) if (mark.layer === 'overlay') drawMark(ctx, mark, inks);
    ctx.restore();
  }
  function faceEffects(ctx, scene, unit) {
    // Canvas 的阴影按画布像素算，不跟着缩放：unit 是一格等于几个画布像素
    if (scene.style === 'visor') { ctx.shadowColor = scene.tones.light; ctx.shadowBlur = 2.8 * unit; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
    else if (scene.style === 'toy') { ctx.shadowColor = rgba(0.32); ctx.shadowBlur = 1.2 * unit; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0.6 * unit; }
    else if (scene.style === 'jelly') { ctx.shadowColor = rgba(0.28); ctx.shadowBlur = 1.8 * unit; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0.5 * unit; }
  }
  function paintHand(ctx, scene) {
    ctx.save(); rotateAbout(ctx, scene.hand.degrees, 32, 21);
    if (scene.pixel) { ctx.fillStyle = scene.tones.base; ctx.fillRect(37, 5, 7, 11); }
    else {
      fillPath(ctx, [ellipse(37.6, 12.6, 4.2, 5.4)], scene.tones.base);
      if (scene.style === 'sticker') strokePath(ctx, [ellipse(37.6, 12.6, 4.2, 5.4)], '#FFFFFF', 2);
    }
    ctx.restore();
  }
  function paintBang(ctx, scene) {
    ctx.save(); ctx.translate(0, -scene.bang.lift);
    if (scene.pixel) {
      ctx.fillStyle = '#FFB224'; ctx.fillRect(37.5, 2, 9, 14);
      ctx.fillStyle = DARK; ctx.fillRect(40.6, 4.4, 2.8, 6.4); ctx.fillRect(40.6, 12.4, 2.8, 2.4);
    } else {
      fillPath(ctx, [roundRect(36, 3, 12, 18, 6)], '#FFB224');
      strokePath(ctx, [roundRect(36, 3, 12, 18, 6)], '#FFFFFF', 1.4);
      fillPath(ctx, [roundRect(40.8, 6.2, 2.4, 8.2, 1.2)], DARK);
      fillPath(ctx, [ellipse(42, 17.2, 1.45)], DARK);
    }
    ctx.restore();
  }
  function paintZs(ctx, scene) {
    for (const z of scene.zs) {
      ctx.save();
      ctx.globalAlpha *= clamp(z.opacity, 0, 1);
      ctx.font = `bold ${z.size}px ${scene.pixel ? 'ui-monospace, Menlo, monospace' : 'system-ui, -apple-system, sans-serif'}`;
      ctx.textBaseline = 'alphabetic';
      if (!scene.pixel) { ctx.strokeStyle = DARK; ctx.lineWidth = 0.5; ctx.lineJoin = 'round'; ctx.strokeText('z', z.x, z.y); }
      ctx.fillStyle = scene.style === 'visor' ? scene.tones.light : '#FFFFFF';
      ctx.fillText('z', z.x, z.y);
      ctx.restore();
    }
  }
  function paintStar(ctx, size) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const radius = i % 2 ? size * 0.42 : size, a = i / 8 * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * radius, Math.sin(a) * radius); }
    ctx.closePath(); ctx.fill();
  }
  function paintParticles(ctx, scene) {
    const U = EFFECT_UNIT;
    for (const p of scene.particles) {
      const left = p.life - p.age, at = p.age / p.life;
      ctx.save();
      if (p.kind === 'confetti') {
        ctx.globalAlpha *= clamp(left / 0.33, 0, 1);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        if (p.round) { ctx.beginPath(); ctx.ellipse(0, 0, p.h / 2, p.h / 2, 0, 0, TAU); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.kind === 'star') {
        ctx.globalAlpha *= clamp(left / 0.25, 0, 1);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        paintStar(ctx, p.size * 0.5 * (0.35 + Math.sin(Math.PI * Math.min(1, at * 1.15))));
      } else if (p.kind === 'ring') {
        ctx.globalAlpha *= 1 - at;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, (6 + 34 * at) * U, (6 + 34 * at) * U, 0, 0, TAU);
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.5 * U; ctx.stroke();
      } else if (p.kind === 'check') {
        const pop = Math.min(1, p.age / 0.32), bounce = pop < 1 ? pop * (1 + 0.45 * Math.sin(pop * Math.PI)) : 1;
        ctx.globalAlpha *= clamp(left / 0.3, 0, 1);
        ctx.translate(p.x, p.y - 5 * U * at); ctx.scale(bounce, bounce);
        ctx.beginPath(); ctx.ellipse(0, 0, 11 * U, 11 * U, 0, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
        strokePath(ctx, [['M', -4.6 * U, 0.2 * U], ['L', -1.2 * U, 3.6 * U], ['L', 5 * U, -3.4 * U]], '#FFFFFF', 2.2 * U);
      }
      ctx.restore();
    }
  }
  /**
   * 像素样式：把一层画进一张小图（一格一个像素），透明度过 110 的算实心、其余透明，再不插值地放大。
   * env.createCanvas 没给时（比如在 Node 里跑测试）直接画，不变像素。area 和 cell 以 40 格计。
   */
  function pixelLayer(ctx, env, area, cell, draw) {
    if (!env || !env.createCanvas) { draw(ctx); return; }
    const w = Math.round(area.w / cell), h = Math.round(area.h / cell);
    const canvas = env.createCanvas(w, h), off = canvas.getContext('2d');
    off.setTransform(w / area.w, 0, 0, h / area.h, -area.x * w / area.w, -area.y * h / area.h);
    draw(off);
    const image = off.getImageData(0, 0, w, h), data = image.data;
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] > 110 ? 255 : 0;
    off.putImageData(image, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(canvas, area.x, area.y, area.w, area.h); ctx.restore();
  }

  /** 整只 Bot，画在 (x, y) 起、边长 size 的方框里。env.px 是一个逻辑像素等于几个画布像素。 */
  function drawBot(ctx, scene, x, y, size, env = {}) {
    const u = size / 40, unit = u * (env.px || 1), shape = SHAPES[scene.shape], inks = { line: scene.style === 'visor' ? scene.tones.light : '#FFFFFF', dark: DARK };
    ctx.save();
    ctx.translate(x, y); ctx.scale(u, u);
    ctx.translate(0, scene.moverY);
    rotateAbout(ctx, scene.turn, 20, 30);
    const body = c => { c.save(); c.translate(0, scene.hop); scaleAbout(c, scene.scaleX, scene.scaleY, 20, 39); };
    if (scene.pixel) {
      const area = { x: -12, y: -14, w: 64, h: 64 }, layer = draw => pixelLayer(ctx, env, area, scene.cell, draw);
      if (scene.hand) layer(c => paintHand(c, scene));
      layer(c => { body(c); paintBody(c, 'pixel', shape, scene.tones, false); c.restore(); });
      layer(c => { body(c); paintFace(c, scene, inks, false); c.restore(); });
      if (scene.bang) layer(c => paintBang(c, scene));
      if (scene.zs.length) layer(c => paintZs(c, scene));
    } else {
      if (scene.hand) paintHand(ctx, scene);
      body(ctx);
      let clip = null;
      if (scene.style === 'visor') {
        strokePath(ctx, [['M', 20, shape.top + 1], ['L', 20, shape.top - 3.6]], scene.tones.dark, 1.7);
        ctx.save(); ctx.globalAlpha *= scene.bulb; ctx.shadowColor = scene.tones.light; ctx.shadowBlur = 3.2 * unit;
        fillPath(ctx, [ellipse(20, shape.top - 5.2, 2.4)], scene.tones.light); ctx.restore();
      }
      paintBody(ctx, scene.style, shape, scene.tones, false);
      if (scene.style === 'visor') clip = paintVisor(ctx, visorBox(scene.shape), 8.5);
      ctx.save();
      if (clip) { ctx.beginPath(); trace(ctx, clip); ctx.clip(); }
      faceEffects(ctx, scene, unit);
      paintFace(ctx, scene, inks);
      ctx.restore();
      ctx.restore();
      if (scene.bang) paintBang(ctx, scene);
      if (scene.zs.length) paintZs(ctx, scene);
    }
    ctx.restore();
  }
  /** 脸铺满屏幕：整块屏当身体，只画脸。屏幕宽 320 对 40 格，上下各裁掉 5 格。 */
  function drawFaceScreen(ctx, scene, env = {}) {
    const u = 8, unit = u * (env.px || 1), top = 5.5;
    const screen = { box: { x: 0, y: top, w: 40, h: 30 }, path: [roundRect(0, top, 40, 30, 0)], top };
    const inks = { line: scene.style === 'visor' ? scene.tones.light : '#FFFFFF', dark: DARK };
    const area = { x: 0, y: top, w: 40, h: 30 };
    const face = c => {
      c.save();
      c.translate(0, scene.hop + scene.moverY * 0.5);
      rotateAbout(c, scene.turn * 0.6, 20, 21);
      scaleAbout(c, scene.scaleX, scene.scaleY, 20, 21);
    };
    ctx.save();
    ctx.translate(0, -top * u); ctx.scale(u, u);
    if (scene.pixel) {
      const layer = draw => pixelLayer(ctx, env, area, scene.cell, draw);
      layer(c => paintBody(c, 'pixel', screen, scene.tones, true));
      layer(c => { face(c); paintFace(c, scene, inks, false); c.restore(); });
      if (scene.hand) layer(c => { c.save(); c.translate(9, 2); c.scale(0.7, 0.7); paintHand(c, scene); c.restore(); });
      if (scene.bang) layer(c => { c.save(); c.translate(5.8, 4.4); c.scale(0.7, 0.7); paintBang(c, scene); c.restore(); });
      if (scene.zs.length) layer(c => { c.save(); c.translate(11, 9); c.scale(0.7, 0.7); paintZs(c, scene); c.restore(); });
    } else {
      if (scene.style === 'visor') paintVisor(ctx, screen.box, 0);
      else paintBody(ctx, scene.style, screen, scene.tones, true);
      if (scene.hand) { ctx.save(); ctx.translate(9, 2); ctx.scale(0.7, 0.7); paintHand(ctx, scene); ctx.restore(); }
      face(ctx); faceEffects(ctx, scene, unit); paintFace(ctx, scene, inks); ctx.restore();
      if (scene.bang) { ctx.save(); ctx.translate(5.8, 4.4); ctx.scale(0.7, 0.7); paintBang(ctx, scene); ctx.restore(); }
      if (scene.zs.length) { ctx.save(); ctx.translate(11, 9); ctx.scale(0.7, 0.7); paintZs(ctx, scene); ctx.restore(); }
    }
    paintParticles(ctx, scene);
    ctx.restore();
  }
  const SCREEN = Object.freeze({ width: 320, height: 240 });
  const BOT_BOX = Object.freeze({ x: 80, y: 52, size: 160 });
  /** 画一整屏（320×240 的逻辑像素；画布更大时先自己缩放，再把倍数放在 env.px）。 */
  function draw(ctx, scene, env = {}) {
    ctx.save();
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
    ctx.beginPath(); ctx.rect(0, 0, SCREEN.width, SCREEN.height); ctx.clip();
    if (scene.mode === 'face') drawFaceScreen(ctx, scene, env);
    else {
      // 背后透一团它自己的颜色（原版对话卡片的做法：本色 0.36 往外淡到 0）
      radial(ctx, 160, 132, 190, 118, [[0, scene.tones.base + '5C'], [1, scene.tones.base + '00']]);
      drawBot(ctx, scene, BOT_BOX.x, BOT_BOX.y, BOT_BOX.size, env);
      ctx.save(); ctx.translate(BOT_BOX.x, BOT_BOX.y); ctx.scale(BOT_BOX.size / 40, BOT_BOX.size / 40); paintParticles(ctx, scene); ctx.restore();
    }
    if (scene.dim) { ctx.fillStyle = rgba(scene.dim); ctx.fillRect(0, 0, SCREEN.width, SCREEN.height); }
    ctx.restore();
  }

  function exportParameters(options) {
    const o = normalize(options);
    return {
      version: 2, viewport: { ...SCREEN }, grid: '40×40，y 朝下；整只 Bot 时一格 4 像素，脸铺满时一格 8 像素',
      note: '电脑预览导出的视觉参数，不是 GPIO 配置或设备协议。脸、样式、身形、配色、动作数值取自 source；proposed 的状态是提议。',
      source: { ...SOURCE, files: [...SOURCE.files] },
      selection: { style: o.style, face: o.face, color: o.color, shape: o.shape, mode: o.mode, waitLook: o.waitLook, doneEffect: o.doneEffect },
      tones: { ...tonesOf(o.color) }, motion: { ...STYLES[o.style].motion }, lineWidth: faceLine(o.style, o.mode === 'face' ? 320 : 160),
      timing: { blinkIntervalSeconds: blinkInterval(BOT_ID), blinkSeconds: BLINK_SECONDS, breathPeriodSeconds: breathOf(BOT_ID).period,
        nodsPerSecond: 1.35, squashSpring: { k: 520, d: 13 }, gazeSpring: { k: 70, d: 12 } },
      states: STATES.map(s => ({ id: s.id, label: s.label, origin: s.origin, proposed: Boolean(s.proposed), protocol: !s.extra,
        face: lookKey(lookNow({ ...o, state: s.id })), dim: s.dim || 0 })),
      faces: Object.fromEntries(Object.entries(FACES).map(([name, l]) => [name, lookKey(l)])),
      paths: { eyes: { ...EYE_PATHS }, mouths: { ...MOUTH_PATHS }, extras: { ...EXTRA_PATHS }, shadeLenses: [...SHADE_LENSES], shadeGlints: SHADE_GLINTS }
    };
  }

  root.EchoBotFace = Object.freeze({
    SOURCE, EYES, MOUTHS, EXTRAS, FACES, FACE_NAMES, RESTING, STYLES, STYLE_ORDER, SHAPES, SHAPE_ORDER, TONES, STATES, PROTOCOL_STATES,
    DEFAULTS, BOT_ID, SCREEN, BOT_BOX, NOD_PERIOD, BLINK_SECONDS,
    seed, look, lookKey, lookFromKey, lookFor, lookNow, lookupState, blinkInterval, blinkScale, marks, parsePath, tokenize, faceLine, shapeOf,
    tonesOf, breathOf, glances, Spring, simulate, normalize, BotAnimator, staticScene, draw, drawBot, drawFaceScreen, exportParameters, clamp
  });
})(globalThis);
