# PS4 manager HTTPS connectivity test

Read-only browser diagnostic for PS4 Payload Manager 0.5.1-ps4.8.
No jailbreak code, payload binaries, credentials, or console logs are included.

The page tests the service on the visiting device at http://127.0.0.1:8084.
It reads health and payload-list metadata, tests a GET with a CORS preflight,
opens and immediately closes a log stream after receiving an event, and checks
the read-only preference bridge. Log contents, payload names and preference
values are not retained or uploaded.

An optional fragment supplied by a local test controller returns a compact
PASS/FAIL report to that controller by top-level browser navigation. Without
that fragment, results remain on screen. There is no public collection endpoint.

This diagnostic does not establish jailbreak reliability or full UI behavior.
