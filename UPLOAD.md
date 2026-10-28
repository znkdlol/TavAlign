# Upload TavAlign 2.5

1. Unzip TavAlign-v2.5-upload.zip.
2. Open your existing repository: https://github.com/znkdlol/TavAlign
3. Choose Add file → Upload files. Upload the extracted contents to the repository root, replacing matching files. Do not upload the ZIP or an extra enclosing folder. Include capture-queue.js.
4. Commit to main. Keep GitHub Pages set to main / (root).
5. After Pages deployment succeeds, open https://znkdlol.github.io/TavAlign/ online.
6. Tap Update app when the banner appears. Confirm v2.5 beside TAV GARAGE. If the old app persists, close all TavAlign tabs and its Home Screen app, then reopen online. Avoid clearing website data, which removes saved readings and calibration.

All required files are included: index.html, styles.css, app.js, sensor-engine.js, capture-queue.js, service-worker.js, manifest.webmanifest and the three PNG icons. Documentation and tests are optional to host.

## First use

The main capture button now stays at the bottom of the screen for thumb reach, including while you scroll. Progress and Cancel appear beside it during capture. Existing saved references remain usable; this UI update does not require recalibration.

Enable sensors. If there is no completed profile, Reference setup opens automatically. Keep the phone seated as you will use it. Capture the face-up reference on a checked level support, then the upright reference on a checked plumb support. Tap once and release; the app waits and retries disturbances automatically. Each reference averages a clean three-second window. The profile saves only when both poses finish. Use existing zero / set up later preserves your current reference if you defer setup.

On Camber, the large live number now updates twice per second. Capture & next corner averages two seconds and saves beneath the selected wheel label before selecting the next corner. Capture only stays on the same wheel. On RR, capture-and-next finishes at Current Alignment. Toe keeps its three-step sequence, then offers Next corner after an accepted result.

If the fixture keeps moving, support its contact points consistently and avoid squeezing it. The app retries for up to 20 seconds; it does not save a moving average that hides ongoing movement. Calibration cannot fix uneven wheel contact or the printed mount flexing.

This package is ready for upload; it has not been deployed automatically. The printed mount file has not been modified.
