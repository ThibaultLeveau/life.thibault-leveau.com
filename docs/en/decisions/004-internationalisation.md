# ADR 004 — LifeOS in French and English

Translation of the [unchanged French historical decision](../../decisions/004-internationalisation.md).

**Status:** accepted by Thibault on 16 November 2026.

**Approval:** “I accept” (translated), recorded in [issue #35](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/35#issuecomment-6909755926) before implementation.

## Decision

Keep the modular monolith and its boundaries. Add a `locale` account preference (`fr` or `en`) to PostgreSQL, sessions and the shared API. Existing accounts remain French. Partial preference writes preserve other settings.

Use i18next/react-i18next and versioned JSON catalogues with stable keys. Each application owns its business translations; shared components do not depend on `platform/`. Server translations follow the same boundaries. Backend manifests remain authoritative for localized library metadata. Authenticated language comes from the account; before login, `Accept-Language` selects a supported language with French fallback.

Retain the 680 supplied exercises in a versioned catalogue with their identifiers and `builtin` flag. Separate French/English text from language-independent data. Programs, training and metrics are localized when rendered without modifying persisted snapshots. Personal content is never translated by name matching or sent to a translation service.

Date/number formats, help, messages and recurrence descriptions follow the selected language. English date parsing uses the existing recurrence contract. Language changes invalidate old-language reads; sign-out unmounts private data.

## Alternatives

SQL-only translations could support online editing, which is not required. Catalogues shipped with code let translations be reviewed and tested with features. A custom engine would require maintaining plurals, interpolation and React integration. Runtime remote translation would add external dependency and variable results.

## Consequences

Add two locked frontend dependencies and an additive migration in the global chain. Test FR/EN completeness, API/interface parity, personal content, history, ownership and backup/restore. New applications supply both languages. No additional service, independent storage or deployment mode. Previous ADRs keep their historical value.
