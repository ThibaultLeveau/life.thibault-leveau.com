# ADR 010 — Interactive recipe web import

**Status:** accepted by Thibault on 18 November 2026. Architecture and implementation through deployment were explicitly approved and [recorded in issue #98](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/98#issuecomment-6983407201) before implementation.

## Decision

Open a URL in an isolated remote Chromium browser, let the user complete website interactions, then extract that same page into an editable recipe in the account language. Third-party iframes cannot expose their DOM or share their session with server fetching, and some sites refuse framing.

Add two private Compose services: unprivileged sandboxed Chromium and a bounded outbound proxy. The browser has no direct Internet route, database, repository mount, LifeOS cookie or AI token. The proxy validates all resolved destinations, pins the chosen IP and denies private/local/metadata and VPS addresses, including subresources and redirects. Publish no ports.

The React frame displays screenshots and sends whitelisted human interactions through authenticated, owner-scoped, activation-checked Recipes APIs with CSRF. It never exposes DevTools. Cookies and profiles remain ephemeral. One browser per account, two globally, idle/absolute expiry and a short authenticated lease bound cleanup after closure, logout or application deactivation. Access stops immediately; the lease bounds destruction when the client cannot close explicitly.

A reusable typed-generation helper uses existing encrypted per-user provider credentials. Recipes owns extraction contracts and rules. Network operations release SQL locks, use no conversation history or executable business tools, and recheck access. Untrusted source instructions grant no authority. Unknown quantities, servings and ambiguous conversions stay unresolved for review.

Explicit saving creates required private ingredients and the recipe atomically through existing domain services, retaining history and progression. An additive migration stores source attribution and replay receipts. No browser pages/cookies enter logs or backups, and no browser business storage is added.

## Alternatives and consequences

Plain public fetch plus pasted text is simpler but cannot retain a human verification from another browser; pasted text remains a fallback. A local extension adds installation/permissions; a hosted browser provider adds subscription and third-party disclosure. VPS Chromium fits the workflow with additional CPU/RAM and browser security maintenance.

Some sites still reject VPS browsers or human checks. No automatic bypass or universal guarantee. Keep the sandbox enabled and prove it on the target VPS. AI calls consume the chosen provider quota. Preserve shared navigation, French/English, themes, keyboard controls, draft protection and attribution.

Validate network isolation, ownership/CSRF/activation, quotas/expiry, hostile content, extraction/translation, atomic replayable saving, migration/restoration and mobile/keyboard flows. Document images, secrets, resource ceilings and health checks. Merge after CI, then deploy and verify all service revisions. Earlier decisions remain unchanged.
