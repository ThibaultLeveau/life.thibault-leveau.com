# Security

## Scope {#perimetre}

Home, application shells, documentation, OpenAPI and probes are public. Workspaces, tasks, settings and events are private: every business route checks the session and resource ownership. The server never trusts a hidden button or client-supplied owner identifier.

## Accounts and sessions {#comptes-et-sessions}

The CLI creates accounts, with no public registration or default password. Passwords of 12–1,024 characters are hashed using Argon2id through `argon2-cffi`. Resetting a password revokes all account sessions. MFA, email recovery and SSO are not provided.

The browser receives a random opaque token in an HttpOnly, SameSite=Lax cookie, also Secure in production. Only its SHA-256 hash is stored. Fixed lifetime is configurable (seven days by default). The session API returns a CSRF token held in client memory; every authenticated write requires it. Supplied origins are checked, including sign-in. Signing out deletes the database session.

Mutations lock the owner then recheck the session: a waiting request cannot use a session revoked while it waited. Atomic login limits are shared in PostgreSQL: five attempts per username and 30 per IP in 15 minutes. Success resets the account counter. Limit keys are hashed; successful logins clean expired rows. Hashing an IP is not irreversible anonymization.

## Data and errors {#donnees-et-erreurs}

Schemas reject unknown fields and bound sizes, colors, priorities and pagination. SQL queries are parameterized. Composite foreign keys prevent inconsistent cross-workspace references. Descriptions render as React text, without arbitrary HTML.

Business responses, including errors, use `Cache-Control: no-store`. Validation omits submitted values; SQL errors omit parameters. Uvicorn access logs remove query strings to avoid keeping search text. Application code does not log bodies, passwords, cookies or tokens. Access logs can still contain IPs and path UUIDs; protect Caddy and Docker logs too.

Ordinary UPDATE/DELETE cannot change the task journal. It retains contextual names needed for statistics but not old titles/descriptions. Business archiving is not erasure; no permanent task purge is delivered. See [Data](donnees.md).

## Infrastructure {#infrastructure}

Caddy terminates TLS. The application port is internal to the proxy network; PostgreSQL uses a separate private network with no host port. The `life` role is not a superuser and cannot administer the cluster. The web container runs unprivileged and read-only with capabilities dropped and `no-new-privileges`.

Uvicorn trusts the intended proxy’s headers. Do not expose the application port to the Internet or admit untrusted members to this network. The application PostgreSQL role owns its tables for migrations; this personal version does not separate migration and runtime roles. Docker operators and PostgreSQL administrators remain trusted.

Shared TLS/header policies belong to the existing Caddy setup. Test additional CSP policies against Swagger and interface styles. Runtime and build dependencies are separated and version-locked.

## Secrets and incidents {#secrets-et-incident}

Never commit `.env`, `.env.production`, cookies, backups or real traces, or copy them into public documentation. `VITE_*` variables are public. Examples and tests use only synthetic values.

Dumps contain private data, password hashes and sessions. Protect permissions, off-server copies and retention. The documented restore revokes sessions before restart.

After a leak, revoke affected access, rotate secrets and investigate actual exposure; deleting a Git file is insufficient. `life reset-password` replaces the account password and revokes its sessions. PostgreSQL rotation must coordinate the existing role and application URL. Retain useful evidence and follow [Backups](sauvegardes.md) when restoring data.

## Disabled applications {#applications-desactivees}

Activation belongs to the session account. Server composition applies it to every business router in addition to owner checks; hiding a frontend card is not authorization. Toggles require CSRF/origin checks and use the user lock. They expose no other account’s data and delete nothing. Private catalogue responses use `Cache-Control: no-store`. Public shell HTML contains no private data.

## Assistant, providers and memory

Assistant routes are private, with CSRF on writes. Tools never receive an owner chosen by the model: execution uses the session account, checks activation and domain permissions, and stores the receipt in the mutation's transaction. The user lock is released before provider network calls. Proposals and destructive operations require server-enforced confirmation.

The provider receives context useful to the turn: messages, summaries, memories and tool results. External content and application text remain untrusted data; model instructions do not replace server controls. Generated HTML, JavaScript and arbitrary provider URLs are never executed. Cards are known React components from the registry.

The provider token is encrypted in an envelope binding account, provider and token. `LIFE_ASSISTANT_ENCRYPTION_KEYS` stays on the server, outside the dump; losing the keyring prevents token decryption. Messages and memories remain private plaintext data in PostgreSQL, like business records: token encryption does not encrypt the whole database. Local deletion cannot retract data already sent to a provider. Old dumps may still contain forgotten memories; apply retention and the [restore and rotation procedure](sauvegardes.md#migration-0015-assistant).

## Documents, dictation and external pages

Sources stay private, bounded and separate from direct instructions. API admission reserves quota and checks ownership before/after processing. Documents run in CPU/memory/time-limited subprocesses with actual type/structure validation. Downloads are authenticated attachments with `nosniff`, `no-store` and sandbox CSP. PDF scripts, macros, embedded objects and dangerous XML are rejected; imported files never execute.

The web reader validates every URL, DNS address and redirect; private, local, reserved and IPv6 transition destinations are rejected. Sockets connect to the validated IP while retaining original Host/SNI and certificate validation. Compressed/decompressed bodies and deadlines are bounded; no authentication, cookies, proxy environment or JavaScript. The model receives no arbitrary HTTP tool.

External sources cannot authorize business writes: the server enforces previews in the affected conversation and disables automatic memory. Dictation transcribes without tools/actions; users review text before sending. A separate token uses the existing keyring. These are application controls, not claims of universal malware detection or model-answer accuracy.
