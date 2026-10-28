(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const { Engine, Display, wrap, correctedToe, camberFromOrientation, CONFIG } = TavSensors;
  const engine = new Engine();
  const { CaptureQueue } = TavCapture;
  const captureQueue = new CaptureQueue(engine);
  const referenceEngine = new Engine();
  const referenceQueue = new CaptureQueue(referenceEngine);
  let referenceStep = 0, referenceDraft = null, lastNumberPaint = -Infinity;
  let referencePoseOK = false;
  const displays = { camber: new Display(), yaw: new Display() };
  const WHEELS = ['FL', 'FR', 'RL', 'RR'];
  let selectedCamberWheel = 'FL', selectedToeWheel = 'FL';
  let toeStep = 0, toeStart = null, toeWheel = null, toeAccepted = false;
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
  let mountAxis = read('tavalign-mount-axis', 'roll');
  if (!['roll', 'pitch'].includes(mountAxis)) mountAxis = 'roll';
  const camberModel = () => mountPosition === 'flat' ? `screen-up-${mountAxis}-v1` : 'screen-plane-v1';
  let referenceProfile = read('tavalign-reference-profile', { schema: 1, models: {} });
  if (referenceProfile?.schema !== 1 || !referenceProfile.models) referenceProfile = { schema: 1, models: {} };
  const legacyCalibration = read('tavalign-camber-calibration', null);
  if (legacyCalibration?.model && Number.isFinite(legacyCalibration.zero) && !referenceProfile.models[legacyCalibration.model])
    referenceProfile.models[legacyCalibration.model] = { ...legacyCalibration, source: 'earlier fixture zero' };
  const savedCalibration = referenceProfile.models[camberModel()];
  let zeroRequired = !Number.isFinite(savedCalibration?.zero);
  // The old gamma zero is a different physical axis. Keep it in storage for
  // history, but never apply it to the corrected measurement.
  let camberZero = zeroRequired ? 0 : savedCalibration.zero;
  let invertCamber = read('tavalign-invert-camber', false) === true;
  let invertToe = read('tavalign-invert-toe', false) === true;
  $('#invertCamber').checked = invertCamber;
  $('#invertToe').checked = invertToe;
  $('#mountPosition').value = mountPosition;
  $('#mountAxis').value = mountAxis;
  let wrongMountPose = false;
  let diagnostic = { t: -Infinity, roll: null, pitch: null, beta: null, gamma: null };

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
  function applyReference() {
    const saved = referenceProfile.models[camberModel()];
    zeroRequired = !Number.isFinite(saved?.zero);
    camberZero = zeroRequired ? 0 : saved.zero;
    displays.camber.reset(); lastNumberPaint = -Infinity;
  }
  function referenceEntry(result) {
    return { zero: result.value, sd: result.sd, samples: result.count, durationMs: result.duration,
      fullMotion: result.fullMotion, capturedAt: Date.now() };
  }
  function selectWheel(type, wheel) {
    if (type === 'camber') selectedCamberWheel = wheel;
    else { selectedToeWheel = wheel; resetToeFlow(); }
    $$(`[data-picker="${type}"] button`).forEach(b => {
      b.classList.toggle('selected', b.dataset.wheel === wheel);
      b.setAttribute('aria-pressed', String(b.dataset.wheel === wheel));
    });
  }
  function openReferences() {
    cancelCapture(); referenceStep = 0; referenceDraft = null; referencePoseOK = false;
    referenceEngine.reset(); go('calibrationView');
  }
  function renderReferences(now) {
    if (view !== 'calibrationView') return;
    const outcome = referenceQueue.poll(now);
    if (outcome) {
      if (!outcome.ok) message(outcome.reason);
      else if (referenceStep === 0) {
        referenceDraft = {
          'screen-up-roll-v1': referenceEntry(outcome),
          'screen-up-pitch-v1': referenceEntry({ ...outcome.companion, fullMotion: outcome.fullMotion })
        };
        referenceStep = 1; referenceEngine.reset(); referencePoseOK = false;
        message('Face-up reference captured. Now support the assembly against a checked vertical reference.');
      } else if (referenceStep === 1 && referenceDraft) {
        referenceProfile = { schema: 1, models: { ...referenceProfile.models, ...referenceDraft,
          'screen-plane-v1': referenceEntry(outcome) }, completedAt: Date.now() };
        const stored = write('tavalign-reference-profile', referenceProfile);
        applyReference(); renderResults(); referenceDraft = null; referenceStep = 2;
        message(stored ? 'Both references saved on this browser. Your selected mounting position is unchanged.' :
          'References are available for this session, but browser storage is unavailable.');
      }
    }
    const titles = ['Face-up reference', 'Upright reference', 'References saved'];
    const instructions = [
      'Keep the phone seated in the fixture, screen facing up. Support the assembly in a level reference position, checked with a level. Tap once, then release and let it settle.',
      'With the same phone seating, support the fixture against an independently checked vertical surface, screen toward you. Tap once, then release. A wall is not automatically plumb.',
      'The face-up and upright references are stored separately and applied only to their matching mounting modes. Redo setup if the case, phone seating or fixture changes.'
    ];
    text('#calibrationStep', referenceStep < 2 ? `REFERENCE ${referenceStep + 1} OF 2` : 'COMPLETE');
    text('#calibrationTitle', titles[referenceStep]); text('#calibrationInstructions', instructions[referenceStep]);
    const state = referenceEngine.status('camber', now);
    text('#calibrationState', referenceStep === 2 ? 'Saved' : referenceQueue.job ?
      (referenceQueue.job.stage === 'averaging' ? 'Averaging a clean 3-second window…' : 'Release the button · waiting for a steady window…') :
      !referencePoseOK ? (referenceStep === 0 ? 'Place screen face up near level' : 'Support screen upright near vertical') : state.reason);
    $('#calibrationCaptureBtn').disabled = !enabled || referenceStep === 2 || !!referenceQueue.job;
    $('#calibrationCaptureBtn').classList.toggle('hidden', referenceStep === 2);
    text('#calibrationCaptureBtn', referenceStep === 0 ? 'Capture face-up reference' : 'Capture upright reference');
    text('#calibrationSkipBtn', referenceStep === 2 ? 'Continue to Camber' : 'Use existing zero / set up later');
    $('#calibrationProgress').value = referenceQueue.progress(now) * 100;
    text('#referenceSavedNote', referenceProfile.completedAt ?
      `Last full setup: ${new Date(referenceProfile.completedAt).toLocaleDateString()}. Stored in this browser; private browsing is temporary.` :
      'Previous zeros stay unchanged until both references finish.');
  }
  function magnitude(obj, keys) {
    return obj && keys.every(k => Number.isFinite(obj[k])) ? Math.hypot(...keys.map(k => obj[k])) : null;
  }
  function onOrientation(e) {
    if (document.hidden) return;
    const now = performance.now();
    // Device sensor axes do not change with the browser's portrait/landscape
    // layout. A camera-end-forward fixture must also work in landscape.
    diagnostic = { t: now, beta: e.beta, gamma: e.gamma,
      roll: camberFromOrientation(e.beta, e.gamma, 'flat', 'roll'),
      pitch: camberFromOrientation(e.beta, e.gamma, 'flat', 'pitch') };
    if (view === 'calibrationView' && referenceStep < 2) {
      const upright = camberFromOrientation(e.beta, e.gamma, 'vertical');
      referencePoseOK = referenceStep === 0 ?
        Number.isFinite(diagnostic.roll) && Math.abs(diagnostic.roll) < 10 && Math.abs(diagnostic.pitch) < 10 :
        Number.isFinite(upright) && Math.abs(upright) < 10;
      referenceEngine.orientation(now, referencePoseOK ? (referenceStep === 0 ? diagnostic.roll : upright) : null,
        referencePoseOK ? (referenceStep === 0 ? diagnostic.pitch : upright) : null);
    }
    const last = engine.channels.yaw.last;
    if (toeStep > 0 && toeStep < 3 && ((!Number.isFinite(e.alpha)) || (last && now - last.t > CONFIG.staleMs))) {
      cancelCapture(); resetToeFlow(); message('Yaw stream interrupted. Start with a fresh body reference.');
    }
    const camberAngle = camberFromOrientation(e.beta, e.gamma, mountPosition, mountAxis);
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
    referenceEngine.motionSample(now, rotation, magnitude(e.acceleration, ['x', 'y', 'z']));
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
      if (!referenceProfile.completedAt) openReferences();
    } catch (err) {
      text('#sensorState', err.message || 'Could not enable sensors. Reload and try again.');
      message(err.message || 'Could not enable sensors.'); $('#sensorBtn').disabled = false;
    } finally { requesting = false; }
  }
  function cancelCapture(note = '') {
    captureQueue.cancel(note); referenceQueue.cancel(note); pending = null;
    if (note) message(note);
  }
  function resetToeFlow() {
    toeStep = 0; toeStart = toeWheel = null; toeAccepted = false;
    $('#toeResultCard').classList.add('hidden'); renderToeStep();
  }
  function resetStream(note) {
    cancelCapture(); engine.reset(); displays.camber.reset(); displays.yaw.reset();
    diagnostic.t = -Infinity; wrongMountPose = false;
    referenceEngine.reset(); referencePoseOK = false;
    if (view === 'calibrationView') { referenceStep = 0; referenceDraft = null; }
    resetToeFlow(); message(note);
  }
  function startCapture(kind, purpose, advance = false) {
    if (pending) return;
    if (purpose === 'camber' && zeroRequired) { message('Average a fresh fixture zero before saving camber.'); return; }
    if (!enabled) { message('Enable sensors first.'); return; }
    captureQueue.arm(kind, performance.now(), { durationMs: purpose === 'zero' ? 3000 : 2000 });
    pending = { purpose, wheel: kind === 'camber' ? selectedCamberWheel : selectedToeWheel, step: toeStep, advance };
    message('Release the button and support the fixture. Capture will start when it settles.'); renderLive();
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
      referenceProfile.models[camberModel()] = referenceEntry(result);
      write('tavalign-reference-profile', referenceProfile);
      displays.camber.reset(); renderResults();
      message(`Fixture zero averaged and saved. Noise ${result.sd.toFixed(3)}° SD. Move to the wheel.`);
    } else if (p.purpose === 'camber') {
      record('camber', p.wheel, camber(result.value), result);
      message(`${p.wheel} camber saved: ${fmt(alignment.camber[p.wheel])}. ${qualityText('camber', p.wheel)}.`);
      if (p.advance) {
        const next = WHEELS[WHEELS.indexOf(p.wheel) + 1];
        if (next) {
          selectWheel('camber', next);
          message(`${p.wheel} saved: ${fmt(alignment.camber[p.wheel])}. Move to ${next}, then capture.`);
        } else {
          go('resultsView'); message('RR saved. Corner sequence complete; review the saved readings.');
        }
      }
    } else {
      if (p.step === 0) toeStart = result;
      if (p.step === 1) toeWheel = result;
      if (p.step === 2) {
        const r = correctedToe(toeStart, toeWheel, result, p.wheel, invertToe);
        const accepted = Math.abs(r.drift) <= .25;
        toeAccepted = accepted;
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
    const result = captureQueue.poll(now);
    if (result) finishCapture(result);
    renderReferences(now);
    const c = engine.status('camber', now), y = engine.status('yaw', now);
    if (toeStep > 0 && toeStep < 3 && ['Sensor paused', 'Waiting for angle', 'Waiting for motion'].includes(y.reason)) {
      cancelCapture(); resetToeFlow(); message('Sensor stream interrupted. Start with a fresh body reference.');
    }
    if (toeStart && toeStep < 3 && now - toeStart.t > 120000) {
      cancelCapture(); resetToeFlow(); message('Toe sequence expired after 2 minutes. Start with a fresh reference.');
    }
    const active = engine.capture;
    if (wrongMountPose) c.reason = 'Face screen up';
    const paintNumbers = now - lastNumberPaint >= 500;
    if (paintNumbers) {
      text('#camberReading', fmt(displays.camber.update(c.value === null ? null : camber(c.value))));
      text('#yawReading', fmt(displays.yaw.update(y.value)));
      lastNumberPaint = now;
    }
    if (c.value === null) text('#camberReading', '—');
    if (y.value === null) text('#yawReading', '—');
    for (const [kind, state, prefix] of [['camber', c, 'camber'], ['yaw', y, 'toe']]) {
      const capturing = active?.kind === kind;
      const armed = captureQueue.job?.kind === kind;
      text(`#${prefix}Stable`, capturing ? 'Averaging…' : armed ? 'Settling for capture…' : state.reason);
      $(`#${prefix}Stable`).classList.toggle('stable', state.ready);
      const progress = armed ? captureQueue.progress(now) : state.progress;
      $(`#${prefix}Progress`).value = Math.round(progress * 100);
      if (paintNumbers || !state.ready) text(`#${prefix}Quality`, state.ready && state.summary ?
        `Signal noise ${state.summary.sd.toFixed(2)}° SD · ${state.fullMotion ? 'motion checked' : 'rotation only'}` :
        'Hold the fixture still until Ready');
    }
    $('#saveCamberBtn').disabled = !!pending || !enabled || c.value === null || zeroRequired;
    $('#captureNextBtn').disabled = $('#saveCamberBtn').disabled;
    $('#zeroCamberBtn').disabled = !!pending || !enabled || c.value === null;
    $('#toeCaptureBtn').disabled = !!pending || (toeStep !== 3 && (!enabled || y.value === null));
    text('#saveCamberBtn', zeroRequired ? 'Set fixture zero first' : `Capture ${selectedCamberWheel} only`);
    text('#captureNextBtn', pending?.purpose === 'camber' ? 'Capturing…' : selectedCamberWheel === 'RR' ? 'Capture RR & finish' : `Capture ${selectedCamberWheel} & next corner`);
    const busy = !!pending || !!referenceQueue.job;
    $('#cancelCaptureBtn').classList.toggle('hidden', !busy);
    $('#captureProgress').classList.toggle('hidden', !busy);
    $('#captureProgress').value = 100 * (referenceQueue.job ? referenceQueue.progress(now) : captureQueue.progress(now));
    if (pending && captureQueue.job) message(captureQueue.job.stage === 'averaging' ?
      `Averaging ${pending.wheel === undefined ? '' : pending.wheel + ' '}— keep the fixture supported.` :
      `Waiting for a steady window${captureQueue.job.attempts > 0 ? ' · movement detected, trying again' : ' · release the button'}.`);
    if (enabled) {
      const live = c.value !== null || y.value !== null;
      text('#sensorState', live ? 'Receiving sensors · steady display' : 'Waiting for sensors · keep the app open');
      $('#sensorState').className = `status ${live ? 'good' : 'bad'}`;
    }
    text('#camberCaption', mountPosition === 'flat' ? (mountAxis === 'roll' ? 'SCREEN UP · LEFT / RIGHT EDGE TILT' : 'SCREEN UP · CAMERA / CHARGING END TILT') : 'SCREEN OUTWARD · TILT FROM VERTICAL');
    $('#axisControl').classList.toggle('hidden', mountPosition !== 'flat');
    text('#mountInstructions', mountPosition === 'flat' ?
      `Keep the phone seated, screen facing the sky. ${mountAxis === 'roll' ? 'Measure tilt across the left/right edges; the camera end can point toward the front of the car.' : 'Measure tilt between the camera and charging ends.'} Set the assembled fixture in its known-level reference position and average the zero. Do not zero against the wheel being measured.` :
      'Keep the phone seated with its screen outward, parallel to the wheel face. Set the fixture contact points against a known vertical reference and average the zero.');
    text('#zeroNote', zeroRequired ? 'Set a reference zero for this mounting position and axis before saving.' : `Saved reference: ${fmt(camberZero)} · stored on this browser`);
    const freshDiagnostic = now - diagnostic.t <= CONFIG.staleMs;
    if (paintNumbers || !freshDiagnostic) {
      text('#diagnosticRoll', fmt(freshDiagnostic ? diagnostic.roll : null));
      text('#diagnosticPitch', fmt(freshDiagnostic ? diagnostic.pitch : null));
      text('#diagnosticBeta', fmt(freshDiagnostic ? diagnostic.beta : null));
      text('#diagnosticGamma', fmt(freshDiagnostic ? diagnostic.gamma : null));
    }
    text('#diagnosticPose', !freshDiagnostic ? 'Waiting for current sensor data.' : wrongMountPose ?
      'The screen is not facing upward. If it faces you while against the wall or wheel, select Facing outward from the wheel.' :
      'These checks show unzeroed tilt. They ignore the fixture zero and invert setting.');
    renderDock();
  }
  function renderDock() {
    const showCamber = view === 'camberView';
    const showToe = view === 'toeView';
    const showCalibration = view === 'calibrationView' && referenceStep < 2;
    const visible = showCamber || showToe || showCalibration;
    $('#captureDock').classList.toggle('hidden', !visible);
    $('#dockCamber').classList.toggle('hidden', !showCamber);
    $('#dockToe').classList.toggle('hidden', !showToe);
    $('#dockCalibration').classList.toggle('hidden', !showCalibration);
    document.body.classList.toggle('has-capture-dock', visible);
    const queue = showCalibration ? referenceQueue : captureQueue;
    text('#dockStatus', queue.job ? (queue.job.stage === 'averaging' ? 'Averaging · keep supported' : 'Release your thumb · waiting to settle') :
      showCamber ? `${selectedCamberWheel} camber · tap and release` :
      showToe ? `${selectedToeWheel} toe · ${toeStep < 3 ? `step ${toeStep + 1} of 3` : 'capture complete'}` : 'Reference setup · tap and release');
    // On an accepted toe result, Next corner becomes the bottom primary action.
    const nextToe = toeStep === 3 && toeAccepted;
    $('#toeCaptureBtn').classList.toggle('primary', !nextToe);
    $('#toeCaptureBtn').classList.toggle('text-btn', nextToe);
    $('#toeNextBtn').classList.toggle('primary', nextToe);
    updateDockSpace();
  }
  function updateDockSpace() {
    const height = $('#captureDock').classList.contains('hidden') ? 0 : $('#captureDock').getBoundingClientRect().height;
    const value = `${Math.ceil(height)}px`;
    if (document.documentElement.style.getPropertyValue('--capture-dock-height') !== value)
      document.documentElement.style.setProperty('--capture-dock-height', value);
  }
  function renderToeStep() {
    $('#toeNextBtn').classList.toggle('hidden', toeStep !== 3 || !toeAccepted);
    text('#toeNextBtn', selectedToeWheel === 'RR' ? 'Finish & review alignment' : `Next corner: ${WHEELS[WHEELS.indexOf(selectedToeWheel) + 1]}`);
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
    for (const type of ['camber', 'toe']) {
      $$(`[data-picker="${type}"] button`).forEach(b => {
        const wheel = b.dataset.wheel;
        b.querySelector('.wheel-value').textContent = fmt(alignment[type][wheel]);
        const q = alignment.quality[type][wheel];
        const stale = Number.isFinite(alignment[type][wheel]) && (!q || q.context !== context(type));
        b.classList.toggle('needs-check', stale);
        b.querySelector('.wheel-marker').textContent = stale ? '*' : '';
        b.setAttribute('aria-label', `${wheel}, ${fmt(alignment[type][wheel])}${stale ? ', earlier reference: remeasure' : ''}`);
        b.title = `${wheel}: ${fmt(alignment[type][wheel])}${stale ? ' · earlier reference, remeasure' : ''}`;
      });
    }
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
    if (view === 'calibrationView' && id !== view) { referenceDraft = null; referenceStep = 0; referenceEngine.reset(); }
    if (view === 'toeView' && toeStep > 0 && toeStep < 3) resetToeFlow();
    view = id;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
    $(`#${id} [data-feedback]`).appendChild($('.capture-feedback'));
    message(''); renderResults(); renderLive(); window.scrollTo(0, 0);
  }
  $('#sensorBtn').addEventListener('click', enableSensors);
  $('#calibrationStartBtn').addEventListener('click', openReferences);
  $('#homeCalibrationBtn').addEventListener('click', openReferences);
  $('#calibrationAgainBtn').addEventListener('click', openReferences);
  $('#calibrationSkipBtn').addEventListener('click', () => go('camberView'));
  $('#calibrationCaptureBtn').addEventListener('click', () => {
    if (!enabled || referenceStep >= 2 || referenceQueue.job) return;
    referenceQueue.arm('camber', performance.now(), { durationMs: 3000, companionKind: 'yaw' });
    message('Release the button and support the assembly. A fresh steady window will be averaged automatically.');
    renderLive();
  });
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
  $('#captureNextBtn').addEventListener('click', () => startCapture('camber', 'camber', true));
  $('#zeroCamberBtn').addEventListener('click', () => startCapture('camber', 'zero'));
  $('#mountPosition').addEventListener('change', e => {
    mountPosition = e.target.value;
    write('tavalign-mount-position', mountPosition);
    applyReference();
    wrongMountPose = false;
    resetStream('Mount position changed. Check the reference instructions and fixture zero.');
    renderResults(); renderLive();
  });
  $('#mountAxis').addEventListener('change', e => {
    mountAxis = e.target.value;
    write('tavalign-mount-axis', mountAxis);
    applyReference();
    resetStream('Measurement axis changed. Average a matching fixture zero before saving.');
    renderResults(); renderLive();
  });
  $('#clearCamberBtn').addEventListener('click', () => {
    cancelCapture(); camberZero = 0; zeroRequired = true; write('tavalign-camber-calibration', null);
    delete referenceProfile.models[camberModel()]; referenceProfile.completedAt = null;
    write('tavalign-reference-profile', referenceProfile);
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
  $('#toeNextBtn').addEventListener('click', () => {
    if (!toeAccepted || toeStep !== 3) return;
    const next = WHEELS[WHEELS.indexOf(selectedToeWheel) + 1];
    if (next) { selectWheel('toe', next); message(`Move to ${next} and start with its body reference.`); }
    else go('resultsView');
  });
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
  const screenChange = () => {
    if (view === 'calibrationView') {
      referenceQueue.cancel(); referenceEngine.reset(); referencePoseOK = false;
      message('Phone rotated. Support the new position, then tap Capture.');
    } else resetStream('Phone rotated. Hold still before capturing again.');
  };
  window.addEventListener('orientationchange', screenChange);
  screen.orientation?.addEventListener('change', screenChange);
  $('#homeView [data-feedback]').appendChild($('.capture-feedback'));
  // Move the existing controls, preserving their listeners and state. The dock
  // sits outside animated views so its fixed position always follows the viewport.
  $('#dockCamber').append($('#saveCamberBtn'), $('#captureNextBtn'));
  $('#dockToe').append($('#toeCaptureBtn'), $('#toeNextBtn'));
  $('#dockCalibration').append($('#calibrationCaptureBtn'));
  $('#dockCancel').append($('#cancelCaptureBtn'));
  $('#dockProgress').append($('#captureProgress'));
  if ('ResizeObserver' in window) new ResizeObserver(updateDockSpace).observe($('#captureDock'));
  window.addEventListener('resize', updateDockSpace);
  $$('[data-picker] button').forEach(b => {
    const name = document.createElement('span'), value = document.createElement('span'), marker = document.createElement('span');
    name.className = 'wheel-name'; name.textContent = b.dataset.wheel;
    value.className = 'wheel-value'; value.textContent = '—';
    marker.className = 'wheel-marker'; marker.setAttribute('aria-hidden', 'true');
    b.replaceChildren(name, value, marker);
    b.setAttribute('aria-pressed', String(b.classList.contains('selected')));
  });
  renderResults(); renderToeStep(); renderLive();
  setInterval(() => { if (!document.hidden) renderLive(); }, 100);
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
