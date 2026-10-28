const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, Display, stats, correctedToe, camberFromOrientation } = require('../sensor-engine.js');
const near = (a, b, tolerance = .005) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('upright screen is zero in outward mode', () => near(camberFromOrientation(90, 0, 'vertical'), 0));
test('forward/back pitch crosses zero with opposite signs', () => {
  near(camberFromOrientation(92, 0, 'vertical'), 2);
  near(camberFromOrientation(88, 0, 'vertical'), -2);
});
test('screen-plane reading is continuous through exactly upright', () => {
  for (const pitch of [-5, -1, -.01, 0, .01, 1, 5]) near(camberFromOrientation(90 + pitch, 0, 'vertical'), pitch);
});
test('vertical screen leaning sideways remains zero camber', () => {
  // With a vertical screen and in-plane lean, gamma approaches +/-90.
  for (const beta of [60, 75, 89, 91, 105, 120]) {
    near(camberFromOrientation(beta, -90, 'vertical'), 0);
    near(camberFromOrientation(beta, 89.999999, 'vertical'), 0);
  }
});
test('camber is invariant to rotation within the screen plane', () => {
  const rad = Math.PI / 180;
  for (const tilt of [-3, 3]) for (const roll of [-20, -10, 0, 10, 20]) {
    const gx = Math.cos(tilt * rad) * Math.sin(roll * rad);
    const gy = Math.cos(tilt * rad) * Math.cos(roll * rad);
    const gz = -Math.sin(tilt * rad);
    const beta = gz < 0 ? 180 - Math.asin(gy) / rad : Math.asin(gy) / rad;
    const gamma = Math.atan2(-gx / Math.cos(beta * rad), gz / Math.cos(beta * rad)) / rad;
    near(camberFromOrientation(beta, gamma, 'vertical'), tilt);
  }
});
test('missing orientation components cannot fabricate camber', () => {
  for (const invalid of [null, undefined, NaN, Infinity]) {
    assert.equal(camberFromOrientation(invalid, 0), null);
    assert.equal(camberFromOrientation(90, invalid), null);
  }
});
function feed(e, from, to, options = {}) {
  const { dt = 20, gamma = t => 2 + .015 * Math.sin(t / 35), alpha = () => 359.99,
    rotation = .03, acceleration = .01 } = options;
  for (let t = from; t <= to; t += dt) {
    e.motionSample(t, rotation, acceleration);
    e.orientation(t, gamma(t), alpha(t));
  }
}
test('screen-up mounting defaults to zero on a horizontal reference', () => near(camberFromOrientation(0, 0), 0));
test('screen-up pitch retains sign on both sides of horizontal', () => {
  for (const pitch of [-5, -3.2, -.01, 0, .01, 3.2, 5]) near(camberFromOrientation(pitch, 0, 'flat', 'pitch'), pitch);
});
test('screen-up sideways roll alone produces no forward/back camber', () => {
  for (const roll of [-20, -10, 0, 10, 20]) near(camberFromOrientation(0, roll, 'flat', 'pitch'), 0);
});
test('screen-up mode rejects upright and face-down positions', () => {
  assert.equal(camberFromOrientation(90, 0), null);
  assert.equal(camberFromOrientation(180, 0), null);
});
test('screen-up pitch projection agrees with a known gravity vector', () => {
  const rad = Math.PI / 180, pitch = -3.2, roll = 8;
  const beta = Math.asin(Math.sin(pitch * rad) * Math.cos(roll * rad)) / rad;
  const gz = Math.cos(pitch * rad) * Math.cos(roll * rad);
  const gamma = Math.acos(gz / Math.cos(beta * rad)) / rad;
  near(camberFromOrientation(beta, gamma, 'flat', 'pitch'), pitch);
});
test('default axis follows left/right edge tilt, not camera/port tilt', () => {
  near(camberFromOrientation(0, -3.2), -3.2);
  near(camberFromOrientation(0, 3.2), 3.2);
  near(camberFromOrientation(-3.2, 0), 0);
  near(camberFromOrientation(3.2, 0), 0);
});
test('left edge lowered is negative from an independent rotation matrix', () => {
  const rad = Math.PI / 180;
  for (const angle of [-10, -3.2, -.1, .1, 3.2, 10]) {
    // Ry(angle): right-axis height = -sin(angle). Negative angle therefore
    // lifts the right edge and lowers the left edge of a face-up phone.
    const rightEdgeHeight = -Math.sin(angle * rad);
    const screenNormalHeight = Math.cos(angle * rad);
    const sensedGamma = Math.atan2(-rightEdgeHeight, screenNormalHeight) / rad;
    near(camberFromOrientation(0, sensedGamma), angle);
    assert.equal(Math.sign(camberFromOrientation(0, sensedGamma)), Math.sign(-rightEdgeHeight));
  }
});
test('roll projection preserves angle with simultaneous camera-end tilt', () => {
  for (const pitch of [-25, 0, 25]) for (const roll of [-5, 0, 5]) near(camberFromOrientation(pitch, roll), roll);
});
test('unknown axis is unavailable rather than silently falling back', () => {
  assert.equal(camberFromOrientation(0, 2, 'flat', 'unknown'), null);
});
function ready(options) { const e = new Engine(); feed(e, 0, 3000, options); return e; }
test('no fabricated zero or ready state before sensor data', () => {
  const e = new Engine(); assert.equal(e.status('camber', 0).value, null);
  assert.equal(e.start('camber', 0), false);
});
test('steady signal needs a full window and continuous dwell', () => {
  const e = new Engine(); feed(e, 0, 1800);
  assert.equal(e.status('camber', 1800).ready, false);
  feed(e, 1820, 3000); assert.equal(e.status('camber', 3000).ready, true);
});
test('EMA reduces live noise without changing capture data', () => {
  const e = ready(); const filtered = [], raw = [];
  for (let t = 3020; t <= 5000; t += 20) {
    feed(e, t, t); filtered.push(e.status('camber', t).value); raw.push(2 + .015 * Math.sin(t / 35));
  }
  const range = a => Math.max(...a) - Math.min(...a);
  assert.ok(range(filtered) < range(raw) / 3);
});
test('capture averages future samples over at least 1.5 seconds', () => {
  const e = ready(); assert.equal(e.start('camber', 3000), true);
  feed(e, 3020, 4400); assert.equal(e.takeOutcome(), null);
  feed(e, 4420, 4540); const r = e.takeOutcome();
  assert.equal(r.ok, true); assert.ok(r.duration >= 1500); near(r.value, 2);
  assert.ok(r.count >= 15); near(r.t, 3770, 20);
});
test('averaged zero uses same raw capture path', () => {
  const e = ready({ gamma: () => 1.125 }); e.start('camber', 3000);
  feed(e, 3020, 4540, { gamma: () => 1.125 }); near(e.takeOutcome().value, 1.125);
});
test('spike is rejected for capture even when median hides it on display', () => {
  const e = ready(); e.start('camber', 3000);
  feed(e, 3020, 3020, { gamma: () => 5 });
  assert.equal(e.takeOutcome().ok, false); assert.equal(e.status('camber', 3020).ready, false);
});
test('motion excursion between UI refreshes aborts capture', () => {
  const e = ready(); e.start('camber', 3000);
  e.motionSample(3005, 8, .01); e.motionSample(3010, 0, 0);
  assert.equal(e.takeOutcome().ok, false);
});
test('stale angle stream cancels capture and blanks display', () => {
  const e = ready(); e.start('camber', 3000); e.tick(3400);
  assert.equal(e.takeOutcome().ok, false); assert.equal(e.status('camber', 3400).value, null);
});
test('angle recovery cannot reuse stale dwell', () => {
  const e = ready(); feed(e, 3600, 4000);
  assert.equal(e.status('camber', 4000).ready, false);
});
test('stale rotation data prevents capture despite fresh angles', () => {
  const e = ready(); for (let t = 3020; t <= 4000; t += 20) e.orientation(t, 2, 0);
  assert.equal(e.start('camber', 4000), false);
});
test('missing rotation never becomes zero motion', () => {
  const e = ready({ rotation: null }); assert.equal(e.start('camber', 3000), false);
});
test('missing acceleration is explicitly marked limited', () => {
  const e = ready({ acceleration: null }); assert.equal(e.status('camber', 3000).fullMotion, false);
  e.start('camber', 3000); feed(e, 3020, 4540, { acceleration: null });
  assert.equal(e.takeOutcome().fullMotion, false);
});
test('unavailable yaw does not fabricate a toe measurement', () => {
  const e = ready({ alpha: () => null }); assert.equal(e.start('yaw', 3000), false);
  assert.equal(e.status('camber', 3000).ready, true);
});
test('wraparound averages near zero, never 180 degrees', () => {
  const o = { alpha: t => (360 + .02 * Math.sin(t / 50)) % 360 };
  const e = ready(o); assert.equal(e.start('yaw', 3000), true);
  feed(e, 3020, 4540, o); near(e.takeOutcome().value, 0);
});
test('slow drift is detected even with low short-term noise', () => {
  const e = ready({ alpha: t => t / 1000 * .12 });
  assert.equal(e.status('yaw', 3000).ready, false);
});
test('readiness hysteresis tolerates small motion boundary chatter', () => {
  const e = ready(); e.motionSample(3020, .75, .01);
  assert.equal(e.status('camber', 3020).ready, true);
  e.motionSample(3040, 1.2, .01); assert.equal(e.status('camber', 3040).ready, false);
});
test('display hysteresis holds a rounding boundary but tracks real change', () => {
  const d = new Display(); near(d.update(1.004), 1);
  near(d.update(1.006), 1); near(d.update(1.014), 1.01);
  near(d.update(2), 2); assert.equal(d.update(null), null);
});
test('time weights do not let a sensor burst dominate capture', () => {
  const s = stats([{t:0,v:0},{t:1,v:1},{t:2,v:1},{t:1000,v:1}]);
  near(s.mean, .9995, .00001); near(s.t, 500, .00001);
});
test('capture and smoothing work at 10, 30, 60 and 100 Hz', () => {
  for (const dt of [100, 1000 / 30, 1000 / 60, 10]) {
    const e = new Engine(); let t = 0;
    for (; t < 3200; t += dt) feed(e, t, t, { gamma: () => 2, dt });
    assert.equal(e.start('camber', t - dt), true);
    for (const end = t + 1800; t < end; t += dt) feed(e, t, t, { gamma: () => 2, dt });
    const r = e.takeOutcome(); assert.equal(r.ok, true); near(r.value, 2);
  }
});
test('reset clears captures and both orientation histories', () => {
  const e = ready(); e.start('yaw', 3000); e.reset();
  assert.equal(e.capture, null); assert.equal(e.takeOutcome(), null);
  assert.equal(e.status('yaw', 3020).value, null);
});
test('toe interpolation uses capture midpoint times, wrap and wheel polarity', () => {
  const s = {value:359.9,t:0}, w = {value:.15,t:2000}, e = {value:.1,t:4000};
  near(correctedToe(s,w,e,'FL').toe, -.15);
  near(correctedToe(s,w,e,'FR').toe, .15);
  near(correctedToe(s,w,e,'FL',true).toe, .15);
  near(correctedToe(s,w,e,'FL').drift, .2);
});
test('one large step follows promptly but cannot be captured while settling', () => {
  const e = ready(); feed(e, 3020, 3200, { gamma: () => 5 });
  assert.equal(e.start('camber', 3200), false);
  feed(e, 3220, 3800, { gamma: () => 5 }); near(e.status('camber', 3800).value, 5, .08);
});
