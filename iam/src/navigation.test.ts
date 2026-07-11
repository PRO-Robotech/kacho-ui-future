import { DASHBOARD_NAVIGATION } from "./navigation";

describe("IAM navigation", () => {
  it("exports the public IAM sections", () => {
    const section = DASHBOARD_NAVIGATION[0];

    expect(section.segment).toBe("iam");
    expect(section.landingPath).toBe("/iam/accounts");
    expect(section.items.map((item) => item.path)).toEqual([
      "/iam/accounts",
      "/iam/projects",
      "/iam/users",
      "/iam/service-accounts",
      "/iam/groups",
      "/iam/roles",
      "/iam/access-bindings",
      "/iam/access",
    ]);
  });

  it("exposes the System / Administration section (Stage 3)", () => {
    const system = DASHBOARD_NAVIGATION.find((s) => s.key === "system");

    expect(system).toBeDefined();
    expect(system?.segment).toBe("system");
    expect(system?.landingPath).toBe("/iam/system/regions");
    expect(system?.items.map((item) => item.path)).toEqual([
      "/iam/system/regions",
      "/iam/system/zones",
      "/iam/system/address-pools",
      "/iam/system/cluster/admins",
    ]);
  });

  it("exposes the Tokens & keys section (Stage 4)", () => {
    const tokens = DASHBOARD_NAVIGATION.find((s) => s.key === "tokens");

    expect(tokens).toBeDefined();
    expect(tokens?.segment).toBe("tokens");
    expect(tokens?.landingPath).toBe("/iam/tokens/service-account-keys");
    expect(tokens?.items.map((item) => item.path)).toEqual([
      "/iam/tokens/service-account-keys",
      "/iam/tokens/user-tokens",
    ]);
  });
});
