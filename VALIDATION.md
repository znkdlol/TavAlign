# TavAlign 2.4 validation

## Completed checks

- 49 deterministic tests passed: the original 37 sensor/axis tests plus 12 capture-queue and companion-axis tests.
- New capture tests cover tap disturbance, release delay, arming while moving, fresh-window retries, deadlines, cancellation, configurable duration, simultaneous reference averages, companion-only motion, stale-stream recovery and completion timing.
- Browser integration passed with simulated sensors in desktop Edge at 390 × 844: first-time guided setup, face-up and upright reference offsets, atomic profile commit, cancellation preserving the previous profile, model-specific zero selection, tap disturbance recovery, two numeric updates per second, saved wheel tiles, cancel/timeout without advancement, capture-and-next through FL/FR/RL/RR, complete toe sequence, retained profile after reload, stale-value blanking, offline subpath loading and no JavaScript runtime errors.
- A separate service-worker test passed for v2.3 → v2.4 using Update app, loading the new capture-queue.js, subsequent update activation, scoped cache cleanup without removing another app's cache, and offline reload.
- JavaScript syntax and Git whitespace checks passed. Phone-sized Reference setup, Camber and Toe screens were visually inspected. Existing manifest/icons were preserved.

## Actual-device checks still required

Tests simulate sensor input. They do not establish absolute accuracy on the user's iPhone or printed fixture. Validate the profile with independently checked level and vertical references, then remove/reseat the fixture at least five times on the same wheel. Compare with a known camber gauge and a separate toe reference. Check both signs and wheel sides.

The raw stability thresholds have not been relaxed. A stationary fixture must still supply a sufficiently quiet window; automatic retries address tap timing, not continuous movement or an unstable mount. If the actual device never settles, collect stationary diagnostic data before changing thresholds.

Two-position setup records separate reference offsets. It does not perform a full sensor bias/scale/cross-axis calibration or correct uneven contact with the wheel. The same phone, case and fixture seating must be used. A level bench is suitable only when the assembly's supported position represents the intended zero reference; a wall is suitable only when checked plumb. No force-fitting to a known -3.x° reading is implemented.

The printed mount was not modified.

## API reference

Browser orientation events contain processed orientation estimates rather than raw sensor samples: https://www.w3.org/TR/orientation-event/#introduction
