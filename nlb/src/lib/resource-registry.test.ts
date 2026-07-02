import { jest } from "@jest/globals";
import type { IntField } from "./form-schema";

// resource-registry ↔ RefNameLink — циклический import (RefNameLink резолвит
// REGISTRY/resourceProjectPath). Разрываем цикл на время теста ESM-моком
// RefNameLink (в чистом логическом тесте компонент не рендерится).
jest.unstable_mockModule("@/components/molecules/RefNameLink", () => ({ RefNameLink: () => null }));

const { REGISTRY, getResource, resourceServicePrefix, resourceProjectPath } = await import("./resource-registry");

describe("NLB resource-registry", () => {
  it("registers the three NLB resources + compute-regions ref", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(
      ["compute-regions", "listeners", "load-balancers", "target-groups"].sort(),
    );
  });

  it("load-balancers spec — apiPath / payloadKey / start+stop ops", () => {
    const lb = getResource("load-balancers")!;
    expect(lb.apiPath).toBe("/nlb/v1/networkLoadBalancers");
    // proto repeated-поле — network_load_balancers (не load_balancers).
    expect(lb.payloadKey).toBe("network_load_balancers");
    expect(lb.scope).toBe("project");
    // NetworkLoadBalancerService несёт Start/Stop → ops обязаны их отражать.
    expect(lb.ops).toMatchObject({ create: true, update: true, delete: true, start: true, stop: true });
  });

  it("listeners / target-groups — apiPath + payloadKey", () => {
    expect(getResource("listeners")!.apiPath).toBe("/nlb/v1/listeners");
    expect(getResource("listeners")!.payloadKey).toBe("listeners");
    expect(getResource("target-groups")!.apiPath).toBe("/nlb/v1/targetGroups");
    expect(getResource("target-groups")!.payloadKey).toBe("target_groups");
  });

  it("listener port fields carry proto range min/max (не дефолтятся в 0)", () => {
    const listener = getResource("listeners")!;
    const port = listener.fields!.find((f) => f.name === "port") as IntField;
    expect(port.type).toBe("int");
    expect(port.min).toBe(1);
    expect(port.max).toBe(65535);
    expect((listener.template({ projectId: "p" }) as Record<string, unknown>).port).toBeUndefined();
  });

  describe("load-balancers sanitize — per-family/placement стрижка", () => {
    it("ZONAL INTERNAL: keeps placement_type, drops disabled_announce_zones + vip_source", () => {
      const lb = getResource("load-balancers")!;
      const out = lb.sanitize!({
        type: "INTERNAL",
        placement_type: "ZONAL",
        disabled_announce_zones: [{ value: "z1" }],
        vip_source: { _v4_enabled: true },
        name: "x",
      });
      expect(out.placement_type).toBe("ZONAL");
      expect(out.disabled_announce_zones).toBeUndefined();
      expect(out.vip_source).toBeUndefined();
      expect(out.name).toBe("x");
    });

    it("REGIONAL INTERNAL: keeps zones, maps [{value}] → [str], filters empties", () => {
      const lb = getResource("load-balancers")!;
      const out = lb.sanitize!({
        type: "INTERNAL",
        placement_type: "REGIONAL",
        disabled_announce_zones: [{ value: "z1" }, { value: "" }, { value: "z2" }],
      });
      expect(out.placement_type).toBe("REGIONAL");
      expect(out.disabled_announce_zones).toEqual(["z1", "z2"]);
    });

    it("EXTERNAL: drops placement_type (INTERNAL-only) + zones + vip_source", () => {
      const lb = getResource("load-balancers")!;
      const out = lb.sanitize!({
        type: "EXTERNAL",
        placement_type: "ZONAL",
        disabled_announce_zones: [{ value: "z1" }],
        vip_source: {},
      });
      expect(out.placement_type).toBeUndefined();
      expect(out.disabled_announce_zones).toBeUndefined();
      expect(out.vip_source).toBeUndefined();
    });
  });

  it("load-balancers hydrate — wire strings → form {value} objects", () => {
    const lb = getResource("load-balancers")!;
    const out = lb.hydrate!({ disabled_announce_zones: ["z1", "z2"] });
    expect(out.disabled_announce_zones).toEqual([{ value: "z1" }, { value: "z2" }]);
  });

  it("service prefix + project path routing", () => {
    expect(resourceServicePrefix("load-balancers")).toBe("nlb");
    expect(resourceServicePrefix("compute-regions")).toBe("compute");
    expect(resourceProjectPath("target-groups", "prj-1")).toBe("/projects/prj-1/nlb/target-groups");
    expect(resourceProjectPath("load-balancers", null)).toBeNull();
  });
});
