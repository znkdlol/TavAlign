# TavAlign 2.4

A static GitHub Pages/PWA update for calmer live readings, easier capture, and guided reference setup. Upload instructions are in UPLOAD.md. No build tools or new hosting are needed.

## Measuring

- The main live angles update twice per second. Sensor processing and movement checks continue at the sensor event rate; the controller checks progress every 100 ms.
- Tap Capture once and release the button. After a one-second release delay, the app waits for a steady signal and averages a new two-second window. A disturbed window is discarded and retried automatically, for up to 20 seconds total. Movement is not blended into a result.
- Fixture zero and each reference setup pose use three-second clean windows. Support the assembly on a checked reference instead of trying to hold it perfectly still in mid-air.
- Capture & next corner saves the current camber value and advances FL → FR → RL → RR. The final corner opens Current Alignment. Capture only keeps the current wheel selected. Nothing advances on cancellation, timeout or failure.
- Saved values appear beneath FL / FR / RL / RR on both Camber and Body Toe. Amber values belong to an earlier reference or setting and need remeasurement. The large number remains live; the small wheel values remain saved snapshots.
- Toe still requires body reference → wheel → body reference. Each step now uses the same wait-and-average interaction. Only after the final drift check passes can Next corner advance. An unfinished toe capture never appears as a saved toe value.

## Two-position reference setup

After sensor permission, users without a completed reference profile are shown Reference setup. It can also be opened from Home or Camber. Existing valid zeros remain usable if setup is deferred.

1. Keep the phone in its usual case and fixture seating. Support the assembly in a face-up, independently checked level reference position. Capture records the left/right and camera/charging-end offsets simultaneously.
2. Support the same assembly against an independently checked vertical reference with the screen toward you. Capture records its screen-plane offset.
3. After both captures succeed, all three model-specific offsets are saved together in this browser. The selected measurement axis and mounting position are not changed.

Both steps are required to replace the complete profile. Cancelling or leaving midway preserves the previous profile. Page backgrounding discards an unfinished setup. A screen rotation during the transition preserves the first completed pose but cancels any active capture; tap again after supporting the new position. Profile timestamps and sample noise are stored. Private browsing storage is temporary.

These are reference offsets, not a full gyroscope/accelerometer calibration. Browser orientation values are already processed by the device. Two poses do not identify all sensor biases, scale errors or cross-axis errors, nor can they correct fixture flex, uneven rim contact, an unlevel bench, or changed phone seating. Redo reference setup after changing the case, device or fixture seating. A wall is not automatically plumb. Never zero on the unknown wheel angle or tune zero to force an expected -3.x° reading.

The single Average fixture zero button remains available for a fresh zero of the selected model only. Clear zero clears that model; other reference models are retained.

## Mounting and axes

The v2.3 axis definitions are retained. Screen-up mode defaults to left/right edge tilt, appropriate to the user's described camera-end-forward direction; camera/charging-end tilt is available separately. Screen-outward mode measures screen-plane inclination from vertical. The matching reference is selected automatically. Portrait and landscape screen layouts are supported.

The fixture must transfer wheel camber into the selected phone measurement plane. Confirm sign and repeatability with the actual fixture and a separate reference method. Invert camber sign if the mounting direction requires it. The diagnostic panel shows both unzeroed tilt axes independently of saved zero or inversion.

## Signal checks

The existing raw-signal stability thresholds remain unchanged. The 1.2-second observation window and one-second stable dwell are independent of display smoothing. Capture still rejects excessive raw noise, range, slope, rotation or acceleration. Missing/stale sensor data never becomes a fabricated zero. Waiting for recovery is bounded by the capture deadline. Separate attempts never share samples.

The controller averages time-weighted raw angle samples, not rounded display values. For face-up setup, both reference axes must be stable and pass capture checks over the exact same sample window. A low-noise result is not a calibrated accuracy claim.

Toe interpolates endpoint drift at the averaged capture midpoints. More than 0.25° endpoint drift rejects the attempt without overwriting an older accepted value. The complete sequence expires after two minutes. Low endpoint drift cannot prove absence of nonlinear drift.

## Storage and offline behavior

Existing alignment readings, archives, sign settings and matching single-model zeros are retained. Reference profiles use tavalign-reference-profile with schema 1 and separate model keys. New profile values take precedence over migrated legacy zeros. Failed or cancelled capture does not modify stored readings.

The existing manifest, icons, relative URLs and GitHub Pages /TavAlign/ setup are preserved. The versioned service worker caches the new capture-queue.js alongside the app. Updates activate only when requested or when old app clients close.

## Development and verification

Run: node --test tests/sensors.test.cjs tests/capture-queue.test.cjs

See VALIDATION.md for test scope and physical checks still needed. Main files: app.js (workflow/storage/UI), sensor-engine.js (angles/stability/averages), capture-queue.js (release delay/retries/deadline), index.html and styles.css (UI), service-worker.js (offline update).
