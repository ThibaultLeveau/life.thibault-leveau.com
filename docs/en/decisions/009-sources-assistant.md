# ADR 009 — Multimodal sources, dictation and web reading

**Status:** accepted by Thibault on 18 November 2026.

**Approval:** “J’approuve cette architecture et son implémentation jusqu’au déploiement.”, after the need, proposal, alternatives and consequences were presented, [recorded in issue #89](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/89#issuecomment-6980304252) before implementation.

## Decision

Extend `platform/assistant` within the existing FastAPI/React/PostgreSQL monolith. Preserve providers, sessions, CSRF, boundaries and deployment. Private sources (documents, images and public-page snapshots) store bounded content, metadata and checksums in PostgreSQL and link to their message. Unsent imports expire; admission reserves owner quota before expensive work. Removing a source erases its content while retaining a receipt; deleting a conversation cascades to its sources. No persistent browser storage.

Keep direct user text separate from external content. Adapters convert internal blocks to native image/PDF input for OpenAI Responses, Anthropic Messages and Gemini generateContent. Other supported documents use extracted text. Explicit budgets select sources; older ones remain addressable without concatenating every binary into history. Logs, events and summaries never store source binaries. Conversations containing sources enforce server-side confirmation of every proposed mutation and disable automatic memory extraction, including after source removal. The separate memory API/interface still allows explicit management.

Web reading only accepts explicitly imported URLs. The reader checks protocol, port, absence of credentials, public DNS addresses and every redirect, then connects to a validated address with the original TLS hostname. No cookies, inherited proxy, JavaScript, crawling or third-party login. Extraction and retrieval run in disposable processes with memory/CPU/time limits; no additional infrastructure.

Dictation records from the HTTPS microphone and transcribes server-side through OpenAI or Gemini. Reuse a compatible chat provider or explicitly configure a separate credential encrypted by the existing keyring. Audio is never saved in the database; text remains an editable draft until sent. Bound upload size, capture duration, concurrency, frequency and provider output. Never silently select another provider.

## Alternatives and consequences

Ephemeral sources alone leave incomplete history. Object storage, vector search, permanent local OCR or a remote browser add operations and secrets without demonstrated need. Browser-only speech recognition has uneven support and may rely on the browser’s remote service. Provider-specific web tools do not provide a uniform contract.

Additive migration `0016_assistant_sources` adds sources, transcription configuration and the external-conversation marker. Quotas bound backups; PDF/image/XML dependencies are locked. Selected sources and audio go to the configured provider and consume its quota. Authenticated, protected and JavaScript-rendered pages are not guaranteed. Document text-only Office extraction, formats/limits, lifecycle and restore behavior; test SSRF, hostile files, injections, ownership, cancellation and API/UI parity. ADR 008 remains historical; this decision authorizes these specific extensions.
