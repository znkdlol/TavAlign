# Update your existing TavAlign site

1. Unzip `TavAlign-v2.1-upload.zip` on your computer.
2. Open your existing repository: https://github.com/znkdlol/TavAlign
3. Choose **Add file → Upload files**. Upload the extracted files at the repository root, replacing matching files. Upload the contents, not the ZIP or an extra enclosing folder. Keep the `tests` folder together if you include it.
4. Commit the upload to the existing `main` branch. Keep Pages set to **main / (root)**. No other Pages settings need changing.
5. Wait for the Pages deployment to succeed. Open https://znkdlol.github.io/TavAlign/ while online.

Required app files are `index.html`, `styles.css`, `app.js`, the NEW `sensor-engine.js`, `service-worker.js`, `manifest.webmanifest`, and the three existing PNG icons. The package includes all of them. The manifest and icons are unchanged. README, these notes, and tests are optional to host.

## Make sure your iPhone receives version 2.1

The original app caches version 1 for offline use. The first visit after upload may still show the old screen while the new version downloads.

Open the site online, allow a few seconds for the download, then close **all TavAlign browser tabs and the TavAlign Home Screen app**. Reopen it online. If it still shows the old version, repeat the close/reopen once after checking that the Pages deployment succeeded. Do not clear website data as a first step: doing so removes stored readings and your zero.

If updating from version 2.0, tap **Update app** when the banner appears. Confirm **TavAlign 2.1** in the footer and **LIVE CAMBER · FORWARD / BACK TILT** on the camber page. The app will ask you to **Set fixture zero first**. The worker caches a complete version before installation and does not force a reload during capture.

## First measurement

Enable sensors, open Camber and place the fixture on a known reference. Wait for **Ready**, tap **Average fixture zero**, and keep still for 1.5 seconds. Move to the wheel, wait for Ready again, and capture. The display updates calmly at five times per second; it may take a little over two seconds to become Ready after a move.

For toe, perform all three averaged captures without flipping the fixture. Drift greater than 0.25° will ask you to repeat. Remove and reseat between repeated measurements. Start a new repeat check after adjusting the car.

If Ready never appears, hold the fixture firmly, check sensor permission, keep portrait, and keep the app in the foreground. “Waiting for motion” means the browser has not supplied usable rotation data. Missing hardware data cannot be fixed by smoothing.

Your existing saved results are retained, but earlier camber readings must be measured again. The old zero belongs to the wrong measurement axis and is deliberately not applied. Average a fresh fixture zero on a known vertical surface. With the screen outward and Invert camber sign off, top inward should read negative and top outward positive. Toe and archived results are retained. This package has not been deployed to your repository automatically.
