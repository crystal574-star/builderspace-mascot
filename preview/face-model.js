/* Pure numeric animation model. No DOM, network, assets or framework dependency. */
(function (root) {
  'use strict';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const base = { width: 58, height: 66, spacing: 70, tilt: 0, asymmetric: 0, smileEyes: 0,
    pupil: 1, smile: .25, mouthOpen: 0, mouthWidth: 25, mouthShift: 0, brow: 0,
    thinking: 0, gazeX: 0, gazeY: 0, red: 155, green: 237, blue: 216, brightness: 1 };
  const definitions = [
    ['idle', '待机', '在这儿陪你', '安静地陪着你，偶尔眨眨眼、看看四周。', '#789756', {}],
    ['listening', '正在听', '专心听你说', '睁大眼睛、看向前方，用一个小圆嘴认真回应。', '#6c9eae', { height: 78, width: 61, spacing: 72, pupil: 1.17, mouthOpen: 1, mouthWidth: 10, smile: 0, red: 165, green: 224, blue: 246 }],
    ['working', '思考中', '让我想一想', '眼神稍稍看向上方，三个小点陪它一起思考。', '#7c91be', { height: 48, width: 60, tilt: -.04, gazeX: -.25, gazeY: -.5, brow: .2, thinking: 1, smile: 0, red: 157, green: 193, blue: 250 }],
    ['waiting', '等待确认', '等你看一眼', '一边挑眉、一边看着你，安静等待电脑上的确认。', '#b39152', { height: 62, width: 57, asymmetric: 14, tilt: .06, brow: 1, smile: 0, mouthShift: 6, mouthWidth: 19, red: 246, green: 206, blue: 133 }],
    ['done', '完成啦', '这次做得不错', '弯弯的笑眼和大大的笑嘴，把开心写在脸上。', '#7b9a58', { smileEyes: 1, smile: 1, mouthWidth: 40, red: 189, green: 239, blue: 153 }],
    ['failed', '有点困惑', '好像卡住了', '眼睛一高一低、眉毛轻轻皱起，嘴角也垂了下来。', '#be8581', { height: 54, width: 55, asymmetric: -13, tilt: -.13, brow: -.8, smile: -.65, gazeY: .2, mouthWidth: 29, red: 246, green: 165, blue: 158 }],
    ['offline', '暂时离线', '休息一下', '眼睛变成安静的细线，等连接恢复再重新精神起来。', '#8c9b91', { height: 4, width: 51, spacing: 68, pupil: 0, smile: 0, mouthWidth: 16, brightness: .68, red: 150, green: 175, blue: 165 }]
  ];
  const states = definitions.map(([id, label, subtitle, description, color, overrides]) =>
    Object.freeze({ id, label, subtitle, description, color, pose: Object.freeze({ ...base, ...overrides }) }));
  const statesById = Object.fromEntries(states.map(state => [state.id, state]));
  const keys = Object.keys(base);
  const lookup = id => statesById[id] || statesById.offline;

  class Animator {
    constructor(id = 'idle') {
      this.state = lookup(id).id;
      this.from = { ...lookup(id).pose };
      this.target = { ...this.from };
      this.started = 0;
      this.duration = 0;
    }
    sample(now) {
      const progress = this.duration > 0 ? smooth((now - this.started) / this.duration) : 1;
      return Object.fromEntries(keys.map(key => [key, mix(this.from[key], this.target[key], progress)]));
    }
    setState(id, now, duration = 420) {
      this.from = this.sample(now);
      const next = lookup(id);
      this.target = { ...next.pose };
      this.state = next.id;
      this.started = now;
      this.duration = Math.max(0, duration);
      return next;
    }
  }

  // Deterministic movement is reproducible in previews and simple to port to firmware.
  const gazeStops = [[0, 0], [.65, -.12], [.2, .2], [-.65, .05], [0, -.35], [0, 0]];
  function naturalGaze(now) {
    const tick = Math.max(0, now) / 3100;
    const step = Math.floor(tick);
    const before = gazeStops[step % gazeStops.length];
    const after = gazeStops[(step + 1) % gazeStops.length];
    const amount = smooth(Math.min(1, (tick - step) * 6));
    return { x: mix(before[0], after[0], amount), y: mix(before[1], after[1], amount) };
  }
  function blinkAmount(age) {
    if (age < 0 || age >= 200) return 0;
    return Math.pow(Math.sin(Math.PI * age / 200), 1.4);
  }

  function draw(ctx, pose, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : 0;
    const gaze = options.gaze || { x: 0, y: 0 };
    const blink = clamp(options.blink || 0, 0, 1);
    const gx = clamp(gaze.x + pose.gazeX, -1, 1);
    const gy = clamp(gaze.y + pose.gazeY, -1, 1);
    const tint = `rgb(${Math.round(pose.red)} ${Math.round(pose.green)} ${Math.round(pose.blue)})`;
    const eyeY = 99;
    ctx.clearRect(0, 0, 320, 240);
    ctx.fillStyle = '#091211';
    ctx.fillRect(0, 0, 320, 240);
    ctx.save();
    ctx.globalAlpha = pose.brightness;
    ctx.fillStyle = tint;
    ctx.strokeStyle = tint;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? -1 : 1;
      const cx = 160 + direction * pose.spacing;
      const cy = eyeY + direction * pose.asymmetric * .35 + gy * 3;
      const height = Math.max(2, (pose.height + direction * pose.asymmetric) * (1 - .97 * blink));
      ctx.save();
      ctx.translate(cx + gx * 4, cy);
      ctx.rotate(direction * pose.tilt);
      ctx.globalAlpha *= 1 - pose.smileEyes;
      ctx.beginPath();
      ctx.roundRect(-pose.width / 2, -height / 2, pose.width, height, Math.min(pose.width / 2, height / 2));
      ctx.save();
      ctx.shadowColor = tint;
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.restore();
      ctx.clip();
      if (pose.pupil > .01 && height > 8) {
        ctx.fillStyle = '#12302a';
        ctx.beginPath();
        ctx.ellipse(gx * 11, gy * 10, 10 * pose.pupil, 14 * pose.pupil, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e9fff1';
        ctx.globalAlpha *= .75;
        ctx.beginPath();
        ctx.arc(gx * 11 - 3, gy * 10 - 5, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (pose.smileEyes > .001) {
        ctx.save();
        ctx.globalAlpha *= pose.smileEyes;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(cx - 22, cy + 3);
        ctx.quadraticCurveTo(cx, cy - 26 * (1 - blink * .55), cx + 22, cy + 3);
        ctx.stroke();
        ctx.restore();
      }
      if (Math.abs(pose.brow) > .001) {
        ctx.save();
        ctx.globalAlpha *= Math.abs(pose.brow) * .75 * (1 - pose.smileEyes);
        ctx.lineWidth = 4;
        ctx.beginPath();
        const by = cy - pose.height / 2 - 13;
        ctx.moveTo(cx - 15, by + direction * pose.brow * 5);
        ctx.lineTo(cx + 15, by - direction * pose.brow * 5);
        ctx.stroke();
        ctx.restore();
      }
    }

    const mx = 160 + pose.mouthShift + gx * 2;
    const my = 171 + gy * 2;
    ctx.save();
    ctx.globalAlpha *= (1 - pose.mouthOpen) * (1 - pose.thinking);
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(mx - pose.mouthWidth / 2, my);
    ctx.quadraticCurveTo(mx, my + pose.smile * 24, mx + pose.mouthWidth / 2, my);
    ctx.stroke();
    ctx.restore();
    if (pose.mouthOpen > .001) {
      ctx.save();
      ctx.globalAlpha *= pose.mouthOpen;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(mx, my + 3, 7, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (pose.thinking > .001) {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.globalAlpha *= pose.thinking * (.3 + .7 * (.5 + .5 * Math.sin(now / 260 - i * 1.2)));
        ctx.beginPath();
        ctx.arc(mx - 12 + i * 12, my + 1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function exportParameters() {
    return {
      version: 1, viewport: { width: 320, height: 240 }, colorSpace: 'sRGB',
      units: 'pixels; time in milliseconds; tilt in radians',
      note: 'Local visual prototype; not a hardware profile or echo protocol.',
      animation: { transitionMs: 420, blinkDurationMs: 200, gazeStepMs: 3100, demoStepMs: 5000 },
      states: states.map(state => ({ ...state, pose: { ...state.pose } }))
    };
  }
  root.MascotFace = Object.freeze({ states: Object.freeze(states), lookup, Animator, naturalGaze, blinkAmount, draw, exportParameters, clamp });
})(globalThis);
