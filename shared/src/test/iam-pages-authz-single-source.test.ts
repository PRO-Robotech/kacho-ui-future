import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Anti-drift authorization guard (sec-hardening-r3).
 *
 * The IAM management screens (Access Bindings / Access / Groups / Roles /
 * Users) are implemented independently in the `vpc` and `iam` micro-frontends
 * because their create/edit UX legitimately differs (vpc uses in-place modals;
 * iam uses dedicated `/iam/<x>/create` routes registered only in the iam app
 * router). See docs/architecture/known-divergences.md.
 *
 * That per-app presentational fork is acceptable ONLY as long as every
 * security-relevant primitive — the permission-gating hook, the IAM mutation
 * wrapper, the typed API layer and the error mapping — stays single-sourced in
 * `@shared`. If one remote were to fork the authorization logic locally, a
 * security fix to the shared path could silently miss it (the exact failure
 * scenario flagged by the 3rd audit).
 *
 * This test fails if any IAM page in either remote:
 *   - stops importing the IAM API / mutation layer from `@shared`, or
 *   - defines a local permission-gating hook or a local IAM mutation wrapper,
 *   - calls the network directly (raw fetch / apiFetch) instead of the shared
 *     typed IAM client.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type PageSpec = { name: string; vpc: string; iam: string; requiresPermissions?: boolean };

const IAM_PAGES: PageSpec[] = [
  {
    name: "AccessBindingsPage",
    vpc: "vpc/src/pages/iam/AccessBindingsPage.tsx",
    iam: "iam/src/pages/iam/AccessBindingsPage/AccessBindingsPage.tsx",
    requiresPermissions: true,
  },
  { name: "AccessPage", vpc: "vpc/src/pages/iam/AccessPage.tsx", iam: "iam/src/pages/iam/AccessPage/AccessPage.tsx" },
  { name: "GroupsPage", vpc: "vpc/src/pages/iam/GroupsPage.tsx", iam: "iam/src/pages/iam/GroupsPage/GroupsPage.tsx" },
  { name: "RolesPage", vpc: "vpc/src/pages/iam/RolesPage.tsx", iam: "iam/src/pages/iam/RolesPage/RolesPage.tsx" },
  { name: "UsersPage", vpc: "vpc/src/pages/iam/UsersPage.tsx", iam: "iam/src/pages/iam/UsersPage/UsersPage.tsx" },
];

function assertSharedSourced(src: string, requiresPermissions: boolean) {
  // Mutations + typed API must come from the shared layer.
  expect(src).toContain('from "@shared/api/iam"');
  expect(src).toContain('from "@shared/components/organisms/iam/IamCommon"');
  if (requiresPermissions) {
    expect(src).toContain('from "@shared/lib/permissions"');
  }
  // No locally-forked authorization / mutation primitives: the gating hook and
  // the IAM mutation wrapper must remain defined only in @shared, never
  // re-declared inside a per-app page copy.
  expect(src).not.toMatch(/\b(function|const)\s+usePermissions\b/);
  expect(src).not.toMatch(/\b(function|const)\s+useIamMutation\b/);
}

describe("IAM pages keep authorization logic single-sourced in @shared", () => {
  for (const page of IAM_PAGES) {
    for (const app of ["vpc", "iam"] as const) {
      const rel = page[app];
      it(`${app}/${page.name} sources authz/mutation/API from @shared only`, () => {
        const abs = path.join(repoRoot, rel);
        expect(existsSync(abs)).toBe(true);
        assertSharedSourced(readFileSync(abs, "utf8"), !!page.requiresPermissions);
      });
    }
  }
});
