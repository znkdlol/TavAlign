/* Tap once, release the fixture, then capture one uninterrupted steady window. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TavCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class CaptureQueue {
    constructor(engine) { this.engine = engine; this.job = null; }
    get startedAt() { return this.job?.startedAt ?? null; }
    get attempts() { return this.job?.attempts ?? 0; }
    arm(kind, t, { delayMs = 1000, durationMs = 2000, timeoutMs = 20000, companionKind = null } = {}) {
      if (this.job || this.engine.capture || !this.engine.channels[kind] || !Number.isFinite(t) ||
        !Number.isFinite(delayMs) || delayMs < 0 || !Number.isFinite(durationMs) || durationMs <= 0 ||
        !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
        (companionKind && !this.engine.channels[companionKind])) return false;
      this.engine.takeOutcome();
      this.job = { kind, companionKind, startedAt: t, delayMs, durationMs, timeoutMs,
        stage: 'settling', attempts: 0, captureStartedAt: null, lastReason: '' };
      return true;
    }
    poll(t) {
      const job = this.job;
      if (!job) return null;
      this.engine.tick(t);
      const result = this.engine.takeOutcome();
      const deadline = job.startedAt + job.timeoutMs;
      // A UI poll may arrive after the deadline even though the final sensor
      // sample completed in time. Sensor completion time decides acceptance.
      if (result?.ok && (result.completedAt ?? result.t + result.duration / 2) <= deadline) {
        this.job = null;
        return result;
      }
      if (t >= deadline) {
        this.cancel('Could not obtain a steady capture in time. Support the fixture and try again.');
        return { ok: false, reason: 'Could not obtain a steady capture in time. Support the fixture and try again.' };
      }
      if (result && !result.ok) {
        job.stage = 'settling';
        job.captureStartedAt = null;
        job.lastReason = result.reason || 'Waiting for a new steady window.';
      }
      if (job.stage === 'settling' && t - job.startedAt >= job.delayMs) {
        if (this.engine.start(job.kind, t, { durationMs: job.durationMs, companionKind: job.companionKind })) {
          job.stage = 'averaging';
          job.captureStartedAt = t;
          job.attempts++;
          job.lastReason = '';
        }
      }
      return null;
    }
    progress(t) {
      const job = this.job;
      if (!job || job.stage !== 'averaging') return 0;
      return Math.max(0, Math.min(1, (t - job.captureStartedAt) / job.durationMs));
    }
    cancel(reason = 'Capture cancelled.') {
      this.engine.cancel(reason);
      this.engine.takeOutcome();
      this.job = null;
    }
  }
  return { CaptureQueue };
});
