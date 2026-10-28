# TavAlign Web

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
3. Tap Zero current angle.
4. Put the fixture on the wheel.
5. Wait for Stable.
6. Save the reading.
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
- `manifest.webmanifest` — installable PWA metadata
- `service-worker.js` — offline cache
- icons — Home Screen/PWA icons
