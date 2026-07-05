# Known divergences — kacho-ui-future

Deliberate, reviewed deviations from a lint/style default. Each entry explains
why the deviation is intentional and not latent tech-debt, so audits do not
re-flag it.

## CSP `style-src 'unsafe-inline'`

**Status:** accepted / bounded residual (not an exploitable defect).

The console's Content-Security-Policy (`deploy/values.yaml` → `security.contentSecurityPolicy`)
is otherwise strict — `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
`frame-ancestors 'none'`, `form-action 'self'`, `connect-src 'self'`. Only
`style-src` is relaxed to `'self' 'unsafe-inline'`.

**Why it is required:** antd v6 styles components through a runtime CSS-in-JS
engine that injects `<style>` elements without a per-response nonce or a
build-time-stable hash. A nonce/hash-based `style-src` would break antd's runtime
styling. antd v6 does not currently expose a `StyleProvider` nonce integration
that nginx could feed via `sub_filter`.

**Why the risk is bounded:** `script-src` remains `'self'`, so no
attacker-controlled JavaScript can execute regardless of the style relaxation.
The residual is limited to CSS-only vectors (restyle/overlay of controls) and is
only reachable if a separate DOM-injection sink is introduced elsewhere — none is
known. The DPoP token flow, auth ceremony and API calls are unaffected.

**Revisit trigger:** drop `'unsafe-inline'` from `style-src` and adopt a
per-response nonce injected by the host nginx once antd exposes nonce-capable
style injection.

## `react-hooks/exhaustive-deps` line-level suppressions

**Status:** accepted / by-design (localized, not a blanket disable).

A number of `useEffect` / `useMemo` hooks in the remotes carry a
`// eslint-disable-next-line react-hooks/exhaustive-deps` comment with an
explicit, hand-picked dependency array. These are **deliberate** and are kept
line-scoped (never a file- or project-wide disable):

- **Keyed re-run effects** — e.g. operation pollers keyed on `[opId]` or
  `[op?.done, op?.error?.code, isError, opId]` (`lib/toast.ts`,
  `OperationToastWatcher`): the effect must re-run only when the operation
  identity/terminal-state changes, not when the (stable) toast/callback closures
  it references change. Listing those closures would re-fire the toast on every
  render.
- **Filter-derived list effects** — e.g. `ResourceListPage` keyed on
  `[items, query, zone, hasZoneFilter, spec.id]`: the effect derives view state
  from the current filter inputs; the omitted setter is React-stable.
- **Mount / URL-sync effects** in the auth and inline-form components that must
  run once for the initial hydrate and are intentionally not re-run on every
  dependency change.

**Why not "fix" them:** mechanically adding the missing dependencies (or wrapping
every referenced value in `useCallback`/`useRef`) would, for these specific
effects, re-introduce exactly the failure modes the suppression prevents —
duplicate toasts, redundant refetch storms, and in a couple of cases an infinite
render loop. Each site was reviewed and the dependency array is the intended
contract. New suppressions must stay line-scoped and come with a real,
intentional dependency array; a blanket rule-off is not permitted.

This entry supersedes audit finding "47 blanket eslint-disable
react-hooks/exhaustive-deps suppressions" (the count is now lower after the
vpc/iam shared-source extraction collapsed the duplicated copies to a single
source in `shared/src`).

## IAM management pages forked per remote (`vpc` vs `iam`)

**Status:** accepted / by-design (presentational fork), with an authorization
single-source invariant enforced by test.

The IAM screens — Access Bindings, Access, Groups, Roles, Users — exist as
independent component implementations in both remotes:
`vpc/src/pages/iam/<Page>.tsx` and `iam/src/pages/iam/<Page>/<Page>.tsx`.

**Why they are not one shared component:** the two remotes use deliberately
different create/edit UX wired to different route tables:

- The **iam** remote registers dedicated `/iam/<resource>/create` and
  `/iam/<resource>/:id/edit` routes (see `iam/src/pages/IamPage/IamPage.tsx`) and
  its pages `navigate()` to them; it also integrates the IAM account-selector
  context (`selectedAccount`) that only exists in the iam shell.
- The **vpc** remote has **no** such create/edit routes; its IAM pages create and
  edit in-place via antd `Modal`s (`GroupCreateModal`, `AccessBindingCreateModal`,
  …). It hosts IAM screens only as a convenience surface.

Collapsing both into a single `shared/` component would force one remote to adopt
the other's routing model (e.g. vpc would `navigate()` to a create route it never
registers → catch-all redirect), a runtime behavior change that cannot be
validated without an end-to-end federation harness. The fork is therefore
intentional and scoped to **presentation/routing only**.

**Why the security risk is neutralized:** every security-relevant primitive is
already single-sourced in `@shared` and consumed identically by both copies:

- permission gating — `@shared/lib/permissions` (`usePermissions`),
- IAM mutations + typed API — `@shared/components/organisms/iam/IamCommon`
  (`useIamMutation`) and `@shared/api/iam`,
- error mapping — `@shared/lib/permissions`
  (`isAlreadyExistsError`, `mapApiErrorToMessage`),
- session — `@shared/contexts/AuthContext`.

A fix to any of those lands once and applies to both remotes. The audit failure
scenario ("security fix applied to one copy, missed in the other") is prevented
by `shared/src/test/iam-pages-authz-single-source.test.ts`, which fails CI if any
IAM page in either remote stops sourcing the gating/mutation/API from `@shared`
or re-declares a local `usePermissions` / `useIamMutation`. The remaining
per-app difference is limited to the modal-vs-route create shell and the
iam-only `selectedAccount` gate, neither of which is an authorization decision
(the backend enforces authz; the UI gate is defense-in-depth/UX).

**Revisit trigger:** if a future task unifies the two remotes' IAM routing model
(both route-based or both modal-based), extract the shared page bodies into
`shared/src/pages/iam/` behind a thin per-app create-shell and drop the fork.

## `resource-registry.tsx` size (single central REGISTRY)

**Status:** accepted / deferred residual (cosmetic size; no security or
behavioral defect).

`shared/src/lib/resource-registry.tsx` is ~2840 lines, dominated by one
`REGISTRY: Record<string, ResourceSpec>` object literal (~lines 187-2612). It is
the single source of truth that drives every list column, detail view and create
/edit form across **both** the vpc and iam remotes.

**Why it is not split in this security pass:** every REGISTRY entry references a
shared set of in-file primitives (`COL_NAME`/`COL_ID`/`COL_CREATED`,
`FIELD_NAME`/`FIELD_PROJECT_ID`/`FIELD_ACCOUNT_ID`/…, and the `sanitizeSgRule` /
`sanitizeInstanceCreate` / `fmtBytesGiB` helpers). Splitting the object per
domain (`vpc.ts` / `iam.ts` / `compute.ts` / `nlb.ts`) requires exporting all of
those primitives and re-wiring imports across the most safety-critical shared
file in the codebase. The change is purely organizational (CWE-1121 size, not a
defect) and carries no security or behavioral benefit, while a mis-wired spec
reference would regress rendering in a way the current export-name smoke tests
would not catch and which cannot be validated without an end-to-end federation
UI harness. Under the "keep build green" mandate of the hardening pass the
risk/value trade does not justify it here.

**Planned split (follow-up, behavior-preserving):**
1. `resource-registry/primitives.ts` — export the shared column/field consts.
2. `resource-registry/sanitizers.ts` — `sanitizeSgRule`, `sanitizeInstanceCreate`,
   `fmtBytesGiB`, `gibToBytes`.
3. `resource-registry/{vpc,iam,compute,nlb}.ts` — each exports its slice of specs.
4. `resource-registry.tsx` (or `index.ts`) — composes the slices into `REGISTRY`
   and keeps the public helpers (`getResource`, `resourceServicePrefix`,
   `resourceProjectPath`, `applyFieldDefaults`, `getByPath`) so importers are
   unchanged. Land behind snapshot tests of the composed `REGISTRY` keys.

## `react-hooks/exhaustive-deps` count after shared-source extraction

The prior audit's "pervasive exhaustive-deps suppressions" finding remains
covered by the dedicated entry above. The sec-hardening-r3 extraction of the
Resource CRUD organisms into `shared/src/components/organisms/*` further reduced
the suppression count by collapsing the duplicated vpc/iam copies to one source.
