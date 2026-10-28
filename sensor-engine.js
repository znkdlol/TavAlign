/* TavAlign 2.4 — display filtering is deliberately separate from capture data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TavSensors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONFIG = Object.freeze({
    windowMs: 1200, dwellMs: 1000, staleMs: 350, captureMs: 1500,
    minSamples: 12, minCaptureSamples: 15,
    camber: { sd: .045, range: .18, slope: .06, exit: 1.65, excursion: .12 },
    yaw: { sd: .065, range: .25, slope: .08, exit: 1.65, excursion: .18 }
  });
  const wrap = x => ((x + 180) % 360 + 360) % 360 - 180;
  const delta = (a, b) => wrap(b - a);
  const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  // Inclination of the screen/fixture plane from vertical, not sideways roll.
  // W3C Rz(alpha) Rx(beta) Ry(gamma): world-up dot screen-normal = cos(beta) cos(gamma).
  // The vector projection stays continuous through upright (beta = 90 degrees).
  // Screen outward: top toward the viewer is positive; top into the car negative.
  function camberFromOrientation(beta, gamma, position = 'flat', axis = 'roll') {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    const radians = Math.PI / 180;
    const upDotNormal = Math.cos(beta * radians) * Math.cos(gamma * radians);
    if (position === 'flat') {
      // Screen-up fixture: a signed rotation in the selected device plane.
      // asin(screen-normal) loses the sign around horizontal; atan2 preserves it.
      // Reject a substantially different mounting pose instead of silently
      // subtracting a 90-degree offset from the other mounting configuration.
      if (upDotNormal < .5) return null;
      if (axis === 'roll') {
        // Tilt across the left/right edges, about the phone's camera-to-port
        // axis. Left edge lowered from face-up is negative in device coordinates.
        const upDotRight = -Math.cos(beta * radians) * Math.sin(gamma * radians);
        return Math.atan2(-upDotRight, upDotNormal) / radians;
      }
      if (axis === 'pitch') return Math.atan2(Math.sin(beta * radians), upDotNormal) / radians;
      return null;
    }
    if (position !== 'vertical') return null;
    return -Math.asin(Math.max(-1, Math.min(1, upDotNormal))) / radians;
  }

  // Trapezoidal time weights avoid overweighting bursts of sensor events.
  function stats(points) {
    if (!points.length) return null;
    const first = points[0].t, last = points[points.length - 1].t;
    const weights = points.map((p, i) => points.length === 1 ? 1 :
      ((i ? p.t - points[i - 1].t : 0) +
       (i < points.length - 1 ? points[i + 1].t - p.t : 0)) / 2);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const mean = points.reduce((s, p, i) => s + p.v * weights[i], 0) / total;
    const t = points.reduce((s, p, i) => s + (p.t - first) * weights[i], 0) / total;
    let variance = 0, cov = 0, timeVar = 0;
    points.forEach((p, i) => {
      const dt = (p.t - first - t) / 1000;
      variance += weights[i] * (p.v - mean) ** 2;
      cov += weights[i] * dt * (p.v - mean);
      timeVar += weights[i] * dt * dt;
    });
    const values = points.map(p => p.v);
    return { mean, sd: Math.sqrt(variance / total),
      range: Math.max(...values) - Math.min(...values),
      slope: timeVar ? cov / timeVar : 0,
      t: first + t, duration: last - first, count: points.length };
  }
  const within = (s, c, factor = 1) => s && s.sd <= c.sd * factor &&
    s.range <= c.range * factor && Math.abs(s.slope) <= c.slope * factor;
  const channel = () => ({ points: [], last: null, filtered: null,
    since: null, ready: false, reason: 'Waiting for sensors', summary: null });

  class Engine {
    constructor() { this.reset(); }
    reset() {
      this.channels = { camber: channel(), yaw: channel() };
      this.motion = { t: -Infinity, rotation: null, acceleration: null };
      this.capture = null;
      this.outcome = null;
    }
    motionSample(t, rotation, acceleration) {
      this.motion = { t, rotation: Number.isFinite(rotation) ? rotation : null,
        acceleration: Number.isFinite(acceleration) ? acceleration : null };
      this.tick(t);
    }
    orientation(t, camberAngle, alpha) {
      this.add('camber', t, camberAngle);
      this.add('yaw', t, alpha);
      this.tick(t);
      const capture = this.capture;
      if (!capture) return;
      const c = this.channels[capture.kind];
      if (!c.last || c.last.t !== t) return;
      if (Math.abs(c.last.v - capture.baseline) > CONFIG[capture.kind].excursion) {
        this.cancel('Phone moved. Settle and try again.');
        return;
      }
      const companion = capture.companionKind ? this.channels[capture.companionKind] : null;
      if (companion && (!companion.last || companion.last.t !== t ||
        Math.abs(companion.last.v - capture.companionBaseline) > CONFIG[capture.companionKind].excursion)) {
        this.cancel('Reference moved on the other axis. Settle and try again.');
        return;
      }
      capture.points.push({ ...c.last });
      if (companion) capture.companionPoints.push({ ...companion.last });
      const s = stats(capture.points);
      if (s.duration < capture.durationMs) return;
      const companionStats = companion ? stats(capture.companionPoints) : null;
      if (s.count < CONFIG.minCaptureSamples || !within(s, CONFIG[capture.kind]) ||
        (companionStats && (companionStats.count < CONFIG.minCaptureSamples || !within(companionStats, CONFIG[capture.companionKind])))) {
        this.cancel('Capture was not steady enough. Try again.');
        return;
      }
      this.outcome = { ok: true, kind: capture.kind, ...s, value: wrap(s.mean),
        completedAt: t,
        fullMotion: capture.fullMotion && this.motion.acceleration !== null,
        ...(companionStats ? { companion: { ...companionStats, value: wrap(companionStats.mean) } } : {}) };
      this.capture = null;
    }
    add(kind, t, value) {
      let c = this.channels[kind];
      if (!Number.isFinite(value)) {
        this.channels[kind] = channel();
        if (this.capture?.kind === kind) this.cancel('Angle data unavailable. Try enabling sensors again.');
        return;
      }
      if (c.last && t <= c.last.t) return;
      if (c.last && t - c.last.t > CONFIG.staleMs) {
        this.channels[kind] = c = channel();
        if (this.capture?.kind === kind) this.cancel('Sensor stream paused. Try again.');
      }
      const v = c.last ? c.last.v + delta(c.last.v, value) : wrap(value);
      const dt = c.last ? t - c.last.t : 0;
      c.last = { t, v };
      c.points.push(c.last);
      c.points = c.points.filter(p => p.t >= t - CONFIG.windowMs);
      const m = median(c.points.slice(-3).map(p => p.v));
      const tau = c.ready ? 450 : 180;
      c.filtered = c.filtered === null ? m : c.filtered + (1 - Math.exp(-dt / tau)) * (m - c.filtered);
    }
    tick(t) {
      for (const [kind, c] of Object.entries(this.channels)) {
        const fresh = c.last && t - c.last.t <= CONFIG.staleMs;
        const motionFresh = t - this.motion.t <= CONFIG.staleMs && this.motion.rotation !== null;
        c.summary = stats(c.points);
        let reason = '';
        const factor = c.ready ? CONFIG[kind].exit : 1;
        if (!fresh) reason = c.last ? 'Sensor paused' : 'Waiting for angle';
        else if (!motionFresh) reason = 'Waiting for motion';
        else if (this.motion.rotation > (c.ready ? 1.1 : .65) ||
          (this.motion.acceleration !== null && this.motion.acceleration > (c.ready ? .20 : .12))) reason = 'Hold still';
        else if (c.summary.count < CONFIG.minSamples || c.summary.duration < CONFIG.windowMs - 120) reason = 'Settling';
        else if (!within(c.summary, CONFIG[kind], factor) ||
          Math.abs(c.last.v - c.summary.mean) > CONFIG[kind].excursion * factor) reason = 'Hold still';
        if (reason) { c.since = null; c.ready = false; c.reason = reason; }
        else {
          if (c.since === null) c.since = t;
          c.ready = c.ready || t - c.since >= CONFIG.dwellMs;
          c.reason = c.ready ? 'Ready' : 'Settling';
        }
      }
      if (this.capture) {
        if (this.motion.acceleration === null) this.capture.fullMotion = false;
        if (!this.channels[this.capture.kind].ready ||
          (this.capture.companionKind && !this.channels[this.capture.companionKind].ready))
          this.cancel('Movement or interrupted sensors. Settle and try again.');
      }
    }
    status(kind, t) {
      this.tick(t);
      const c = this.channels[kind];
      const fresh = c.last && t - c.last.t <= CONFIG.staleMs;
      return { ready: c.ready, reason: c.reason,
        value: fresh ? wrap(c.filtered) : null, summary: c.summary,
        fullMotion: this.motion.acceleration !== null,
        progress: c.ready ? 1 : c.since === null ? 0 : Math.min(1, (t - c.since) / CONFIG.dwellMs) };
    }
    start(kind, t, options = {}) {
      this.tick(t);
      const durationMs = options.durationMs ?? CONFIG.captureMs;
      const companionKind = options.companionKind || null;
      if (!Number.isFinite(durationMs) || durationMs <= 0 || !this.channels[kind] ||
        this.capture || !this.channels[kind].ready ||
        (companionKind && (!this.channels[companionKind] || !this.channels[companionKind].ready))) return false;
      this.outcome = null;
      this.capture = { kind, start: t, durationMs, points: [], companionKind,
        companionPoints: [], companionBaseline: companionKind ? this.channels[companionKind].summary.mean : null,
        baseline: this.channels[kind].summary.mean,
        fullMotion: this.motion.acceleration !== null };
      return true;
    }
    cancel(reason) {
      if (this.capture) this.outcome = { ok: false, reason };
      this.capture = null;
    }
    takeOutcome() { const result = this.outcome; this.outcome = null; return result; }
  }

  // A Schmitt-style rounding boundary: .01° digits need an additional .008°
  // of movement to change. This never affects saved measurements.
  class Display {
    constructor() { this.value = null; }
    reset() { this.value = null; }
    update(value) {
      if (!Number.isFinite(value)) { this.reset(); return null; }
      if (this.value === null || Math.abs(delta(this.value, value)) >= .013)
        this.value = wrap(Math.round(value * 100) / 100);
      return this.value;
    }
  }
  function correctedToe(start, wheel, end, wheelName, invert = false) {
    const p = Math.max(0, Math.min(1, (wheel.t - start.t) / Math.max(1, end.t - start.t)));
    const drift = delta(start.value, end.value);
    const relative = delta(start.value + drift * p, wheel.value);
    return { toe: relative * (wheelName.endsWith('L') ? -1 : 1) * (invert ? -1 : 1), drift };
  }
  return { CONFIG, Engine, Display, stats, wrap, delta, correctedToe, camberFromOrientation };
});
