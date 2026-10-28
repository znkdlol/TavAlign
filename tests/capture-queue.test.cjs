const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine } = require('../sensor-engine.js');
const { CaptureQueue } = require('../capture-queue.js');

function feed(engine, from, to, { value = 2, other = .25, rotation = .02, queue = null } = {}) {
  let result = null;
  for (let t = from; t <= to; t += 20) {
    engine.motionSample(t, rotation, .01);
    engine.orientation(t, typeof value === 'function' ? value(t) : value,
      typeof other === 'function' ? other(t) : other);
    if (queue && !result) result = queue.poll(t);
  }
  return result;
}
function setup() {
  const engine = new Engine();
  feed(engine, 0, 3000);
  return { engine, queue: new CaptureQueue(engine) };
}
test('tap disturbance during release delay is excluded from the average', () => {
  const { engine, queue } = setup();
  assert.equal(queue.arm('camber', 3000), true);
  feed(engine, 3020, 3300, { value: 4, rotation: 5, queue });
  assert.equal(queue.job.stage, 'settling');
  const result = feed(engine, 3320, 8000, { queue });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.value - 2) < .00001);
  assert.ok(result.duration >= 2000);
  assert.ok(result.t - result.duration / 2 >= 4000);
});
test('arming works while moving and never starts before the release delay', () => {
  const engine = new Engine(), queue = new CaptureQueue(engine);
  assert.equal(queue.arm('camber', 0, { delayMs: 3500 }), true);
  feed(engine, 0, 3400, { queue });
  assert.equal(queue.job.stage, 'settling');
  assert.equal(engine.capture, null);
  feed(engine, 3420, 3500, { queue });
  assert.equal(queue.job.stage, 'averaging');
});
test('movement retries a completely fresh window without combining old samples', () => {
  const { engine, queue } = setup(); queue.arm('camber', 3000, { delayMs: 0 });
  queue.poll(3000);
  feed(engine, 3020, 3900, { queue });
  feed(engine, 3920, 4200, { value: 3, rotation: 5, queue });
  assert.equal(queue.job.stage, 'settling');
  assert.equal(queue.progress(4200), 0);
  const result = feed(engine, 4220, 10000, { value: 3, queue });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.value - 3) < .00001);
  assert.ok(result.t - result.duration / 2 > 4200);
  assert.ok(result.duration >= 2000);
});
test('bounded wait times out when usable sensor data never arrives', () => {
  const engine = new Engine(), queue = new CaptureQueue(engine);
  queue.arm('camber', 0);
  assert.equal(queue.poll(19999), null);
  const result = queue.poll(20000);
  assert.equal(result.ok, false); assert.match(result.reason, /in time/);
  assert.equal(queue.job, null); assert.equal(engine.capture, null);
});
test('cancel during averaging clears the queue and all pending outcomes', () => {
  const { engine, queue } = setup(); queue.arm('camber', 3000, { delayMs: 0 }); queue.poll(3000);
  feed(engine, 3020, 3500, { queue });
  queue.cancel();
  assert.equal(queue.job, null); assert.equal(engine.capture, null); assert.equal(engine.takeOutcome(), null);
  assert.equal(feed(engine, 3520, 7000, { queue }), null);
});
test('custom engine duration never completes at the old default duration', () => {
  const { engine } = setup(); engine.start('camber', 3000, { durationMs: 2500 });
  feed(engine, 3020, 5000); assert.equal(engine.takeOutcome(), null);
  feed(engine, 5020, 5540);
  const result = engine.takeOutcome(); assert.equal(result.ok, true); assert.ok(result.duration >= 2500);
});
test('companion channel must also be ready before a reference capture starts', () => {
  const engine = new Engine(), queue = new CaptureQueue(engine);
  feed(engine, 0, 3000, { other: t => t / 1000 });
  assert.equal(engine.start('camber', 3000, { companionKind: 'yaw' }), false);
  queue.arm('camber', 3000, { delayMs: 0, companionKind: 'yaw' });
  queue.poll(3000); assert.equal(queue.job.stage, 'settling');
});
test('simultaneous reference averages share the same future sample window', () => {
  const { engine, queue } = setup();
  queue.arm('camber', 3000, { delayMs: 0, companionKind: 'yaw' }); queue.poll(3000);
  const result = feed(engine, 3020, 5100, { queue });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.value - 2) < .00001);
  assert.ok(Math.abs(result.companion.value - .25) < .00001);
  assert.equal(result.companion.t, result.t);
  assert.equal(result.companion.duration, result.duration);
  assert.equal(result.companion.count, result.count);
});
test('companion-only motion rejects a capture even if the primary axis is steady', () => {
  const { engine } = setup();
  engine.start('camber', 3000, { companionKind: 'yaw' });
  feed(engine, 3020, 3500);
  feed(engine, 3520, 3520, { other: 3 });
  assert.equal(engine.takeOutcome().ok, false);
  assert.equal(engine.capture, null);
});
test('stale stream discards an attempt, then can recover within the time bound', () => {
  const { engine, queue } = setup(); queue.arm('camber', 3000, { delayMs: 0 }); queue.poll(3000);
  feed(engine, 3020, 3500, { queue }); queue.poll(3900);
  assert.equal(queue.job.stage, 'settling');
  const result = feed(engine, 3920, 10000, { queue });
  assert.equal(result.ok, true); assert.ok(result.t - result.duration / 2 > 3900);
});
test('late display poll accepts an in-time completed capture', () => {
  const { engine, queue } = setup();
  queue.arm('camber', 3000, { delayMs: 0, timeoutMs: 2200 }); queue.poll(3000);
  feed(engine, 3020, 5040);
  const result = queue.poll(5400);
  assert.equal(result.ok, true); assert.ok(result.completedAt <= 5200);
});
test('capture completed after its deadline cannot be saved', () => {
  const { engine, queue } = setup();
  queue.arm('camber', 3000, { delayMs: 0, timeoutMs: 1000 }); queue.poll(3000);
  feed(engine, 3020, 5040);
  assert.equal(queue.poll(5040).ok, false);
});
