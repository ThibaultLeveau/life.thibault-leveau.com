# ADR 008 — AI assistant, business capabilities and personal memory

**Status:** accepted by Thibault on 17 November 2026.

**Approval:** “J’approuve cette architecture et son implémentation.” after presentation of the need, alternatives and consequences, [recorded in issue #85](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/85#issuecomment-6960154089) before implementation.

## Decision

Keep FastAPI, React, PostgreSQL, sessions, explicit registries and VPS deployment. Add `platform/assistant` to backend and frontend. Signed-in Home becomes a conversation; the library and applications remain directly accessible.

A coordinator delegates to the five application specialists and a memory agent. The server limits their tools to their scope. Contracts and context are loaded as needed, with call, size and duration bounds; not every agent runs on every turn. Business services stay in their applications and share rules with HTTP APIs.

Backend manifests expose an optional typed capability provider implemented by the application. Each capability declares its contract, corresponding route and read/write behavior. The platform receives injected providers; the model gets no cross-domain imports, arbitrary SQL, generated code or unrestricted HTTP. Explicitly requested simple actions may execute; ambiguous proposals, bulk changes and destructive actions require a preview and confirmation.

Model calls run outside SQL transactions. Each action opens a short transaction, locks the owner and revalidates session, activation, scope and versions. Mutation, events, progression and receipt are recorded together. A persistent turn/action identity and argument fingerprint prevent duplicate writes after lost responses. Interruption never authorizes implicit replay; partial successes stay visible.

PostgreSQL stores conversations, messages, runs/actions, provider settings and personal memories. History, context summaries and reusable memory are distinct. Memory retains useful user-communicated facts with source/date, deduplication and correction. It can be inspected, edited, deleted and disabled. Sensitive facts require an explicit request to remember; secrets must not become memories. Forgetting invalidates derived summaries and prevents silent re-extraction from old sources. Deleting a conversation and forgetting its memories are explicit choices.

OpenAI Responses, Anthropic and Google Gemini adapters share a messages/tools/stream contract. Settings expose provider, model and token. Server-side encryption uses an operational secret backed up separately from dumps; reads return configuration state only. Outbound hosts are explicitly allowed. Relevant context goes to the chosen provider and consumes its API quota.

Frontend manifests expose an optional lazily loaded snippet renderer, injected by the shell like Settings panels. Each business domain owns its components; `platform` and `shared` import no application. Snippets are versioned structured data rendered by React, never executable HTML/JavaScript. Preview and confirmed result are distinct; status and references come from the server. Disabling an application preserves history but prevents new business reads and writes.

Chat reuses navigation, footer, tokens, translations and shared preferences. Streaming preserves CSRF, cancellation, expiration and session/language invalidation. History remains addressable through a parameter on `/`. Animations are restrained and respect system preferences; keyboard, screen readers, 320 px and mobile keyboards are acceptance requirements.

## Alternatives

One agent holding every tool would enlarge context and mix responsibilities. An agent service, queue or vector database would add unjustified operational costs. Bounded PostgreSQL retrieval and on-demand specialists allow measured evolution. Generated HTML/JS mini-applications would make actions less controlled than typed snippets.

## Consequences

Extend manifests, boundary tests, API contracts and the global migration chain. Add necessary transport/encryption dependencies and a VPS secret with documented rotation and independent backup. Losing the key requires re-entering tokens without preventing application access. Restoration interrupts old runs and revokes sessions. Test owners, mid-turn activation changes, concurrency, receipts, interruption, forgetting, providers, snippets and restoration before publication.

Memory behavior is inspired by visible ChatGPT features; this decision does not claim to reproduce its internal implementation. Earlier decisions retain their historical meaning. Features become available only with their documented delivery.
