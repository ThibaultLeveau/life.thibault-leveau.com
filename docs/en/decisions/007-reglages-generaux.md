# ADR 007 — General settings and application panels

**Status:** accepted by Thibault on 17 November 2026. This is an English translation of the unchanged [original decision](../../decisions/007-reglages-generaux.md).

**Approval:** “Approve the unified settings page and contract extension (recommended)”, after reviewing the need, proposal, alternatives and consequences, recorded in [issue #76](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/76#issuecomment-6951215061) before implementing the contract.

## Decision

Add `/settings` to the React shell and explicit HTML routes. General gathers theme, language, progression timezone and vacations. `/settings?application=<id>` opens that application's business preferences and usage days. Old `?tab=settings` URLs reach the new section.

Extend `ApplicationModule` with `Settings?: LazyExoticComponent<ComponentType<SettingsPanelProps>>`. The `onDirty` and `onBusy` callbacks report drafts and pending writes; panels reset both on unmount. The shell guards navigation, language changes and sign-out, mounting business panels only for enabled applications. Sign-out, expiry and deactivation unmount private data. Cancelled or stale reads remain ignored.

Panels in `apps/<id>/Settings.tsx` keep business forms and clients inside their application. The existing registry is the sole composition point; names, icons and paths come from the backend catalogue. Neither `platform` nor `shared` imports business logic. Recipes has no global business form: common progression supplies usage days. Tasks workspace structure remains contextual, reachable from its section.

Reuse existing APIs, validation, CSRF, owner checks and activation guards. General preferences and the progression calendar remain available independently of Tracking. A disabled application's progression preferences remain configurable through the common API; its business panel is not loaded.

## Alternatives

A directory of links would preserve the contract but scatter forms. Moving forms into the platform or duplicating them would introduce coupling and divergence. An optional component permits composition without moving business responsibilities.

## Consequences

Add a frontend contract, shell route, navigation/accessibility and boundary tests, and FR/EN guides. No additional service, framework, browser business storage, dependency or SQL schema. Backups and older images remain compatible with existing data. Earlier decisions retain their historical meaning.
