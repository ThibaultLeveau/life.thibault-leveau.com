# ADR 001 — Initial Life architecture

Translation of the [unchanged French historical decision](../../decisions/001-architecture-initiale.md).

**Status:** accepted for V1. **Date:** 13 November 2026.

## Context

Life is intended to become a personal space for tasks, sport and goals. The first delivery is deliberately limited to a home page and navigation, with a professional presentation and complete technical documentation.

The project must use Python and FastAPI, be versioned on GitHub and published at `life.thibault-leveau.com` using the existing Hostinger VPS and Caddy proxy.

## Decision

Keep backend, frontend, documentation and infrastructure in a monorepo. Use Python 3.13 with FastAPI/Uvicorn, React/TypeScript with Vite, and MkDocs Material in French.

Build frontend and documentation assets in a multi-stage Docker image. The Python runtime serves everything behind Caddy. The Life Compose project joins an existing external network and exposes no application port on the host.

Lock dependencies with uv and npm. Run tests and builds in GitHub Actions. Publish a commit-identified image manually, retain the previous image and support redeploying it.

Do not install a database or authentication for the public home page alone. Introduce these before storing or accessing personal data.

## Alternatives considered

**Python-rendered pages only.** Templates would suffice for the initial home page. React prepares for future interactive business views and states, at the cost of Node tooling during builds.

**Separate frontend and API services.** Separation offers no operational benefit at this stage. A common image provides a consistent release and one HTTP origin.

**Automatic deployment on every push.** Not selected: CI validates sources, while VPS publication remains explicit. Control over release timing is retained.

**Database and accounts from V1.** Their setup and maintenance cost is not justified for the home page. Their absence is a known limit, not permission to publish unprotected private data.

## Consequences

- A release shares one revision across code, frontend and documentation.
- Any frontend or documentation change requires a new image.
- Development uses three servers, while production runs only Uvicorn for Life.
- Unknown routes remain real 404 errors; there is no general SPA fallback.
- Documentation is public and must contain no secrets or personal data.
- Rollback stays simple until data migrations are introduced.

## Reconsideration

Revisit this decision for the first persistent feature, multiple users or an operational need justifying separate services. Record changes in a new ADR and retain this initial context.
