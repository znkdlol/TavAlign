# TavAlign Web

## Version 2.1: corrected camber axis, steady readings and averaged captures

Camber now measures forward/back inclination of the screen/fixture plane from vertical. Keep the phone's screen facing outward, parallel to the wheel face. The earlier direct gamma reading measured the wrong component for this mounting. Version 2.1 requires a fresh averaged fixture zero and marks earlier camber results for remeasurement. Toe calculations are unchanged.

See **UPLOAD.md** for replacing an existing GitHub Pages installation, including the first update from the old offline cache. No build tools, server, account changes, or new hosting are needed.

- Live numbers refresh five times per second. A three-sample median followed by a time-based low-pass filter removes flicker; hysteretic rounding keeps hundredths from chattering.
- Capture eligibility uses the **raw, unwrapped signal**, not the smoothed display. A 1.2-second observation window must pass noise, range, slope and motion checks, followed by one continuous second of settling.
- Camber, fixture zero and each toe step average **new samples for at least 1.5 seconds after tapping**. Time weighting prevents bursts of sensor events from dominating the average. Saved values never use the rounded display.
- Movement, lost sensors, cancellation, navigation or changing the selected wheel cancels an unfinished capture. Backgrounding or rotating the phone resets sensors and unfinished toe sequences. Stay in portrait with the top edge up.
- Toe retains reference → wheel → reference and interpolates drift at the averaged captures' time midpoints. Circular angle math handles 0°/360° correctly. Reference drift above 0.25° rejects the attempt without replacing an earlier result. Finish the sequence within two minutes.
- Current Alignment shows the spread of the last five accepted captures per wheel. Three or more within 0.10° camber / 0.15° toe are labelled repeatable. These are provisional consistency thresholds, not accuracy specifications. Remove and reseat between captures; start a new repeat check after changing the car.
- Existing angles, polarity and archives remain stored. The old wrong-axis zero is retained for history but is not applied. The corrected zero is stored separately with a measurement-model identifier. Older camber readings are labelled for remeasurement. Changing zero or polarity marks affected old readings for remeasurement instead of rewriting them.

### Tuning and limitations

Defaults live in `sensor-engine.js` under `CONFIG`. Raw camber readiness limits: 0.045° SD, 0.18° peak-to-peak, 0.06°/second slope. Yaw: 0.065° SD, 0.25° peak-to-peak, 0.08°/second slope. Once ready, thresholds widen by 1.65× to avoid status flicker. Captures must still pass the strict limits over their complete window.

Entry motion limits are 0.65°/second rotation magnitude and 0.12 m/s² linear acceleration. Exit limits are 1.1°/second and 0.20 m/s². Missing or stale rotation blocks capture. Missing linear acceleration is explicitly marked as a limited motion check; it is never silently treated as zero. Both angle and rotation streams must be fresh within 350 ms. At least 12 window samples and 15 capture samples are required.

The display filter uses a 180 ms time constant while moving and 450 ms once ready. Display rounding uses 0.01° steps plus a 0.008° hysteresis margin. This provides calm feedback while retaining full-precision averages in storage.

Camber is calculated as `-asin(cos(beta) * cos(gamma))`, using radians internally. This derives the screen normal's vertical component from the W3C rotation matrix, giving continuous camber through upright and avoiding false camber from pure in-plane sideways lean. With the screen outward and default polarity, top outward is positive and top inward is negative. Verify your fixture's sign; the invert setting is retained.

Smoothing cannot calibrate the phone, correct fixture/runout errors, or remove nonlinear yaw drift. The alpha-based toe method is unchanged and still has limitations near orientation singularities. A stable value is not evidence of absolute accuracy, and a low endpoint drift does not prove the yaw was accurate at the wheel. Do not infer 0.01° accuracy from two displayed decimals. Validate on your actual phone and fixture against known angles and a separate reference method.

### Verification

Run `node --test tests/sensors.test.cjs` for deterministic sensor tests. See **VALIDATION.md** for the tested browser flows and the remaining physical-device checks.

TavAlign Web is an installable mobile web app/PWA for iPhone.

## Why this version exists

The native iOS version requires Xcode on a Mac to build and install. This version runs in Safari and can be added to the iPhone Home Screen, so no Mac or Apple developer setup is required.

## Important: it must be served over HTTPS

iPhone motion/orientation sensor access is restricted to secure web contexts. Opening `index.html` directly from Files is not enough.

The easiest free deployment is GitHub Pages:

1. Create a free GitHub account if you do not already have one.
2. Create a new public repository named `tavalign`.
3. Upload every file from this folder to the repository root.
4. In the repository, open Settings → Pages.
5. Under "Build and deployment", choose "Deploy from a branch".
6. Choose the `main` branch and `/ (root)`, then Save.
7. GitHub will provide an HTTPS Pages address.
8. Open that address in Safari on the iPhone.
9. Tap **Enable sensors** and allow Motion & Orientation access.
10. In Safari, tap Share → Add to Home Screen.

After its first successful load, the service worker caches the app for offline use.

## V1 workflow

### Camber
1. Enable sensors.
2. Put the phone/fixture on a known vertical reference.
3. Tap Average fixture zero and hold still until it completes.
4. Put the fixture on the wheel.
5. Wait for Ready.
6. Tap Capture and hold still through the averaged capture.
7. Confirm sign against a known setup. Use Invert camber sign if needed.

### Toe
Toe uses the phone yaw reading, but it does not assume yaw is perfectly stable.

For each wheel:
1. Capture a body/chassis reference parallel to centerline.
2. Capture the wheel.
3. Return to the exact same body reference and capture it again.
4. TavAlign estimates yaw drift across those three readings and corrects the wheel result.
5. Positive is intended to mean toe-in. Validate once against strings and use Invert toe polarity if your fixture orientation requires it.

## Validation before relying on it

This is a prototype, not a calibrated alignment rack.

Before using it as the sole setup method:
- Repeat the same wheel measurement at least five times without moving the car.
- Compare camber to a digital camber gauge or professional alignment result.
- Compare total toe to strings or toe plates.
- Watch the reference-drift number. If it exceeds about 0.25°, repeat that capture.
- Roll the car or use slip plates after adjustments so tire bind does not corrupt the measurement.

## Files

- `index.html` — app UI
- `styles.css` — visual design
- `app.js` — sensor access, measurements, math and local storage
- `sensor-engine.js` — filtering, raw-signal readiness checks, averaged capture and circular angle math
- `manifest.webmanifest` — installable PWA metadata
- `service-worker.js` — offline cache
- icons — Home Screen/PWA icons
