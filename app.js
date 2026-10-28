(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const { Engine, Display, wrap, correctedToe, camberFromOrientation, CONFIG } = TavSensors;
  const engine = new Engine();
  const displays = { camber: new Display(), yaw: new Display() };
  const WHEELS = ['FL', 'FR', 'RL', 'RR'];
  let selectedCamberWheel = 'FL', selectedToeWheel = 'FL';
  let toeStep = 0, toeStart = null, toeWheel = null;
  let pending = null, enabled = false, requesting = false, view = 'homeView';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { $('#storageNote').textContent = 'Storage unavailable. Readings will last only while this app is open.'; return false; }
  };
  let alignment = read('tavalign-current', null);
  if (!alignment || typeof alignment !== 'object' || !alignment.camber || !alignment.toe)
    alignment = { camber: {}, toe: {}, createdAt: Date.now() };
  alignment.quality ||= { camber: {}, toe: {} };
  alignment.quality.camber ||= {};
  alignment.quality.toe ||= {};
  let mountPosition = read('tavalign-mount-position', 'flat');
  if (!['flat', 'vertical'].includes(mountPosition)) mountPosition = 'flat';
  const camberModel = () => mountPosition === 'flat' ? 'screen-up-pitch-v1' : 'screen-plane-v1';
  const savedCalibration = read('tavalign-camber-calibration', null);
  let zeroRequired = savedCalibration?.model !== camberModel() || !Number.isFinite(savedCalibration?.zero);
  // The old gamma zero is a different physical axis. Keep it in storage for
  // history, but never apply it to the corrected measurement.
  let camberZero = zeroRequired ? 0 : savedCalibration.zero;
  let invertCamber = read('tavalign-invert-camber', false) === true;
  let invertToe = read('tavalign-invert-toe', false) === true;
  $('#invertCamber').checked = invertCamber;
  $('#invertToe').checked = invertToe;
  $('#mountPosition').value = mountPosition;
  let wrongMountPose = false;

  function fmt(value) {
    if (!Number.isFinite(value)) return '—';
    const v = Math.round(value * 100) / 100;
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}°`;
  }
  function text(selector, value) {
    const el = $(selector);
    if (el.textContent !== value) el.textContent = value;
  }
  function message(value) { text('#captureMessage', value); }
  function saveCurrent() { write('tavalign-current', alignment); renderResults(); }
  function camber(value) { return wrap(value - camberZero) * (invertCamber ? -1 : 1); }
  function magnitude(obj, keys) {
    return obj && keys.every(k => Number.isFinite(obj[k])) ? Math.hypot(...keys.map(k => obj[k])) : null;
  }
  function onOrientation(e) {
    if (document.hidden) return;
    const now = performance.now();
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    if (angle !== 0) return;
    const last = engine.channels.yaw.last;
    if (toeStep > 0 && toeStep < 3 && ((!Number.isFinite(e.alpha)) || (last && now - last.t > CONFIG.staleMs))) {
      cancelCapture(); resetToeFlow(); message('Yaw stream interrupted. Start with a fresh body reference.');
    }
    const camberAngle = camberFromOrientation(e.beta, e.gamma, mountPosition);
    wrongMountPose = Number.isFinite(e.beta) && Number.isFinite(e.gamma) && camberAngle === null;
    engine.orientation(now, camberAngle, e.alpha);
  }
  function onMotion(e) {
    if (document.hidden) return;
    const now = performance.now();
    const rotation = magnitude(e.rotationRate, ['alpha', 'beta', 'gamma']);
    if (toeStep > 0 && toeStep < 3 && (rotation === null || now - engine.motion.t > CONFIG.staleMs)) {
      cancelCapture(); resetToeFlow(); message('Motion stream interrupted. Start with a fresh body reference.');
    }
    engine.motionSample(now, rotation, magnitude(e.acceleration, ['x', 'y', 'z']));
  }
  async function enableSensors() {
    if (enabled || requesting) return;
    requesting = true; $('#sensorBtn').disabled = true;
    try {
      if (!window.isSecureContext) throw new Error('Open TavAlign using its HTTPS GitHub Pages address.');
      if (!window.DeviceOrientationEvent || !window.DeviceMotionEvent)
        throw new Error('Motion sensors are unavailable in this browser or device.');
      // Invoke both requests within the original tap activation, before awaiting.
      const permissions = [window.DeviceMotionEvent, window.DeviceOrientationEvent].map(api =>
        typeof api.requestPermission === 'function' ? api.requestPermission() : Promise.resolve('granted'));
      if ((await Promise.all(permissions)).some(p => p !== 'granted'))
        throw new Error('Motion access was denied. Allow it in browser settings, then reload.');
      window.addEventListener('deviceorientation', onOrientation, true);
      window.addEventListener('devicemotion', onMotion, true);
      engine.reset(); enabled = true; text('#sensorBtn', 'Sensors on');
    } catch (err) {
      text('#sensorState', err.message || 'Could not enable sensors. Reload and try again.');
      message(err.message || 'Could not enable sensors.'); $('#sensorBtn').disabled = false;
    } finally { requesting = false; }
  }
  function cancelCapture(note = '') {
    engine.cancel(note); engine.takeOutcome(); pending = null;
    if (note) message(note);
  }
  function resetToeFlow() {
    toeStep = 0; toeStart = toeWheel = null;
    $('#toeResultCard').classList.add('hidden'); renderToeStep();
  }
  function resetStream(note) {
    cancelCapture(); engine.reset(); displays.camber.reset(); displays.yaw.reset();
    resetToeFlow(); message(note);
  }
  function startCapture(kind, purpose) {
    if (pending) return;
    if (purpose === 'camber' && zeroRequired) { message('Average a fresh fixture zero before saving camber.'); return; }
    if (!engine.start(kind, performance.now())) { message('Wait for Ready, then capture.'); return; }
    pending = { purpose, wheel: kind === 'camber' ? selectedCamberWheel : selectedToeWheel, step: toeStep };
    message('Averaging for 1.5 seconds. Keep the fixture still.'); renderLive();
  }
  function context(type) { return type === 'camber' ? `${camberModel()}:${camberZero}:${invertCamber}` : String(invertToe); }
  function record(type, wheel, value, capture, extra = {}) {
    const old = alignment.quality[type][wheel];
    const history = old?.context === context(type) && Array.isArray(old.history) ? old.history : [];
    const item = { value, sd: capture.sd, samples: capture.count, durationMs: capture.duration,
      fullMotion: capture.fullMotion, capturedAt: Date.now(), ...extra };
    alignment[type][wheel] = value;
    alignment.quality[type][wheel] = { ...item, context: context(type), history: [...history, item].slice(-5) };
    saveCurrent();
  }
  function qualityText(type, wheel) {
    const q = alignment.quality[type][wheel];
    if (type === 'camber' && Number.isFinite(alignment.camber[wheel]) && !q?.context?.startsWith(`${camberModel()}:`))
      return 'Different mounting reference · measure again';
    if (!q) return Number.isFinite(alignment[type][wheel]) ? 'Earlier reading · repeat check needed' : 'No capture yet';
    if (q.context !== context(type)) return 'Settings changed · measure again';
    const values = (q.history || []).map(h => h.value);
    const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
    const repeat = values.length >= 3 ?
      (spread <= (type === 'camber' ? .10 : .15) ? 'Repeatable' : 'Repeat spread is high') : 'Repeat check incomplete';
    return `${repeat} · ${values.length}/5 captures${values.length > 1 ? ` · spread ${spread.toFixed(2)}°` : ''}` +
      `${!q.fullMotion ? ' · limited motion check' : ''}`;
  }
  function finishCapture(result) {
    const p = pending; pending = null;
    if (!p) return;
    if (!result.ok) { message(result.reason); return; }
    if (p.purpose === 'zero') {
      camberZero = result.value; zeroRequired = false;
      write('tavalign-camber-calibration', { model: camberModel(), zero: camberZero });
      displays.camber.reset(); renderResults();
      message(`Fixture zero averaged and saved. Noise ${result.sd.toFixed(3)}° SD. Move to the wheel.`);
    } else if (p.purpose === 'camber') {
      record('camber', p.wheel, camber(result.value), result);
      message(`${p.wheel} camber saved: ${fmt(alignment.camber[p.wheel])}. ${qualityText('camber', p.wheel)}.`);
    } else {
      if (p.step === 0) toeStart = result;
      if (p.step === 1) toeWheel = result;
      if (p.step === 2) {
        const r = correctedToe(toeStart, toeWheel, result, p.wheel, invertToe);
        const accepted = Math.abs(r.drift) <= .25;
        const captures = [toeStart, toeWheel, result];
        if (accepted) record('toe', p.wheel, r.toe,
          { ...result, sd: Math.max(...captures.map(s => s.sd)), fullMotion: captures.every(s => s.fullMotion) },
          { drift: r.drift, captures });
        text('#toeResultLabel', `${p.wheel} toe${accepted ? '' : ' · not saved'}`);
        text('#toeResult', fmt(r.toe)); text('#driftResult', fmt(r.drift));
        text('#driftNote', accepted ?
          `${Math.abs(r.drift) <= .10 ? 'Low' : 'Moderate'} reference drift. ${qualityText('toe', p.wheel)}. Drift correction assumes gradual drift.` :
          'Reference drift exceeded 0.25°. This attempt was not saved. Repeat all three steps; any earlier saved reading is unchanged.');
        $('#toeResultCard').classList.remove('hidden');
        message(accepted ? `${p.wheel} toe averaged and saved.` : 'Too much reference drift. Repeat this wheel.');
      } else message('Capture complete. Move to the next position and wait for Ready.');
      toeStep++;
      // Require a new dwell at each position, even when the move is tiny.
      for (const c of Object.values(engine.channels)) { c.ready = false; c.since = null; }
      renderToeStep();
    }
  }
  function renderLive() {
    const now = performance.now();
    const c = engine.status('camber', now), y = engine.status('yaw', now);
    const result = engine.takeOutcome();
    if (result) finishCapture(result);
    if (toeStep > 0 && toeStep < 3 && ['Sensor paused', 'Waiting for angle', 'Waiting for motion'].includes(y.reason)) {
      cancelCapture(); resetToeFlow(); message('Sensor stream interrupted. Start with a fresh body reference.');
    }
    if (toeStart && toeStep < 3 && now - toeStart.t > 120000) {
      cancelCapture(); resetToeFlow(); message('Toe sequence expired after 2 minutes. Start with a fresh reference.');
    }
    const active = engine.capture;
    if (wrongMountPose) c.reason = 'Face screen up';
    text('#camberReading', fmt(displays.camber.update(c.value === null ? null : camber(c.value))));
    text('#yawReading', fmt(displays.yaw.update(y.value)));
    for (const [kind, state, prefix] of [['camber', c, 'camber'], ['yaw', y, 'toe']]) {
      const capturing = active?.kind === kind;
      text(`#${prefix}Stable`, capturing ? 'Averaging…' : state.reason);
      $(`#${prefix}Stable`).classList.toggle('stable', state.ready);
      const progress = capturing ? Math.min(1, (now - active.start) / CONFIG.captureMs) : state.progress;
      $(`#${prefix}Progress`).value = Math.round(progress * 100);
      text(`#${prefix}Quality`, state.ready && state.summary ?
        `Signal noise ${state.summary.sd.toFixed(2)}° SD · ${state.fullMotion ? 'motion checked' : 'rotation only'}` :
        'Hold the fixture still until Ready');
    }
    $('#saveCamberBtn').disabled = !!pending || !c.ready || zeroRequired;
    $('#zeroCamberBtn').disabled = !!pending || !c.ready;
    $('#toeCaptureBtn').disabled = !!pending || (toeStep !== 3 && !y.ready);
    text('#saveCamberBtn', pending?.purpose === 'camber' ? 'Averaging…' : zeroRequired ? 'Set fixture zero first' : `Capture ${selectedCamberWheel} camber`);
    $('#cancelCaptureBtn').classList.toggle('hidden', !pending);
    $('#captureProgress').classList.toggle('hidden', !pending);
    $('#captureProgress').value = active ? Math.min(100, (now - active.start) / CONFIG.captureMs * 100) : 0;
    if (enabled) {
      const live = c.value !== null || y.value !== null;
      text('#sensorState', live ? 'Receiving sensors · steady display' : 'Waiting for sensors · keep the app open');
      $('#sensorState').className = `status ${live ? 'good' : 'bad'}`;
    }
    text('#camberCaption', mountPosition === 'flat' ? 'SCREEN UP · SIGNED FORWARD / BACK TILT' : 'SCREEN OUTWARD · TILT FROM VERTICAL');
    text('#mountInstructions', mountPosition === 'flat' ?
      'Keep the phone seated in the mount, screen facing the sky. Set the assembled fixture in its known-level reference position and average the zero. Keep the same seating and direction when measuring. Do not zero against the wheel being measured.' :
      'Keep the phone seated with its screen outward, parallel to the wheel face. Set the fixture contact points against a known vertical reference and average the zero.');
    text('#zeroNote', zeroRequired ? 'v2.2: average a fresh fixture zero for this mounting position before saving camber.' : `Saved fixture zero: ${fmt(camberZero)} · v2.2`);
  }
  function renderToeStep() {
    const titles = ['Body reference', 'Wheel', 'Body reference again', 'Measurement complete'];
    const texts = [
      `Place the fixture against a straight reference parallel to vehicle centerline on the ${selectedToeWheel.endsWith('L') ? 'left' : 'right'} side.`,
      `Move directly to ${selectedToeWheel}. Keep the phone portrait, screen outward, and do not flip its orientation.`,
      'Return to the exact same body reference point and orientation.',
      'Review the drift check below. Positive is toe-in; negative is toe-out.'
    ];
    text('#toeStepLabel', toeStep < 3 ? `STEP ${toeStep + 1} OF 3` : 'DONE');
    text('#toeStepTitle', titles[toeStep]); text('#toeStepText', texts[toeStep]);
    text('#toeCaptureBtn', ['Capture reference', 'Capture wheel', 'Capture final reference', 'Measure again'][toeStep]);
  }
  function renderResults() {
    WHEELS.forEach(w => {
      text(`#${w}-camber`, fmt(alignment.camber[w])); text(`#${w}-toe`, fmt(alignment.toe[w]));
      text(`#${w}-quality`, `${w} — Camber: ${qualityText('camber', w)}. Toe: ${qualityText('toe', w)}.`);
    });
    const { FL, FR, RL, RR } = alignment.toe;
    text('#frontTotal', fmt(Number.isFinite(FL) && Number.isFinite(FR) ? FL + FR : null));
    text('#rearTotal', fmt(Number.isFinite(RL) && Number.isFinite(RR) ? RL + RR : null));
    text('#frontSteer', fmt(Number.isFinite(FL) && Number.isFinite(FR) ? (FR - FL) / 2 : null));
    text('#rearThrust', fmt(Number.isFinite(RL) && Number.isFinite(RR) ? (RR - RL) / 2 : null));
  }
  function go(id) {
    cancelCapture();
    if (view === 'toeView' && toeStep > 0 && toeStep < 3) resetToeFlow();
    view = id;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
    $(`#${id} [data-feedback]`).appendChild($('.capture-feedback'));
    message(''); renderResults(); renderLive(); window.scrollTo(0, 0);
  }
  $('#sensorBtn').addEventListener('click', enableSensors);
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  $$('[data-picker] button').forEach(b => b.addEventListener('click', () => {
    cancelCapture(); message('');
    const type = b.closest('[data-picker]').dataset.picker;
    if (type === 'camber') selectedCamberWheel = b.dataset.wheel;
    else { selectedToeWheel = b.dataset.wheel; resetToeFlow(); }
    b.parentElement.querySelectorAll('button').forEach(x => {
      x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b));
    });
    renderLive();
  }));
  $('#saveCamberBtn').addEventListener('click', () => startCapture('camber', 'camber'));
  $('#zeroCamberBtn').addEventListener('click', () => startCapture('camber', 'zero'));
  $('#mountPosition').addEventListener('change', e => {
    mountPosition = e.target.value;
    write('tavalign-mount-position', mountPosition);
    const calibration = read('tavalign-camber-calibration', null);
    zeroRequired = calibration?.model !== camberModel() || !Number.isFinite(calibration?.zero);
    camberZero = zeroRequired ? 0 : calibration.zero;
    wrongMountPose = false;
    resetStream('Mount position changed. Check the reference instructions and fixture zero.');
    renderResults(); renderLive();
  });
  $('#clearCamberBtn').addEventListener('click', () => {
    cancelCapture(); camberZero = 0; zeroRequired = true; write('tavalign-camber-calibration', null);
    displays.camber.reset(); renderResults(); renderLive(); message('Fixture zero cleared. Average a fresh zero before saving camber.');
  });
  $('#invertCamber').addEventListener('change', e => {
    cancelCapture(); invertCamber = e.target.checked; write('tavalign-invert-camber', invertCamber);
    displays.camber.reset(); renderResults(); renderLive(); message('Camber sign changed. Measure again to update saved readings.');
  });
  $('#invertToe').addEventListener('change', e => {
    cancelCapture(); invertToe = e.target.checked; write('tavalign-invert-toe', invertToe);
    resetToeFlow(); renderResults(); message('Toe polarity changed. Measure again to update saved readings.');
  });
  $('#toeCaptureBtn').addEventListener('click', () => {
    if (toeStep === 3) { resetToeFlow(); message(''); }
    else startCapture('yaw', 'toe');
  });
  $('#restartToeBtn').addEventListener('click', () => { cancelCapture(); resetToeFlow(); message('Toe sequence restarted.'); });
  $('#cancelCaptureBtn').addEventListener('click', () => { cancelCapture('Capture cancelled.'); renderLive(); });
  $('#resetSessionBtn').addEventListener('click', () => {
    if (!confirm('Reset the current alignment readings and repeat checks?')) return;
    cancelCapture(); resetToeFlow();
    alignment = { camber: {}, toe: {}, quality: { camber: {}, toe: {} }, createdAt: Date.now() };
    saveCurrent(); text('#archiveMsg', ''); message('Current alignment reset. Fixture zero retained.');
  });
  $('#repeatResetBtn').addEventListener('click', () => {
    for (const type of ['camber', 'toe']) for (const q of Object.values(alignment.quality[type])) q.history = [];
    saveCurrent(); message('New repeat check started. Saved angles retained. Remove and reseat the fixture between captures.');
  });
  $('#archiveBtn').addEventListener('click', () => {
    const stored = read('tavalign-archive', []);
    const sessions = Array.isArray(stored) ? stored : [];
    sessions.unshift({ ...alignment, archivedAt: Date.now() });
    const saved = write('tavalign-archive', sessions.slice(0, 30));
    text('#archiveMsg', saved ? 'Alignment archived on this device.' : 'Archive could not be saved to this device.');
  });
  document.addEventListener('visibilitychange', () => {
    resetStream(document.hidden ? '' : 'Sensors are settling again. Any unfinished toe sequence was reset.');
    if (!document.hidden) renderLive();
  });
  window.addEventListener('pagehide', () => resetStream(''));
  window.addEventListener('pageshow', e => { if (e.persisted) resetStream('Sensors are settling again.'); });
  const screenChange = () => resetStream('Phone orientation changed. Keep portrait and start again.');
  window.addEventListener('orientationchange', screenChange);
  screen.orientation?.addEventListener('change', screenChange);
  $('#homeView [data-feedback]').appendChild($('.capture-feedback'));
  renderResults(); renderToeStep(); renderLive();
  setInterval(() => { if (!document.hidden) renderLive(); }, 200);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });
        const showUpdate = () => $('#updateBanner').classList.toggle('hidden', !registration.waiting);
        showUpdate();
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', showUpdate);
        });
        $('#updateBtn').addEventListener('click', () => {
          cancelCapture();
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
        });
        registration.update().catch(() => {});
      } catch { text('#offlineNote', 'Offline cache unavailable. Keep an internet connection.'); }
    });
  }
})();
