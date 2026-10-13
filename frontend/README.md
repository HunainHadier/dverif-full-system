# Dvarif — Frontend (`Zbackup/frontend`)

The web client for **Dvarif**: a B2B document-verification platform (send a document
to the issuing organization, get back a tamper-evident QR certificate) that also
carries a full **HR / ESS suite** — payroll, leave, attendance, HR letters, assets,
expense claims, offboarding and recruitment.

This app is a **client only**. It owns no business rules and no database access: every
decision (permissions, quotas, auto-verification, plan locks) is enforced by the Node
backend, and this app mirrors those rules so the UI is honest about what the API will
allow.

```
┌──────────────────────┐   /api/v1 (JSON)   ┌──────────────────────┐
│  Zbackup/frontend    │ ─────────────────▶ │  backend  (:5000)    │
│  React 19 SPA (:8080)│ ◀───────────────── │  Node + Express      │
└──────────────────────┘                    └──────────────────────┘
                            ▲                 ▲
                            │                 │
                    ┌───────┴────────┐  ┌─────┴────────────────┐
                    │ python  (:5001)│  │ QR verification page │
                    │ OCR microservice│  │ /verify/:qrToken     │
                    └────────────────┘  └──────────────────────┘
```

| | |
|---|---|
| **Stack** | React 19 · TypeScript · TanStack Router (Start, SPA mode) · TanStack Query · Tailwind v4 · shadcn/ui · Radix · Recharts · i18next |
| **Dev server** | `http://localhost:8080` (strict port, from the shared config package) |
| **Build output** | `dist/client` + `dist/server` |
| **API base URL** | `VITE_API_BASE_URL` (defaults to `/api/v1` when unset) |
| **Verified by** | `npm run verify` = typecheck + tests + i18n key audit |

---

## Table of Contents

1. [Quick start](#quick-start)
2. [Environment variables](#environment-variables)
3. [Scripts](#scripts)
4. [Folder structure](#folder-structure)
5. [Routing](#routing)
6. [Access control — three independent axes](#access-control--three-independent-axes)
7. [Service layer](#service-layer)
8. [API client and session](#api-client-and-session)
9. [i18n](#i18n)
10. [Testing](#testing)
11. [Conventions and gotchas](#conventions-and-gotchas)
12. [Deployment](#deployment)

---

## Quick start

```bash
cd Zbackup/frontend
npm install
cp .env.example .env            # Windows: copy .env.example .env
npm run dev                     # http://localhost:8080
```

The backend must be running for anything beyond the login / pricing / public-verify
screens. Full-stack start order lives one level up in `Zbackup/`: `backend/` on `:5000`,
`python/` (OCR microservice) on `:5001`, then this app.

There is **no dev proxy**. `VITE_API_BASE_URL` is consumed verbatim by the axios
instance, so locally it must be an absolute URL and the backend must allow this app's
origin in CORS.

> **Lockfiles:** both `package-lock.json` and `bun.lock` are tracked, but `bun.lock` is
> stale (it still resolves `@hookform/resolvers`, which is not in `package.json`). Use
> **npm**.

## Environment variables

| Key | Required | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | yes | API root, including the version segment — e.g. `http://localhost:5000/api/v1`. Unset ⇒ `/api/v1` (same-origin). |
| `VITE_PUBLIC_BASE_URL` | deployment | The public origin the QR verification links resolve against. It **must match the backend's `QR_VERIFY_BASE_URL` exactly**, because the backend stamps the same value into the downloadable certificate PDF. Drift sends a scanned QR and a printed certificate for the identical token to two different domains. |

All `VITE_*` keys are inlined at build time. `.env` is gitignored; `.env.example` is
tracked (and only documents `VITE_API_BASE_URL`).

There is no `vite-env.d.ts` and no typed `ImportMetaEnv`: every read site uses
`typeof import.meta !== "undefined" && (import.meta as any).env?.…`, because the SSR
build has no `import.meta`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (port chosen by the shared config's sandbox detection — :8080 in the last run). |
| `npm run build` | Production build → `dist/client` + `dist/server` (Nitro is disabled; TanStack Start's own pipeline runs). |
| `npm run build:dev` | Same, in development mode — use when you need a readable stack trace from a build. |
| `npm run preview` | Serve the built output. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test` | `vitest run`. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run lint` | ESLint + Prettier. |
| `npm run format` | `prettier --write .` (100 cols, double quotes, semicolons, trailing commas). |
| `npm run audit:i18n` | Flags every `t("…")` key in `src/` missing from `en.json`, plus keys in `en.json` that nothing references. |
| `npm run verify` | **The gate to run before pushing**: typecheck → tests → i18n audit. |

A missing translation is invisible to TypeScript and to unit tests — i18next has no
failure mode for it, it just prints the raw key on screen. `audit:i18n` exists purely
to catch that. It exits non-zero only for keys missing from `en.json`; a key missing
from `ur.json` is reported but does not fail the run.

No `engines` field or `.nvmrc` is declared. Node **20.19+ / 22+** is the practical floor
(Vite 8 requirement).

## Folder structure

```
Zbackup/frontend/
├── src/
│   ├── router.tsx              # createRouter + QueryClient + hydrate() → ensureAuthenticated()
│   ├── routeTree.gen.ts        # AUTO-GENERATED by the TanStack plugin — never edit
│   ├── server.ts               # SSR entry: wraps h3's swallowed-error 500s in a real error page
│   ├── start.ts                # TanStack Start middleware + server error wrapper
│   ├── styles.css              # Tailwind v4 entry + theme tokens
│   ├── routes/                 # file-based routing; every page is a file (see §Routing)
│   ├── components/
│   │   ├── layout/AppShell.tsx # Sidebar + role/plan-aware nav + notifications + theme/lang
│   │   ├── common/             # RequestDetailModal, QuotaRing, StatusBadge, MatchStatusBadge,
│   │   │                       # SearchableSelect, Pagination, EmptyState, RequireOrgFeature,
│   │   │                       # SubscriptionLocked, DvarifLoader, AttachmentCard helpers …
│   │   ├── hr/                 # DataTable, FormDialog, FileDropzone, IssueLetterDialog,
│   │   │                       # ApprovalTimeline, AttachmentCard, ModuleGate, RecruitmentTabs
│   │   ├── employees/          # EmployeeManager, EmployeeDocPicker, ManageOptionsDialog
│   │   ├── leaves/ requests/ salary/ admin/
│   │   └── ui/                 # 46 shadcn/ui + Radix primitives (never edit by hand)
│   ├── services/               # the ONLY place that talks to the API (barrel + 13 modules)
│   ├── lib/                    # api.ts, auth.ts, featureKeys.ts, routeAccess.ts, navItems.ts,
│   │                           # subscription.ts, permissions.ts, documentTypes.ts, theme.ts …
│   ├── hooks/                  # useOrgSubscription, use-mobile, useDebouncedValue
│   ├── i18n/                   # index.ts + locales/{en,ur}.json
│   ├── assets/                 # logos, login cover, notification sound
│   └── test/setup.ts           # vitest setup (jest-dom, i18n import, polyfills)
├── scripts/audit_i18n_keys.mjs
├── public/                     # favicon + .htaccess SPA fallback
├── vite.config.ts              # @lovable.dev/vite-tanstack-config, SPA mode, nitro: false
└── vitest.config.ts            # standalone test config (deliberately not vite.config.ts)
```

## Routing

TanStack Router **file-based**. Every `.tsx` in `src/routes/` is a route; the plugin
generates `routeTree.gen.ts` from the filenames.

| File | URL |
|---|---|
| `index.tsx` | `/` — landing, redirects to `/dashboard` or `/login` |
| `login.tsx` | `/login` |
| `pricing.tsx` | `/pricing` (public) |
| `verify.$qrToken.tsx` | `/verify/:qrToken` (public QR verification) |
| `verify.letter.$qrToken.tsx` | `/verify/letter/:qrToken` (public HR-letter verification) |
| `forgot-password.tsx` / `reset-password.tsx` / `set-password.tsx` | password flows |
| `system-admin.*.tsx` | `/system-admin/login`, `/system-admin/forgot-password`, `/system-admin/reset-password` |
| `_app.tsx` | Layout route — the signed-in shell; the single `beforeLoad` guard |
| `_app.<segment>.<page>.tsx` | **This project's convention**: one flat dotted file per page. `_app.org.team.tsx` ⇒ `/org/team`. |
| `_app.auto-verified_.$uuid.tsx` | `/auto-verified/:uuid` — the trailing `_` opts the route **out** of the `_app` layout |
| `_app.admin.support.$uuid.tsx` | `/admin/support/:uuid` — `$` segments are dynamic params |
| `__root.tsx` | The app shell. The only root layout. Keep its `<Outlet />`. |

Full page inventory and the checklist for adding a page:
[`src/routes/README.md`](src/routes/README.md).

## Access control — three independent axes

The UI reads three *separate* server-side facts. They are frequently confused, and
conflating them is the source of most "why can't I see this" bugs:

| Axis | Source of truth | Module | Question it answers |
|---|---|---|---|
| **Role** | `user.org_role` (`org_admin` / `sub_admin` / `employee`) | `lib/routeAccess.ts` → `ROUTE_ACCESS` | May this user open this page at all? |
| **Delegated permission** | `user.feature_access` (12 keys) | `lib/featureKeys.ts` → `FEATURE_KEYS` | What delegated authority does this sub-admin hold? |
| **Plan** | `org_subscription.module_flags` (18 modules) | `components/hr/ModuleGate.tsx` + `useOrgSubscription` | Does the org's *plan* include this module? |

Rules that matter:

- **`ROUTE_ACCESS` is one row per navigable path** and is consulted by *both* the
  sidebar and the route guard, so a link the sidebar renders can never be denied by the
  guard. Detail routes inherit their list route's rule by prefix walk-up, so
  `/org/team/<uuid>` needs no second row.
- **It fails closed.** An authenticated org user hitting a path with no row is denied.
  Adding a page without deciding who may see it fails loudly.
- **`RequireOrgFeature` and `ModuleGate` are not interchangeable.** The first asks
  *may this user act* (`feature_access`); the second asks *does this plan include it*
  (`module_flags`).
- **A missing permission is not always a denial.** `attendance`, `leave` and `payroll`
  are employee self-service and default to granted; every other key defaults to
  **denied** (see `FEATURE_TRUE_BY_DEFAULT`), so a sub-admin holds nothing an org admin
  did not consciously hand over.
- **`org_role` is not seniority.** `org_admin` is excluded from `ON_ROSTER_ROLES`
  (`/my-assets`, `/my-expenses`, `/my-resignation`) on purpose: an org admin is not on
  the payroll, so those pages would be permanently empty for them. A `sub_admin` who
  *is* on the roster keeps them.
- **`module_flags: null` means a legacy plan and locks nothing**, mirroring the
  backend's `requireModuleFeature`.
- **Every one of these is a UX affordance, never a security control.** The API
  independently enforces the same rules and is the actual authority.

## Service layer

`src/services/index.ts` is a **barrel and nothing else** — every consumer imports from
`@/services`. No component, route or hook should call `api`/`axios` directly.
Services may only import `@/lib/api` and `./core`; importing `lib/` would close an
import cycle (`lib/api → lib/auth → services`).

| Module | Owns |
|---|---|
| `core.ts` | Shared types, `Paginated`, status/constant catalogues, `MODULE_FEATURES` + `MODULE_GROUPS` (plan editor) |
| `auth.ts` | Login, OTP, password set/reset, refresh, admin auth |
| `verification.ts` | Requests (sent/inbox/verify), public QR verify, document blobs |
| `billing.ts` | Plans, checkout, org subscription, quota, marketing (pricing page) |
| `admin.ts` | System-admin users/orgs/requests/payments/leads/audit/login-history + document-type catalogue |
| `org.ts` | Org settings, analytics |
| `hr.ts` | Employees, salary history/components, payroll, leaves, attendance, HR letters & templates |
| `assets.ts` | Asset categories, inventory, my-assets |
| `expenses.ts` | Expense categories, claims, my-expenses |
| `offboarding.ts` | Separation/offboarding, my-resignation |
| `recruitment.ts` | Openings, candidates, pipeline, interviews, offers |
| `support.ts` | Org-side tickets + admin-side queue |
| `misc.ts` | Dashboards, notifications, own attendance/payslips |

The split from one giant file changed no import site — that is the point of the barrel.
**Do not move logic back into `index.ts`.**

## API client and session

`src/lib/api.ts` (axios) and `src/lib/auth.ts` (auth store):

- **Base URL** from `VITE_API_BASE_URL`, `withCredentials: true` so the httpOnly
  refresh cookie travels.
- **Envelope unwrapping**: any response shaped `{ success, message, data }` is reduced
  to `r.data = body.data`, so callers never touch the envelope.
- **Access token lives in memory only.** It is never written to `localStorage`, so it
  cannot be exfiltrated via XSS and no stale token survives a logout. After each full
  page load the router's `hydrate()` calls `ensureAuthenticated()`, which re-seeds it
  once from the refresh cookie — this is what makes deep links and hard refreshes
  authenticated.
- **Only the non-sensitive profile** is persisted, as `Dverif_user` in `localStorage`,
  so i18n can read `preferred_language` synchronously before React mounts.
- **Silent refresh**: on a 401 the interceptor calls `/auth/refresh` once (module-level
  single-flight flag + failed-request queue), retries every queued request with the new
  token, and clears the session and redirects to `/login` or `/system-admin/login` if
  the refresh itself fails.
- **Deactivated accounts** force-logout on any `403` whose message matches
  `/inactive|deactivated/i`.
- Auth endpoints are excluded from both behaviours, so a wrong password does not trigger
  a refresh storm.

## i18n

- **English (`en`) and Urdu (`ur`)**, `src/i18n/locales/{en,ur}.json` — 38 top-level
  namespaces, identical in both files.
- Resolution order: `localStorage("Dverif_lang")` → `user.preferred_language` → `en`.
- Date/number locale: `en-PK` / `ur-PK` via `uiLocale()`.
- The choice is persisted server-side so it follows the user across devices.
- Run `npm run audit:i18n` after adding any `t("…")` call. Computed `labelKey`s reached
  through a variable need their prefix added to `DYNAMIC_KEY_PREFIXES` in
  `scripts/audit_i18n_keys.mjs`, or the audit cannot see them.
- Known gap: `/pricing` marketing copy is hard-coded English, not translated.

## Testing

27 test files, colocated next to the code they cover (`*.test.ts` / `*.test.tsx`). No
e2e harness.

`vitest.config.ts` is **deliberately standalone** — it does not extend
`vite.config.ts`, because that config loads the TanStack Start plugin, Nitro and the
route-tree generator, none of which a unit test needs. Only the `@` path alias is
copied across.

- **jsdom, not node.** Component tests are what catch bugs TypeScript declares as
  correct: a hook called outside its provider, a string arriving where an array is
  typed, a provider mounted above the component that reads it.
- **Pool is `forks`, capped at 2.** jsdom is memory-hungry and one fork per core
  exhausted the pool once the component tests grew.
- `src/test/setup.ts` imports `@/i18n` explicitly (without it `t()` returns the raw key
  and a component test's result depends on import order), plus jsdom polyfills for
  `matchMedia`, `scrollIntoView` and `ResizeObserver`.
- Highest-value suites: `lib/routeAccess.test.ts`, `lib/hrModulePermissions.test.ts`,
  `lib/sidebarRoles.test.ts` (sidebar/guard drift), and `lib/i18nKeys.test.ts`.

## Conventions and gotchas

- **`routeTree.gen.ts` is generated.** Editing it by hand is reverted on the next dev
  server start. `letterVerifyUrl.test.ts` asserts against it, so it is a real
  dependency.
- **This is not Next.js or Remix.** No `src/pages/`, no `app/layout.tsx`, no
  `server-only` (ESLint actively bans the import — rename to `*.server.ts` or use
  `@tanstack/react-start/server-only`). `__root.tsx` is the only root layout.
- **Do not re-register Vite plugins.** `@lovable.dev/vite-tanstack-config` already
  provides the devtools, TanStack Start, React, Tailwind, tsconfig-paths, Nitro,
  `VITE_*` injection and the `@` alias. Adding any of them again breaks the app with
  duplicate plugins.
- **Never add `@/components/ui/*` by hand.** It is shadcn/ui generated output.
- **`src/lib/docxRenderer.ts` uses no `dangerouslySetInnerHTML`, anywhere.**
- **Error handling on SSR**: `src/server.ts` exists because h3 converts a throw into a
  `500 {"unhandled":true,"message":"HTTPError"}` JSON response, so a `try/catch` alone
  never fires. It normalises that shape into a real HTML error page;
  `lib/error-capture.ts` captures the stack out of band so the stack survives.
- **Dark mode is class-based** (`.dark` on `<html>`), persisted as `Dverif_theme`,
  re-applied on mount in `__root.tsx` to prevent a light flash. Reduced-motion variants
  of the custom animations are driven by CSS classes, not inline styles, because an
  inline style cannot be reached from the `prefers-reduced-motion` media query.
- **`bunfig.toml` carries a 24-hour supply-chain guard** (`minimumReleaseAge`); the
  listed exclusions are deliberate and should be confirmed before being changed.
- **Known dead code in this copy:** `src/components/salary/SalaryFormDialog.tsx` is
  exported but imported nowhere. `src/components/employees/ManageOptionsDialog.tsx` is
  live (used by `_app.org.team.$uuid.tsx`).

### Git history

This project is connected to [Lovable](https://lovable.dev). **Do not force-push, and
do not rebase / amend / squash commits that are already pushed** — that rewrites history
on Lovable's side and can lose the project history. Commits pushed to the connected
branch sync back into the Lovable editor, so keep that branch in a working state.

## Deployment

- `npm run build` → `dist/client` (static assets + prerendered shell at `/index`) and
  `dist/server` (the SSR entry that `vite.config.ts` points TanStack Start at).
- TanStack Start's SPA mode prerenders `/index`; Nitro is disabled so the output stays
  compatible with that prerender.
- **Apache**: `public/.htaccess` ships the SPA fallback (serve real files first,
  otherwise `index.html`) and is copied into the build.
- **Cloudflare**: `.wrangler/` is local dev state for the Workers target, which is the
  shared config package's default build target.
- Before deploying, confirm `VITE_API_BASE_URL` points at the production API and
  `VITE_PUBLIC_BASE_URL` matches the backend's `QR_VERIFY_BASE_URL`.

## Related documentation

| Doc | Covers |
|---|---|
| [`src/routes/README.md`](src/routes/README.md) | Every route file, and the checklist for adding a page |
| [`../python/README.md`](../python/README.md) | The OCR / corrupt-file / match microservice on :5001 |