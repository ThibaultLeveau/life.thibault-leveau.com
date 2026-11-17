# ADR 006 — Shared progression per application

Translation of the [unchanged French historical decision](../../decisions/006-progression-applications.md).

**Status:** accepted by Thibault on 16 November 2026.

**Approval:** “Yes, I approve this architecture and its implementation” (translated), recorded in [issue #58](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/58#issuecomment-6921056171) after presenting needs, alternatives and consequences, before implementation.

## Decision

Add `platform/progression` to the existing FastAPI/React monolith. It owns the level, streak and reward engine, preferences and PostgreSQL journal. Each application keeps its progression provider, activity rules and quest catalogue in its own folder. Manifests expose an optional contract; the existing registry remains the only composition point. No cross-application business imports.

Rewards come from server-confirmed business actions, identified stably and stored in the action’s transaction. The journal is append-only and rewards are unique per owner, application and source. Historical backfill uses application-owned providers and an explicit data-migration command; HTTP reads award no points. Archives and disabled applications preserve progress. The common API checks owner, relevant application activation and CSRF for writes.

Frontend `platform/progression` uses existing session and transport. Pages inject its badge into a neutral slot of `shared/ui/ApplicationNavigation`, which still depends on neither platform nor application. Tracking presents quests, titles, history and shared settings through this API. Tasks and Sport retain progression when Tracking is disabled.

The progression calendar uses an IANA timezone and preserves activity dates. Weekend exclusion is configurable per application; vacations are persistent global intervals. Neutralized days create no fictional activity. Versioned preferences detect concurrent writes.

## Alternatives

Keeping the engine inside Tracking would make it depend on activation and require another cross-cutting display contract. Duplicating the engine in each domain would cause inconsistent behavior and complicate global vacations. A common module maintains explicit boundaries and one testable engine.

## Consequences

Extend manifest contracts, platform responsibilities, the global migration chain and boundary/activation tests. Document reward scales, deduplication, backfill and backup/restore with the feature. PostgreSQL, sessions, CSRF, transactions, FR/EN translations, visual tokens and VPS deployment remain unchanged. No additional service, framework, scheduler or external storage.

Previous ADRs remain unchanged.
