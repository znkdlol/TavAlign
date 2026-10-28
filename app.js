
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const WHEELS = ["FL", "FR", "RL", "RR"];
  let selectedCamberWheel = "FL";
  let selectedToeWheel = "FL";
  let toeStep = 0;
  let toeStart = null, toeWheel = null, toeEnd = null;

  let current = {
    alpha: 0,
    beta: 0,
    gamma: 0,
    rotationRate: 999,
    accelerationMag: 999,
    lastMotionAt: 0
  };

  let alignment = loadJSON("tavalign-current", {
    camber: {}, toe: {}, createdAt: Date.now()
  });

  let camberZero = parseFloat(localStorage.getItem("tavalign-camber-zero") || "0");
  let invertCamber = localStorage.getItem("tavalign-invert-camber") === "true";
  let invertToe = localStorage.getItem("tavalign-invert-toe") === "true";
  $("#invertCamber").checked = invertCamber;
  $("#invertToe").checked = invertToe;

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function saveCurrent() {
    localStorage.setItem("tavalign-current", JSON.stringify(alignment));
    renderResults();
  }

  function fmt(v) {
    if (v === undefined || v === null || !Number.isFinite(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`;
  }

  function normalizeDeg(v) {
    v %= 360;
    if (v >= 180) v -= 360;
    if (v < -180) v += 360;
    return v;
  }

  function deltaDeg(from, to) {
    return normalizeDeg(to - from);
  }

  function stabilityScore() {
    const rr = Math.min(current.rotationRate / 6.0, 1);
    const aa = Math.min(current.accelerationMag / 0.35, 1);
    return Math.max(0, 1 - Math.max(rr, aa));
  }

  function isStable() {
    return stabilityScore() > 0.62;
  }

  function setStability(el) {
    const stable = isStable();
    el.textContent = stable ? "Stable" : "Hold still";
    el.classList.toggle("stable", stable);
  }

  function rawCamber() {
    // DeviceOrientation gamma = left/right tilt in portrait. Fixture zero removes
    // constant mounting bias. User can invert if their fixture orientation flips sign.
    return normalizeDeg(current.gamma - camberZero);
  }

  function displayedCamber() {
    let v = rawCamber();
    if (invertCamber) v *= -1;
    return v;
  }

  async function enableSensors() {
    try {
      let granted = true;

      if (typeof DeviceMotionEvent !== "undefined" &&
          typeof DeviceMotionEvent.requestPermission === "function") {
        const motionPermission = await DeviceMotionEvent.requestPermission();
        granted = granted && motionPermission === "granted";
      }

      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        const orientationPermission = await DeviceOrientationEvent.requestPermission();
        granted = granted && orientationPermission === "granted";
      }

      if (!granted) throw new Error("Sensor permission denied");

      window.addEventListener("deviceorientation", onOrientation, true);
      window.addEventListener("devicemotion", onMotion, true);

      $("#sensorState").textContent = "Sensors enabled";
      $("#sensorState").className = "status good";
      $("#sensorBtn").textContent = "Sensors on";
      $("#sensorBtn").disabled = true;
    } catch (err) {
      $("#sensorState").textContent = "Motion access was not granted";
      $("#sensorState").className = "status bad";
      alert("TavAlign needs Motion & Orientation access. Reload the page and tap Enable sensors again.");
    }
  }

  function onOrientation(e) {
    if (typeof e.alpha === "number") current.alpha = e.alpha;
    if (typeof e.beta === "number") current.beta = e.beta;
    if (typeof e.gamma === "number") current.gamma = e.gamma;
    renderLive();
  }

  function onMotion(e) {
    const rr = e.rotationRate || {};
    const vals = [rr.alpha, rr.beta, rr.gamma].filter(Number.isFinite);
    current.rotationRate = vals.length
      ? Math.sqrt(vals.reduce((s, v) => s + v*v, 0))
      : 0;

    const a = e.acceleration || {};
    const av = [a.x, a.y, a.z].map(v => Number.isFinite(v) ? v : 0);
    current.accelerationMag = Math.sqrt(av[0]**2 + av[1]**2 + av[2]**2);
    current.lastMotionAt = performance.now();
    renderLive();
  }

  function renderLive() {
    $("#camberReading").textContent = fmt(displayedCamber());
    $("#yawReading").textContent = fmt(normalizeDeg(current.alpha));
    setStability($("#camberStable"));
    setStability($("#toeStable"));
  }

  function snapshot() {
    if (!isStable()) return null;
    return {
      t: performance.now(),
      alpha: normalizeDeg(current.alpha),
      gamma: current.gamma
    };
  }

  function correctedToe(start, wheel, end, wheelName) {
    const duration = Math.max(end.t - start.t, 1);
    const p = Math.min(Math.max((wheel.t - start.t) / duration, 0), 1);
    const drift = deltaDeg(start.alpha, end.alpha);
    const interpolatedRef = normalizeDeg(start.alpha + drift * p);
    const relative = deltaDeg(interpolatedRef, wheel.alpha);

    const isLeft = wheelName.endsWith("L");
    let toe = isLeft ? -relative : relative;
    if (invertToe) toe *= -1;
    return { toe, drift };
  }

  function go(viewId) {
    $$(".view").forEach(v => v.classList.remove("active"));
    $("#" + viewId).classList.add("active");
    if (viewId === "resultsView") renderResults();
    window.scrollTo(0, 0);
  }

  function updateWheelPicker(type, wheel) {
    const root = document.querySelector(`[data-picker="${type}"]`);
    root.querySelectorAll("button").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.wheel === wheel);
    });
  }

  function setCamberWheel(wheel) {
    selectedCamberWheel = wheel;
    updateWheelPicker("camber", wheel);
    $("#saveCamberBtn").textContent = `Save ${wheel} camber`;
  }

  function setToeWheel(wheel) {
    selectedToeWheel = wheel;
    updateWheelPicker("toe", wheel);
    resetToeFlow();
  }

  function resetToeFlow() {
    toeStep = 0;
    toeStart = toeWheel = toeEnd = null;
    $("#toeResultCard").classList.add("hidden");
    renderToeStep();
  }

  function renderToeStep() {
    const titles = ["Body reference", "Wheel", "Body reference again", "Measurement complete"];
    const texts = [
      `Place the fixture against a straight reference parallel to vehicle centerline on the ${selectedToeWheel.endsWith("L") ? "left" : "right"} side.`,
      `Move directly to ${selectedToeWheel}. Keep the phone portrait, screen outward, and do not flip its orientation.`,
      `Return to the exact same body reference point and orientation.`,
      `Saved. Positive is toe-in and negative is toe-out.`
    ];
    const buttons = ["Capture reference", "Capture wheel", "Capture final reference", "Measure again"];

    $("#toeStepLabel").textContent = toeStep < 3 ? `STEP ${toeStep + 1} OF 3` : "DONE";
    $("#toeStepTitle").textContent = titles[toeStep];
    $("#toeStepText").textContent = texts[toeStep];
    $("#toeCaptureBtn").textContent = buttons[toeStep];
  }

  function captureToeStep() {
    if (toeStep === 3) {
      resetToeFlow();
      return;
    }

    const snap = snapshot();
    if (!snap) {
      alert("Hold the phone still until the stability indicator says Stable, then capture again.");
      return;
    }

    if (toeStep === 0) toeStart = snap;
    if (toeStep === 1) toeWheel = snap;
    if (toeStep === 2) {
      toeEnd = snap;
      const r = correctedToe(toeStart, toeWheel, toeEnd, selectedToeWheel);
      alignment.toe[selectedToeWheel] = r.toe;
      saveCurrent();

      $("#toeResultLabel").textContent = `${selectedToeWheel} toe`;
      $("#toeResult").textContent = fmt(r.toe);
      $("#driftResult").textContent = fmt(r.drift);
      $("#driftNote").textContent =
        Math.abs(r.drift) <= 0.25
          ? "Reference drift was low."
          : "Reference drift exceeded 0.25°. Repeat this wheel for better confidence.";
      $("#toeResultCard").classList.remove("hidden");
    }

    toeStep++;
    renderToeStep();
  }

  function renderResults() {
    WHEELS.forEach(w => {
      $(`#${w}-camber`).textContent = fmt(alignment.camber[w]);
      $(`#${w}-toe`).textContent = fmt(alignment.toe[w]);
    });

    const fl = alignment.toe.FL, fr = alignment.toe.FR;
    const rl = alignment.toe.RL, rr = alignment.toe.RR;

    $("#frontTotal").textContent = fmt(Number.isFinite(fl) && Number.isFinite(fr) ? fl + fr : null);
    $("#rearTotal").textContent = fmt(Number.isFinite(rl) && Number.isFinite(rr) ? rl + rr : null);
    $("#frontSteer").textContent = fmt(Number.isFinite(fl) && Number.isFinite(fr) ? (fr - fl) / 2 : null);
    $("#rearThrust").textContent = fmt(Number.isFinite(rl) && Number.isFinite(rr) ? (rr - rl) / 2 : null);
  }

  function archive() {
    const sessions = loadJSON("tavalign-archive", []);
    sessions.unshift({ ...alignment, archivedAt: Date.now() });
    localStorage.setItem("tavalign-archive", JSON.stringify(sessions.slice(0, 30)));
    $("#archiveMsg").textContent = "Alignment archived on this iPhone.";
  }

  $("#sensorBtn").addEventListener("click", enableSensors);

  $$("[data-go]").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.go)));

  $$('[data-picker="camber"] button').forEach(btn =>
    btn.addEventListener("click", () => setCamberWheel(btn.dataset.wheel))
  );

  $$('[data-picker="toe"] button').forEach(btn =>
    btn.addEventListener("click", () => setToeWheel(btn.dataset.wheel))
  );

  $("#saveCamberBtn").addEventListener("click", () => {
    if (!isStable()) {
      alert("Hold the phone still until the stability indicator says Stable.");
      return;
    }
    alignment.camber[selectedCamberWheel] = displayedCamber();
    saveCurrent();
    if (navigator.vibrate) navigator.vibrate(30);
  });

  $("#zeroCamberBtn").addEventListener("click", () => {
    camberZero = current.gamma;
    localStorage.setItem("tavalign-camber-zero", String(camberZero));
    renderLive();
  });

  $("#clearCamberBtn").addEventListener("click", () => {
    camberZero = 0;
    localStorage.setItem("tavalign-camber-zero", "0");
    renderLive();
  });

  $("#invertCamber").addEventListener("change", e => {
    invertCamber = e.target.checked;
    localStorage.setItem("tavalign-invert-camber", String(invertCamber));
    renderLive();
  });

  $("#invertToe").addEventListener("change", e => {
    invertToe = e.target.checked;
    localStorage.setItem("tavalign-invert-toe", String(invertToe));
  });

  $("#toeCaptureBtn").addEventListener("click", captureToeStep);

  $("#resetSessionBtn").addEventListener("click", () => {
    if (!confirm("Reset the current alignment readings?")) return;
    alignment = { camber: {}, toe: {}, createdAt: Date.now() };
    saveCurrent();
    $("#archiveMsg").textContent = "";
  });

  $("#archiveBtn").addEventListener("click", archive);

  renderLive();
  renderResults();
  renderToeStep();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
  }
})();
