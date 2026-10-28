# Update your existing TavAlign site

1. Unzip `TavAlign-v2.2-upload.zip` on your computer.
2. Open your existing repository: https://github.com/znkdlol/TavAlign
3. Choose **Add file → Upload files**. Upload the extracted files at the repository root, replacing matching files. Upload the contents, not the ZIP or an extra enclosing folder. Keep the `tests` folder together if you include it.
4. Commit the upload to the existing `main` branch. Keep Pages set to **main / (root)**. No other Pages settings need changing.
5. Wait for the Pages deployment to succeed. Open https://znkdlol.github.io/TavAlign/ while online.

Required app files are `index.html`, `styles.css`, `app.js`, the NEW `sensor-engine.js`, `service-worker.js`, `manifest.webmanifest`, and the three existing PNG icons. The package includes all of them. The manifest and icons are unchanged. README, these notes, and tests are optional to host.

## Make sure your iPhone receives version 2.2

The original app caches version 1 for offline use. The first visit after upload may still show the old screen while the new version downloads.

Open the site online, allow a few seconds for the download, then close **all TavAlign browser tabs and the TavAlign Home Screen app**. Reopen it online. If it still shows the old version, repeat the close/reopen once after checking that the Pages deployment succeeded. Do not clear website data as a first step: doing so removes stored readings and your zero.

If updating from version 2.0 or 2.1, tap **Update app** when the banner appears. Confirm **v2.2** beside TAV GARAGE at the top and **TavAlign 2.2** in the footer. In Camber, select **Facing up toward the sky** for the screen-up mounting described in this chat. The app will ask you to **Set fixture zero first**. The worker caches a complete version before installation and does not force a reload during capture.

## First measurement

Enable sensors, open Camber, and leave the phone seated in the printed mount. With **Facing up toward the sky** selected, put the assembled mount in its known-level reference position, screen up. Verify that reference with a level. Wait for **Ready**, tap **Average fixture zero**, and keep still for 1.5 seconds. Measure with the same seating and fixture direction. The display updates calmly at five times per second; it may take a little over two seconds to become Ready after a move.

Tip the complete fixture slightly forward and backward: the reading should cross zero and change sign. Confirm that the fixture's direction corresponding to wheel-top inward reads negative. Use Invert camber sign if necessary. A known -3.x° wheel is a validation reference, not a value to dial in by changing the zero. The fixture must transfer wheel tilt to the phone's forward/back plane for this to measure wheel camber.

If the screen instead faces outward while actually touching the wheel, choose **Facing outward from the wheel** and use a known vertical fixture reference. The zero position must match the mounting arrangement used during measurement.

For toe, perform all three averaged captures without flipping the fixture. Drift greater than 0.25° will ask you to repeat. Remove and reseat between repeated measurements. Start a new repeat check after adjusting the car.

If Ready never appears, hold the fixture firmly, check sensor permission, keep portrait, and keep the app in the foreground. “Waiting for motion” means the browser has not supplied usable rotation data. Missing hardware data cannot be fixed by smoothing.

Your existing results and archives are retained. A zero from the earlier screen-outward calculation is not applied to screen-up measurements. Average a fresh zero for this position and remeasure camber. This package has not been deployed to your repository automatically.
