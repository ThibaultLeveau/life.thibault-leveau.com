# ADR 011 — Dashboard and Life AI application

**Status:** accepted by Thibault on 18 November 2026.

**Approval:** “J’approuve cette architecture et son implémentation jusqu’au déploiement.” The need, proposal, alternative and consequences were presented and approval [recorded in issue #104](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/104#issuecomment-6990156465) before implementation.

## Decision

Home `/` becomes Dashboard: enabled applications in a single-row carousel and a conversation starter card. Chat becomes **Life AI**, application `life_ai` at `/ai`, registered on both sides with the same boundaries, navigation and activation controls as other applications. Old `/?conversation=…` links redirect to `/ai?conversation=…`.

`apps/life_ai` owns conversations, messages, runs, receipts, memory, sources, dictation and their UI. Its routes retain `/api/v1/assistant/*` URLs and exclusively use the central activation guard. Long operations recheck activation under the owner lock before proceeding or saving an external response. Deactivation preserves all data and prevents new access, including action confirmations.

`platform/assistant` retains capability and snippet contracts, LifeOS capabilities, provider adapters, encryption, provider configuration and structured generation reused by Recipes. Shared configuration is exposed at `/api/v1/assistant/provider-settings` and in General settings, independently of Life AI. Existing chat settings routes remain available within Life AI. The `assistant_settings` table retains its historical memory columns for compatibility; only Life AI applies their lifecycle. No platform-to-application or cross-application imports.

The shell supplies Pages with registry modules and an optional single-use launch. Draft text stays transient in React memory during navigation, never in URLs, `history.state`, localStorage or sessionStorage. Life AI fills the draft and sends when settings are ready. Consuming the launch and using a request identifier prevent resubmission on back/reload. Missing configuration or rejection preserves the draft; uncertain network results require checking history before another attempt. Draft and request guards also apply to browser back.

Additive migration `0020_life_ai` enables existing accounts without overwriting explicit preferences. New accounts use the manifest's disabled default. No table move/rename or rewrite of published migrations. Downgrade refuses explicitly disabled Life AI preferences because older images ignore activation.

Life AI awards no artificial points or quests for messages. Progression and action contracts stay optional; conversation, source, memory and provider controls do not become recursive model tools. Applications operated by the assistant retain their own progression rules.

## Alternatives and consequences

Adding a platform route would isolate the screen while leaving the assistant outside application activation. Copying the engine for Life AI would duplicate providers, secrets and logic used by Recipes. The chosen split retains shared generation and an independent conversation domain.

Keep FastAPI, React, PostgreSQL, sessions, HTTP transport, MkDocs, Docker and VPS deployment. No additional service, framework, secret, dependency or storage. Extend Page contracts, boundary tests, mid-turn activation, migration/restore, navigation and single submission. Ship FR/EN guides and screenshots, AGENTS.md and operational procedures in the same branch. ADRs 008 and 009 remain historical records.
