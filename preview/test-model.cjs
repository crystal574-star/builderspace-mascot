// Run with node --test preview/test-model.cjs. No browser or extra packages needed.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./face-model.js');
const face = globalThis.MascotFace;

test('all seven protocol states are present; an unknown state cannot look like success', () => {
  assert.deepEqual(face.states.map(s => s.id), ['idle', 'listening', 'working', 'waiting', 'done', 'failed', 'offline']);
  assert.equal(face.lookup('unrecognized').id, 'offline');
});

test('interrupting a transition preserves the currently visible pose', () => {
  const animator = new face.Animator('idle');
  animator.setState('listening', 0, 420);
  const visible = animator.sample(180);
  animator.setState('failed', 180, 420);
  assert.deepEqual(animator.sample(180), visible);
  assert.deepEqual(animator.sample(600), { ...face.lookup('failed').pose });
});

test('instant switches support paused and reduced-motion presentation', () => {
  const animator = new face.Animator('idle');
  animator.setState('done', 42, 0);
  assert.deepEqual(animator.sample(42), { ...face.lookup('done').pose });
  assert.equal(animator.sample(42).smileEyes, 1);
});

test('blink closes once and returns to exactly open without a stuck eyelid', () => {
  for (const age of [-Infinity, -1, 0, 200, 201, 10000]) assert.equal(face.blinkAmount(age), 0);
  assert.equal(face.blinkAmount(100), 1);
  for (let age = 0; age < 200; age++) assert.ok(face.blinkAmount(age) >= 0 && face.blinkAmount(age) <= 1);
});

test('natural gaze remains bounded and is continuous at each segment boundary', () => {
  for (let now = 0; now < 120000; now += 17) {
    const gaze = face.naturalGaze(now);
    assert.ok(Number.isFinite(gaze.x) && Math.abs(gaze.x) <= 1);
    assert.ok(Number.isFinite(gaze.y) && Math.abs(gaze.y) <= 1);
  }
  for (let now = 3100; now <= 31000; now += 3100) {
    const before = face.naturalGaze(now - .01);
    const after = face.naturalGaze(now + .01);
    assert.ok(Math.abs(before.x - after.x) < .001);
    assert.ok(Math.abs(before.y - after.y) < .001);
  }
});

test('export is portable JSON and cannot mutate live expression presets', () => {
  const exported = JSON.parse(JSON.stringify(face.exportParameters()));
  assert.deepEqual(exported.viewport, { width: 320, height: 240 });
  assert.equal(exported.states.length, 7);
  exported.states[0].pose.width = 999;
  assert.equal(face.lookup('idle').pose.width, 58);
});

test('all state transitions and blink extremes produce finite geometry with balanced canvas saves', () => {
  let depth = 0;
  let draws = 0;
  const check = (...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), 'non-finite canvas geometry');
    draws++;
  };
  const ctx = { globalAlpha: 1,
    save() { depth++; }, restore() { depth--; assert.ok(depth >= 0); },
    clearRect: check, fillRect: check, translate: check, rotate: check,
    roundRect: check, ellipse: check, arc: check, moveTo: check, lineTo: check, quadraticCurveTo: check,
    beginPath() {}, fill() {}, stroke() {}, clip() {}
  };
  for (const source of face.states) for (const target of face.states) {
    const animator = new face.Animator(source.id);
    animator.setState(target.id, 0);
    for (const time of [0, 100, 210, 420, 2000]) {
      for (const blink of [0, .5, 1]) face.draw(ctx, animator.sample(time), { now: time, gaze: { x: 1, y: -1 }, blink });
      assert.equal(depth, 0);
    }
  }
  assert.ok(draws > 1000);
});
