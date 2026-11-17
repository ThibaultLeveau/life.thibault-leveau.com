# French and English

LifeOS and its delivered applications are available in French and English. **Language / Langue** in the account menu changes every application’s language. On mobile, open navigation. The account preference survives sign-in and applies on other devices when the session loads, independently of theme. Existing accounts remain French.

Before sign-in, browser language selects French or English, falling back to French. The form allows a temporary choice for that login; successful authentication then applies the stored account preference. Sign-out returns to browser language.

## What changes {#ce-qui-change}

Navigation, forms, help, accessible labels, errors, exercise types, textual units, dates and recurrence descriptions follow the selected language. Date/number formats use `fr-FR` or `en-GB`, with browser timezone for instants. Physical units stay metric. Natural-language numeric dates remain **day/month/year**, including English; ISO `YYYY-MM-DD` is accepted too.

Sport’s **680 supplied exercises** have localized names, notes, aliases, muscle groups and equipment, marked **Default / Par défaut**. Text search uses the current language. Programs, training and statistics display current localized names; identifiers, results, scores and dates remain unchanged.

**Personal / Personnels** exercises are never automatically translated, even when named identically to supplied ones. **Customize / Personnaliser** creates a personal copy in the displayed language. User titles, notes, workspace names, editable statuses and other text remain exactly as entered. New workspaces create three statuses in the active language; existing statuses stay unchanged.

Changing language reloads displayed data and resets temporary forms. Modified Sport program/set drafts require confirmation, as when changing tabs. Saved sets and active training remain available. Old-language responses are ignored; no business data is stored in the browser.

## API independent of the interface {#api-independante-de-linterface}

`GET /api/v1/preferences` and session responses expose `{ "theme": "system", "locale": "fr" }`. `PUT /api/v1/preferences` accepts either or both fields; omitted fields are preserved. `locale` permits only `fr`/`en`; other values, `null` and unknown fields return 422. Writes still require session, ownership, origin and CSRF.

```bash
# cookie.txt and CSRF come from POST /api/v1/auth/session.
curl --fail --cookie cookie.txt -X PUT \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  --data '{"locale":"en"}' \
  https://life.thibault-leveau.com/api/v1/preferences
curl --fail --cookie cookie.txt \
  'https://life.thibault-leveau.com/api/v1/sport/exercises?q=bench%20press'
```

Authenticated requests use account language even when `Accept-Language` differs. Before authentication, regional variants and HTTP weights are accepted, for example `en-GB,en;q=0.9,fr;q=0.5`. Private responses include `Content-Language`, `Vary: Accept-Language, Cookie` and `Cache-Control: no-store`. Unknown/expired sessions use negotiated language.

HTTP errors expose translated `detail` and stable `code`, such as `apps.tasks.workspace_not_found`. Structural 422 errors contain a `detail` list with `loc`, `type`, `code` and localized `msg`, without submitted values. Business 422 errors may use `{detail, code}`. Clients should use status/codes rather than parse prose; HTTP statuses and the disabled-app header keep their contract. Dates, identifiers, enums, RRULEs, JSON keys and API numbers remain language-independent.

## Translation organization {#organisation-des-traductions}

[ADR 004](decisions/004-internationalisation.md) retains the modular monolith. Resources ship with code, requiring no remote service or extra environment setting.

| Location | Responsibility |
| --- | --- |
| `frontend/src/platform/i18n/` | i18next/react-i18next initialization and session language |
| `frontend/src/shared/locales/{fr,en}.json` | Shell, account and shared components; `common` namespace |
| `frontend/src/apps/<id>/locales/{fr,en}.json` | Business text loaded with Page; application namespace |
| `backend/src/life_app/core/i18n.py` | Request context, negotiation and message loading |
| `core/locales/`, `platform/*/locales/`, `apps/<id>/locales/` | Server messages belonging to each responsibility |
| `apps/sport/catalogue.json` | Stable identifiers, types, muscle/equipment codes and `builtin` |
| `apps/sport/locales/exercises.{fr,en}.json` | Text for 680 exercises, muscles/equipment, keyed by identifier |

Keys are semantic and stable. Write complete sentences with named parameters; use i18next `_one`/`_other` for counts. Do not concatenate fragments whose ordering depends on language. React parameters render as text, never HTML. Backend manifests provide FR/EN names/descriptions; the frontend does not duplicate the catalogue.

Ship new strings in both languages in their owning domain. Tests check keys, parameters, plurals, 680 identifiers and real flows. Adding another language requires an explicit contract/SQL-constraint change.

## Data and operations {#donnees-et-exploitation}

`0008_locale`, after `0007_hyrox`, adds non-null `users.locale`, default `fr`, with a `fr/en` CHECK. No business text or snapshot is rewritten. Exercise localization projects responses from identifiers; historical snapshots stay intact. Disabling/re-enabling preserves language/data.

Dumps preserve preferences; catalogues live in the versioned image, which must be retained with the dump. Downgrade refuses when any account uses `en`, preventing silent loss. Follow [backup compatibility](sauvegardes.md#migration-0008-langue-du-compte) and [deployment](deploiement.md#livraison-francaisanglais). User, technical and operations guides are available in both languages, each with its own navigation and search.
