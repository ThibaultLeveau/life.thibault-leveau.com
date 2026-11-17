# ADR 003 — LifeOS applications and personal library

Translation of the [unchanged French historical decision](../../decisions/003-applications-lifeos.md).

**Status:** accepted by Thibault on 14 November 2026.

**Approval:** “I accept” (translated), in response to the [issue #18 proposal](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/18#issuecomment-6881146945), before implementation.

## Context

LifeOS hosts several personal applications following the same conventions, each isolating its business domain. Tasks authentication and HTTP transport become shared. Users choose applications in a library; Home presents enabled applications.

## Decision

Keep FastAPI, React/TypeScript/Vite, PostgreSQL, SQLAlchemy/Alembic, MkDocs and the shared Docker image. Isolate each application in `backend/src/life_app/apps/<id>/` and `frontend/src/apps/<id>/`. Each backend provides manifest, router, models, schemas and service; each frontend provides manifest, `Page.tsx`, business API, types, components and styles. Internal helpers may supplement this structure.

`platform/` owns authentication and the library. Backend `core/` remains infrastructure; frontend `shared/` owns reusable components/styles. Explicit registries compose applications. The platform depends on no business domain; applications never import one another. Migrations remain global, ordered and immutable.

Backend manifests are authoritative for metadata, public routes and activation defaults. API composition automatically applies session and activation guards to all business routes. The frontend registry maps identifiers to lazily loaded Pages. The shell manages session, library and application access.

Migration `0005_applications` adds `(user_id, application_id, enabled, updated_at)` preferences. Missing preferences use manifest defaults: Tasks stays enabled to preserve existing behavior; new applications start disabled. GET `/api/v1/applications` and PUT `/api/v1/applications/{id}` expose catalogue/settings with existing protections.

Disabling removes the application from Home and returns 403 for business routes. Direct HTML access offers the library. Data, archives, recurrence, dates and events remain intact; re-enabling restores access. Existing Tasks URLs stay valid and unknown paths remain 404.

## Alternatives

A catalogue without extraction leaves Tasks coupling and does not provide a common structure. Separate services/repositories or dynamic plugins add authentication, versioning and operating costs without a current need. The modular monolith isolates business domains while sharing conventions.

## Consequences

Imports and tests follow the new folders; Tasks HTTP contracts stay stable. An explicit registry requires a release to add applications. Sport, OKR, household chores and plants are future ideas at this decision’s date, without fake activatable applications. New applications reuse the same platform and follow AGENTS.md and the evolution guide.

The additive migration requires the usual backup. The old image ignores activation and its probe rejects the new revision: complete deployment with the new image; do not return to an image bypassing disabled apps. Downgrade refuses to discard existing preferences. Services, secrets and operational procedures remain unchanged. ADRs 001 and 002 retain their historical content.
