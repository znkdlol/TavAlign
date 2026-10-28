# TavAlign 2.2 verification

Version 2.2 adds five screen-up tests for horizontal zero, signed pitch including +/-3.2°, sideways-roll rejection, incompatible mounting rejection, and projection of a known gravity vector. All **33** sensor tests pass. Browser integration covers the screen-up default, ignoring a stored v2.1 calibration in that mode, averaged zero, opposite pitch signs, switching mounting position, capture blocking in an upright pose, recovery, and the existing capture/toe/offline flows. Updating an installed v2.1 app through the update banner also passes.

These checks verify sensor math and application behavior using simulated inputs. They do not validate the printed fixture's physical transfer of wheel camber to phone pitch. Confirm that relationship, the zero reference, sign, and repeatability on the actual assembled fixture before interpreting its pitch as wheel camber.

Version 2.1 adds six physical-axis regression tests: upright zero, opposite forward/back signs, continuity through upright, zero for pure sideways lean, invariance under rotation within the screen plane, and invalid component handling. All **28** deterministic tests pass. Browser coverage includes the new zero requirement, preserving but ignoring the legacy axis zero, and forward/back sign changes. Updating an installed v2.0 app to v2.1 through its update banner and reloading offline also passed. These tests validate the math and wiring using simulated input; actual phone accuracy still requires the physical checks below.

Source baseline: public `znkdlol/TavAlign` main commit `8e90cb897e9800a255c0b549d7ab0e516b4134f4`.

## Automated checks

- 22 deterministic sensor tests: startup without data; dwell; noise attenuation; prospective capture and averaged zero; impulse rejection; movement between display frames; stale angles and rotation; recovery after a gap; missing sensor fields; limited acceleration mode; circular yaw; slow drift; readiness and display hysteresis; time-weighted statistics; 10/30/60/100 Hz input; lifecycle reset; toe midpoint drift correction and polarity; step response.
- Browser integration with simulated sensor events in Chromium/Edge at a 390 × 844 mobile viewport: legacy local storage and zero; initial capture blocking; live readiness; averaged camber; repeated-capture spread; movement cancellation; averaged zero; all three toe steps across yaw wraparound; rejection of excessive reference drift without overwriting a prior reading; stale display clearing; mobile overflow; offline reload from a `/TavAlign/` subpath; no JavaScript runtime errors.
- Phone-sized Camber, Body Toe and Current Alignment pages visually inspected.
- Additional browser checks: permission denial leaves a retryable button; interrupted sensors reset an unfinished toe sequence; version 1 upgrades after all app tabs close while retaining fixture zero; the next update displays an activation banner; cache cleanup preserves other apps on the same origin; the upgraded app reloads offline.
- JavaScript syntax checked. Existing PWA manifest and icons retained unchanged.

## Physical validation still needed

No real iPhone sensor/permission session or calibrated alignment measurement was available in this environment. Browser tests use simulated signals and do not establish accuracy on your phone.

On your iPhone, check permissions, portrait orientation, background/foreground recovery, standalone Home Screen operation and offline reopen. Measure a fixed reference at least five times, removing and reseating the fixture. Compare camber against a known gauge and toe against strings/plates or a validated alignment reading. Test both sides and sign settings. Verify an intentional move cancels capture. Repeat after the phone warms up and after repositioning near the vehicle. Record bias separately from repeat spread.

The default thresholds are engineering starting points. If actual stationary noise is higher, investigate fixture stability and phone sensor behavior before relaxing them. A repeatable result can still have systematic error.

## Browser API references

- Device orientation data and permission behavior: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent
- Motion data fields: https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent
- Service worker update checks: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update
- Orientation axes and rotation matrix: https://www.w3.org/TR/orientation-event/#worked-example-2
