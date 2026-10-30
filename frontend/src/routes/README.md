# Routes

Every `.tsx` file in this directory is a route — TanStack Start uses **file-based
routing**. The Vite plugin generates `src/routeTree.gen.ts` from these filenames.

Do **not** create `src/pages/`, `app/layout.tsx`, or import `server-only`. Those are
Next.js / Remix conventions and do not exist here. `__root.tsx` is the only root layout.

## Naming conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

This project uses one more convention: **flat dotted files, not nested folders**.
`_app.org.team.tsx` ⇒ `/org/team`. A trailing `_` opts a route **out** of its parent
layout — `_app.auto-verified_.$uuid.tsx` ⇒ `/auto-verified/:uuid` renders bare, not
inside `<AppShell>`.

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Public routes

| File | URL | Notes |
| --- | --- | --- |
| `index.tsx` | `/` | Pure redirect: `/dashboard` if a token exists, else `/login` |
| `login.tsx` | `/login` | Two-step: password → 6-digit OTP |
| `pricing.tsx` | `/pricing` | Public plan cards via `marketingService.listPlans()` |
| `forgot-password.tsx` | `/forgot-password` | |
| `reset-password.tsx` | `/reset-password` | |
| `set-password.tsx` | `/set-password` | Invitation flow |
| `verify.$qrToken.tsx` | `/verify/:qrToken` | Public document verification from a scanned QR |
| `verify.letter.$qrToken.tsx` | `/verify/letter/:qrToken` | Public HR-letter verification |
| `system-admin.login.tsx` | `/system-admin/login` | |
| `system-admin.forgot-password.tsx` | `/system-admin/forgot-password` | |
| `system-admin.reset-password.tsx` | `/system-admin/reset-password` | |

## `_app` — the signed-in shell

`_app.tsx` renders `<AppShell>` (sidebar, notifications, theme + language switch) and
holds the **single** navigation guard in `beforeLoad`: no token ⇒ `/login`, else
`canAccessRoute()` ⇒ otherwise `/dashboard`.

### Employee / self-service

| File | URL |
| --- | --- |
| `_app.dashboard.tsx` | `/dashboard` |
| `_app.requests.tsx` | `/requests` |
| `_app.leaves.tsx` | `/leaves` |
| `_app.attendance.tsx` | `/attendance` |
| `_app.payroll.tsx` | `/payroll` |
| `_app.my-letters.tsx` | `/my-letters` |
| `_app.my-assets.tsx` | `/my-assets` |
| `_app.my-expenses.tsx` | `/my-expenses` |
| `_app.my-resignation.tsx` | `/my-resignation` |
| `_app.settings.tsx` | `/settings` |

### Review queues

| File | URL | Notes |
| --- | --- | --- |
| `_app.inbox.tsx` | `/inbox` | Manual verification worklist |
| `_app.auto-verified.tsx` | `/auto-verified` | |
| `_app.auto-verified_.$uuid.tsx` | `/auto-verified/:uuid` | Trailing `_` — renders outside `<AppShell>` |

### Billing

| File | URL |
| --- | --- |
| `_app.payments.tsx` | `/payments` |
| `_app.payment.callback.tsx` | `/payment/callback` |

### Org admin

| File | URL |
| --- | --- |
| `_app.org.team.tsx` | `/org/team` (layout) |
| `_app.org.team.index.tsx` | `/org/team` |
| `_app.org.team.$uuid.tsx` | `/org/team/:uuid` |
| `_app.org.admins.tsx` | `/org/admins` |
| `_app.org.leaves.tsx` | `/org/leaves` |
| `_app.org.attendance.tsx` | `/org/attendance` |
| `_app.org.salary-components.tsx` | `/org/salary-components` |
| `_app.org.payroll.tsx` | `/org/payroll` |
| `_app.org.letter-templates.tsx` | `/org/letter-templates` |
| `_app.org.hr-letters.tsx` | `/org/hr-letters` |
| `_app.org.expense-claims.tsx` | `/org/expense-claims` |
| `_app.org.assets.tsx` | `/org/assets` |
| `_app.org.asset-categories.tsx` | `/org/asset-categories` |
| `_app.org.offboarding.tsx` | `/org/offboarding` |
| `_app.org.support.tsx` | `/org/support` (layout) |
| `_app.org.support.index.tsx` | `/org/support` |
| `_app.org.support.$uuid.tsx` | `/org/support/:uuid` |

### Recruitment (5 tabs, same plan gate)

| File | URL |
| --- | --- |
| `_app.org.recruitment.pipeline.tsx` | `/org/recruitment/pipeline` |
| `_app.org.recruitment.openings.tsx` | `/org/recruitment/openings` |
| `_app.org.recruitment.candidates.tsx` | `/org/recruitment/candidates` |
| `_app.org.recruitment.interviews.tsx` | `/org/recruitment/interviews` |
| `_app.org.recruitment.offers.tsx` | `/org/recruitment/offers` |

### System admin

| File | URL |
| --- | --- |
| `_app.admin.users.tsx` | `/admin/users` |
| `_app.admin.organizations.tsx` | `/admin/organizations` |
| `_app.admin.requests.tsx` | `/admin/requests` |
| `_app.admin.null-requests.tsx` | `/admin/null-requests` |
| `_app.admin.unresponsive.tsx` | `/admin/unresponsive` |
| `_app.admin.payments.tsx` | `/admin/payments` |
| `_app.admin.leads.tsx` | `/admin/leads` |
| `_app.admin.login-history.tsx` | `/admin/login-history` |
| `_app.admin.activity-logs.tsx` | `/admin/activity-logs` |
| `_app.admin.support.tsx` | `/admin/support` (layout) |
| `_app.admin.support.index.tsx` | `/admin/support` |
| `_app.admin.support.$uuid.tsx` | `/admin/support/:uuid` |

## Tests in this directory

`attachmentCard.test.tsx`, `hrLettersActions.test.tsx`, `templateEditor.test.tsx`, and
`__tests__/recruitment.*.test.tsx` are colocated tests, not routes.

## Adding a page

1. Create the file in `src/routes/` using the naming above.
2. Add a row for its path to `ROUTE_ACCESS` in `src/lib/routeAccess.ts`. Detail routes
   (`/x/:id`) inherit their list route's row by prefix walk-up and need no second entry.
   The table **fails closed** — an authenticated org user on a path with no row is
   denied, so skipping this step breaks the page immediately.
3. Add the link to `src/lib/navItems.ts` if it belongs in the sidebar. Both read the
   same table, so a rendered link and the guard can never disagree.
4. If the page is plan-gated, wrap it in `components/hr/ModuleGate.tsx` (module flags),
   not `RequireOrgFeature` (delegated permissions). Personal ESS pages are role-gated,
   never permission-gated. If the page also has a sidebar link, add its path to
   `ROUTE_MODULES` in `src/lib/routeModules.ts` so the menu offers the upgrade badge
   instead of opening a page that can only show the lock card.
5. Use `t("…")` for every visible string, add the keys to **both** `en.json` and
   `ur.json`, then run `npm run audit:i18n`.
6. `npm run verify` before you push.