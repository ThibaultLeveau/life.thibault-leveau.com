# ADR 005 — Metric integrations and personal tracking

Translation of the [unchanged French historical decision](../../decisions/005-integrations-tracking.md).

**Status:** accepted by Thibault on 16 November 2026.

**Approval:** “Yes, I approve this architecture and you can implement it” (translated), recorded in [issue #46](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/46#issuecomment-6915969194), after the detailed proposal and before implementation.

## Decision

Keep the FastAPI/React monolith, PostgreSQL, sessions, transactions and VPS deployment. Add `tracking` under ADR 003, disabled by default. Tracking owns versioned definitions, period entries, source snapshots and correction history.

Extend backend manifests with an optional metrics provider. `platform/integrations` defines neutral contracts, period validation, discovery API and activation checks. Each application implements its provider in its own folder. The existing registry remains the only composition point; no domain imports another. Tracking receives injected providers and never reads their tables directly.

Providers describe localized metrics, units and allowed filters, supply searchable options and evaluate bounded requests for the authenticated owner. The server checks source activation and filter ownership on each read. Unavailable, missing and zero are distinct. No arbitrary SQL, external code, service, scheduler or message bus is introduced.

Confirmed entries retain values and provenance. Previews recalculate on demand; refreshing an entry is an explicit, historical correction. Disabling a source blocks new reads without erasing stored snapshots. Corrections do not multiply points. Periods use an explicit IANA timezone; local boundaries convert to UTC.

Reuse Sport’s shared visual frame in `shared/ui`, without dependencies on `platform` or applications. Titles, navigation and account menu arrive through props. Business behavior and navigation guards remain in Pages. PR #44 delivered `ApplicationSidebar`, `ApplicationTopbar` and the common footer during Tracking implementation: reuse these directly under the same approved objective, without a competing frame.

## Alternatives

Direct business imports violate boundaries and couple additions to consumers. Browser aggregation duplicates rules and lacks API parity. An analytics service or bus adds synchronization and operating work. Injected providers provide explicit, testable extension local to each domain.

## Consequences

Manifest contracts and boundary tests evolve. Activity metrics use only recorded events and measurements; screen time is not inferred. Missing historical fields are not reconstructed from current values. Requests/options are bounded. Tracking data uses an additive global migration, PostgreSQL backup and the same owner/CSRF/version rules as other applications. Provider/metric documentation accompanies every change.

Previous ADRs remain unchanged.
