# Private recipe browser

ADR 010 defines the approved boundary. Build with the pinned Playwright version;
Chromium and its Linux libraries come from that package. The Node process runs as
`node`, launches headed Chromium under Xvfb, and keeps Chromium's sandbox enabled.
The Compose service has no public ports, persistent mounts, database credentials,
AI tokens or direct Internet route. Only the LifeOS API knows the service token.
Chromium receives a minimal environment that excludes that token.

`seccomp.json` is the official Playwright v1.64.1 Docker profile:
https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json
Playwright is Apache-2.0 licensed. The profile additionally allows `chroot` in the
unprivileged user namespace, because the default capability-conditional rule is
not available with `cap_drop: ALL`. No capabilities are added. Keep namespace and
seccomp sandbox checks in `scripts/test-recipe-browser.sh` passing on every target
host; never fall back to `--no-sandbox`.

Run `make docker-build` from a committed branch, then
`bash scripts/test-recipe-browser.sh`. For uncommitted experiments, use distinct
image tags and `LIFE_TEST_BROWSER_IMAGE` / `LIFE_TEST_RECIPE_EGRESS_IMAGE` to avoid
replacing a release tag. Tests use synthetic website data and an internal Docker
network with public-address syntax; they do not access production or the Internet.
The browser's only outbound path in production is `recipe-egress`.

HTTP commands are service-authenticated and tied to both owner and login hash.
They expose images, bounded source capture and whitelisted human input, never CDP
or arbitrary evaluation. A 20-second renewable lease, 10-minute interaction idle
expiry, 30-minute absolute expiry, login expiry, opening rate limits and two active
browser slots bound resource use. Closing an in-flight launch keeps its slot until
the browser is destroyed. Website contents, cookies and images must not be logged.
