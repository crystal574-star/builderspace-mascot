/* 模型测试：对着 EchoAgent 仓库自己的测试值核对移植（Tests/EchoToolsTests/NotchRosterTests.swift、NotchStyleTests.swift）。 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('./face-model.js');
const F = globalThis.EchoBotFace;

/** 记下每次调用的假画布：检查画出来的数都是有限的、save/restore 成对。 */
function mockContext() {
  const state = { saves: 0, restores: 0, calls: 0, bad: [] };
  const gradient = { addColorStop(at, color) { if (!Number.isFinite(at) || at < 0 || at > 1) state.bad.push(['addColorStop', at]); if (typeof color !== 'string') state.bad.push(['color', color]); } };
  const target = {
    globalAlpha: 1, lineWidth: 1, shadowBlur: 0,
    save() { state.saves++; }, restore() { state.restores++; },
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {}
  };
  const ctx = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      return (...args) => { state.calls++; for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) state.bad.push([key, args]); };
    },
    set(obj, key, value) { if (typeof value === 'number' && !Number.isFinite(value)) state.bad.push([key, value]); obj[key] = value; return true; }
  });
  return { ctx, state };
}

test('种子、平时的脸、眨眼间隔和原仓库的测试值一致', () => {
  assert.equal(F.seed('echo'), 3107365);
  assert.equal(F.seed('bot-526q9rc8'), 2072585452);
  assert.equal(F.seed('bot-hjh28a8b'), 295426213);
  assert.equal(F.seed('小发'), 752034);
  assert.equal(F.seed('a'), 97);
  assert.equal(F.lookFor('echo'), F.FACES.squint);
  assert.equal(F.lookFor('bot-526q9rc8'), F.FACES.glad);
  assert.equal(F.lookFor('小发'), F.FACES.cat);
  assert.equal(F.lookFor('a'), F.FACES.smile);
  assert.equal(F.blinkInterval('a'), 3.297);
  assert.equal(F.blinkInterval('echo'), 5.365);
});

test('状态换脸照原版：干活认真、等你哦、睡着困、做完大笑', () => {
  assert.equal(F.lookFor('a', 'working'), F.FACES.keen);
  assert.equal(F.lookFor('a', 'waiting'), F.FACES.wow);
  assert.equal(F.lookFor('a', 'asleep'), F.FACES.sleepy);
  assert.equal(F.lookFor('a', 'done'), F.FACES.glad);
});

test('11 张现成的脸和 8 张平时的脸齐全，零件都在枚举里', () => {
  assert.deepEqual(Object.keys(F.FACES), ['calm', 'smile', 'cat', 'happy', 'glad', 'squint', 'wide', 'cool', 'keen', 'wow', 'sleepy']);
  assert.deepEqual([...F.RESTING], ['calm', 'smile', 'cat', 'happy', 'glad', 'squint', 'wide', 'cool']);
  assert.equal(F.lookKey(F.FACES.cool), 'none.smirk.shades');
  assert.equal(F.lookKey(F.FACES.keen), 'dot.w.brows');
  for (const face of Object.values(F.FACES)) {
    assert.ok(F.EYES.includes(face.eyes) && F.MOUTHS.includes(face.mouth) && F.EXTRAS.includes(face.extra));
    assert.deepEqual(F.lookFromKey(F.lookKey(face)), face);
  }
  assert.equal(F.lookFromKey('dot.smile'), null);
  assert.equal(F.lookFromKey('dot.smile.hat'), null);
});

test('路径解析认得连写的数字、相对命令和 T 的镜像控制点', () => {
  assert.deepEqual(F.tokenize('M17.2 23.2h5.6q-.4 3.6-2.8 3.6z'), ['M', 17.2, 23.2, 'h', 5.6, 'q', -0.4, 3.6, -2.8, 3.6, 'z']);
  assert.deepEqual(F.parsePath('M9.6 20q3-4 6 0M24.4 20q3-4 6 0'),
    [['M', 9.6, 20], ['Q', 12.6, 16, 15.6, 20], ['M', 24.4, 20], ['Q', 27.4, 16, 30.4, 20]]);
  const w = F.parsePath('M15.9 22.8q0 3.2 2.05 3.2t2.05-2.6');
  assert.equal(w[2][0], 'Q');
  // T 的控制点是上一个控制点对当前点的镜像：(15.9, 26) 对 (17.95, 26) → (20, 26)
  assert.ok(Math.abs(w[2][1] - 20) < 1e-9 && Math.abs(w[2][2] - 26) < 1e-9);
  assert.deepEqual(F.parsePath('M10 15.8l5 2.8-5 2.8').map(s => s[0]), ['M', 'L', 'L']);
  assert.deepEqual(F.parsePath('M1 1h2z').at(-1), ['Z']);
});

test('笔画：墨镜盖住眼睛，大眼有墨色眼珠，线粗跟着给的走', () => {
  const cool = F.marks(F.FACES.cool, 2.2);
  assert.equal(cool.filter(m => m.layer === 'eyes').length, 0);
  assert.equal(cool.filter(m => m.layer === 'overlay' && m.fill === 'dark').length, 2);
  const wide = F.marks(F.FACES.wide, 2.2);
  assert.deepEqual(wide.filter(m => m.layer === 'eyes').map(m => m.fill), ['line', 'dark']);
  assert.equal(F.marks(F.FACES.smile, 3).find(m => m.layer === 'face').width, 3);
  assert.equal(F.marks(F.look('dot', 'none'), 2).filter(m => m.layer === 'face').length, 0);
});

test('五种样式、四种身形、八套配色的数和规则照原版', () => {
  assert.deepEqual([...F.STYLE_ORDER], ['toy', 'sticker', 'jelly', 'visor', 'pixel']);
  assert.deepEqual({ ...F.STYLES.toy.motion }, { squish: 0.42, breath: 0.55, line: 1.12, blush: 0 });
  assert.deepEqual({ ...F.STYLES.jelly.motion }, { squish: 1, breath: 1, line: 1, blush: 0.5 });
  assert.deepEqual({ ...F.STYLES.pixel.motion }, { squish: 0, breath: 0, line: 1, blush: 0 });
  assert.ok(Math.abs(F.faceLine('toy', 22) - 2.7 * 1.12) < 1e-9);
  assert.ok(Math.abs(F.faceLine('visor', 160) - 2.2 * 0.95) < 1e-9);
  assert.equal(F.shapeOf('bot-526q9rc8'), 'dome');
  assert.equal(F.shapeOf('bot-hjh28a8b'), 'squircle');
  assert.equal(F.shapeOf('bot-design01'), 'circle');
  assert.equal(F.shapeOf('bot-qa000002'), 'bean');
  assert.equal(F.shapeOf('a'), 'dome');
  assert.equal(F.shapeOf('bot-design01', 'sticker'), 'squircle');
  assert.equal(F.shapeOf('a', 'jelly'), 'squircle');
  assert.equal(F.shapeOf('a', 'pixel'), 'dome');
  assert.deepEqual(Object.keys(F.TONES), ['violet', 'navy', 'orange', 'teal', 'rose', 'forest', 'ink', 'burgundy']);
  assert.deepEqual([F.TONES.violet.light, F.TONES.violet.base, F.TONES.violet.dark], ['#E3D5FF', '#8B5CF6', '#5B21B6']);
  assert.equal(F.tonesOf('不认识'), F.TONES.violet);
});

test('弹簧、呼吸、张望：算法和原版一样，结果稳定且有界', () => {
  const spring = new F.Spring(0, 240, 19);
  spring.target = 1;
  const values = F.simulate(spring, 1);
  assert.equal(values.length, 61);
  assert.equal(values[0], 0);
  // 第一步：v = 240 × 1 / 60 = 4，x = 4 / 60
  assert.ok(Math.abs(values[1] - 4 / 60) < 1e-12);
  assert.ok(Math.abs(values.at(-1) - 1) < 0.01);
  const breath = F.breathOf('a');
  assert.ok(Math.abs(breath.period - (2.6 + (97 % 9) / 10)) < 1e-12 && Math.abs(breath.phase - 0.97) < 1e-12);
  const a = F.glances('bot-526q9rc8'), b = F.glances('bot-526q9rc8');
  assert.deepEqual(a, b);
  assert.equal(a.stops.length, 8);
  for (const stop of a.stops) { assert.ok([-2.2, 0, 2.2].includes(stop.x)); assert.ok(Math.abs(stop.y) <= 0.6); }
  for (let i = 1; i < a.stops.length; i++) { const gap = a.stops[i].at - a.stops[i - 1].at; assert.ok(gap >= 1.6 && gap <= 4.2); }
});

test('眨眼：合眼那 0.16 秒之外眼睛完全睁开，中间缩到 0.12', () => {
  assert.equal(F.blinkScale(0), 1);
  assert.equal(F.blinkScale(1), 1);
  assert.equal(F.blinkScale(-1), 1);
  assert.ok(Math.abs(F.blinkScale(0.5) - 0.12) < 1e-12);
  const animator = new F.BotAnimator({ state: 'idle' });
  const every = F.blinkInterval(F.BOT_ID);
  let closed = 0, minimum = 1;
  for (let i = 0; i <= Math.ceil((every + 1) * 60); i++) {
    const scene = animator.frame(i / 60);
    if (scene.eyeScale < 1) closed++;
    minimum = Math.min(minimum, scene.eyeScale);
  }
  assert.ok(minimum < 0.2, '一个间隔里眨过一次');
  assert.ok(closed <= 12, '只合眼 0.16 秒左右，没有卡住');
  assert.equal(animator.frame(animator.last + 0.2).eyeScale, 1);
});

test('协议七态齐全；不认识的状态按离线，不能看起来像成功；提议的三态有标记', () => {
  assert.deepEqual([...F.PROTOCOL_STATES], ['idle', 'listening', 'working', 'waiting', 'done', 'failed', 'offline']);
  assert.equal(F.lookupState('不存在').id, 'offline');
  assert.equal(new F.BotAnimator({ state: 'success!!' }).scene().state, 'offline');
  assert.notEqual(F.lookKey(F.lookNow({ ...F.DEFAULTS, state: '不存在' })), F.lookKey(F.FACES.glad));
  assert.deepEqual(F.STATES.filter(s => s.proposed).map(s => s.id), ['listening', 'failed', 'offline']);
  assert.equal(F.lookupState('asleep').extra, true);
  assert.ok(F.lookupState('offline').dim > 0);
  assert.equal(F.lookNow({ ...F.DEFAULTS, state: 'idle', face: 'cat' }), F.FACES.cat);
  assert.equal(F.lookNow({ ...F.DEFAULTS, state: 'working', face: 'cat' }), F.FACES.keen);
  // 七态两两不同脸（待机用默认那张时）
  const keys = F.PROTOCOL_STATES.map(id => F.lookKey(F.lookNow({ ...F.DEFAULTS, state: id })));
  assert.equal(new Set(keys).size, keys.length);
});

test('换状态：压一下再弹回，合眼换脸；做完了会跳、放特效，特效会放完', () => {
  const animator = new F.BotAnimator({ state: 'idle', style: 'jelly' });
  animator.frame(0); animator.frame(1);
  animator.set({ state: 'working' });
  assert.ok(animator.frame(1.02).eyeScale < 1, '换脸时眼睛先合上');
  let squashed = false;
  for (let i = 0; i < 60; i++) { const s = animator.frame(1.02 + i / 60); if (Math.abs(s.scaleY - 1) > 0.02) squashed = true; }
  assert.ok(squashed);
  animator.set({ state: 'done', doneEffect: 'confetti' });
  let lifted = false, particles = 0, t = animator.last;
  for (let i = 0; i < 60; i++) { t += 1 / 60; const s = animator.frame(t); if (s.moverY < -1) lifted = true; particles = Math.max(particles, s.particles.length); }
  assert.ok(lifted, '跳起来了');
  assert.equal(particles, 26);
  for (let i = 0; i < 180; i++) { t += 1 / 60; animator.frame(t); }
  assert.equal(animator.scene().particles.length, 0);
  assert.ok(Math.abs(animator.scene().moverY) < 0.05, '落回原位');
});

test('暂停时时间不走；关掉动作后身体不动', () => {
  const animator = new F.BotAnimator({ state: 'working' });
  animator.frame(0); animator.frame(0.5);
  animator.paused = true;
  const before = JSON.stringify(animator.frame(0.6));
  assert.equal(JSON.stringify(animator.frame(3)), before);
  const still = new F.BotAnimator({ state: 'idle', blink: false, glance: false, breath: false });
  for (let i = 0; i < 600; i++) {
    const s = still.frame(i / 60);
    assert.equal(s.eyeScale, 1); assert.equal(s.scaleX, 1); assert.equal(s.scaleY, 1); assert.equal(s.lookX, 0); assert.equal(s.turn, 0);
  }
});

test('每种状态 × 样式 × 画面都画得出来：数都有限，save/restore 成对', () => {
  for (const mode of ['bot', 'face']) for (const style of F.STYLE_ORDER) for (const state of F.STATES) for (const shape of F.SHAPE_ORDER) {
    const animator = new F.BotAnimator({ state: 'idle', style, mode, shape, waitLook: state.id === 'waiting' && shape === 'bean' ? 'bang' : 'wave', doneEffect: ['confetti', 'stars', 'check'][F.SHAPE_ORDER.indexOf(shape) % 3] });
    animator.frame(0);
    animator.set({ state: state.id });
    animator.lookAt({ x: 2.6, y: -1.9 });
    for (const now of [0.05, 0.3, 0.7, 2.5]) {
      const scene = animator.frame(now);
      const { ctx, state: record } = mockContext();
      F.draw(ctx, scene, { px: 2 });
      assert.deepEqual(record.bad, [], `${mode}/${style}/${state.id}/${shape} @${now}`);
      assert.equal(record.saves, record.restores, `${mode}/${style}/${state.id}/${shape} @${now}`);
      assert.ok(record.calls > 10);
    }
  }
});

test('导出的是可移植的 JSON，带来源，改它不影响正在用的数据', () => {
  const exported = F.exportParameters({ style: 'visor', color: 'teal', face: 'cat' });
  const copy = JSON.parse(JSON.stringify(exported));
  assert.deepEqual(copy, exported);
  assert.equal(exported.source.repository, 'EdwinjJ1/voice-agent');
  assert.equal(exported.selection.style, 'visor');
  assert.equal(exported.states.length, 8);
  assert.equal(exported.states.filter(s => s.protocol).length, 7);
  exported.tones.base = '#000000'; exported.paths.eyes.arc = 'x'; exported.source.files.push('x');
  assert.equal(F.TONES.teal.base, '#22B8CC');
  assert.equal(F.exportParameters({}).paths.eyes.arc, 'M9.6 20q3-4 6 0M24.4 20q3-4 6 0');
  assert.equal(F.SOURCE.files.length, 4);
});
