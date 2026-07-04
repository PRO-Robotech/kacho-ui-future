import { REGISTRY, getResource, resourceServicePrefix, resourceProjectPath } from "./resource-registry";

describe("registry resource-registry", () => {
  it("registers the three registry resources", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(["registries", "repositories", "tags"].sort());
  });

  it("registries spec — apiPath / payloadKey / full CRUD ops + образы child", () => {
    const reg = getResource("registries")!;
    expect(reg.apiPath).toBe("/registry/v1/registries");
    expect(reg.payloadKey).toBe("registries");
    expect(reg.scope).toBe("project");
    expect(reg.ops).toEqual({ create: true, update: true, delete: true });
    // Wire-id ребёнка = repositories (OCI/REST-контракт), tenant-facing label — «Образы».
    expect(reg.related).toEqual([{ childId: "repositories", filterField: "registry_id", label: "Образы" }]);
  });

  it("repositories (образы) — read-only (нет create/update/delete), nested apiPath, без fields", () => {
    const repo = getResource("repositories")!;
    expect(repo.apiPath).toBe("/registry/v1/registries/{registryId}/repositories");
    expect(repo.payloadKey).toBe("repositories");
    expect(repo.singular).toBe("Образ");
    expect(repo.plural).toBe("Образы");
    expect(repo.ops).toEqual({ create: false, update: false, delete: false });
    expect(repo.fields).toBeUndefined();
  });

  it("repositories — facet artifact_type (docker/helm/иные) + load-all + колонка «Тип»", () => {
    const repo = getResource("repositories")!;
    // Facet-фильтр по типу артефакта.
    expect(repo.facet?.path).toBe("artifact_type");
    expect(repo.facet?.options.map((o) => o.value)).toEqual([
      "ARTIFACT_TYPE_CONTAINER_IMAGE",
      "ARTIFACT_TYPE_HELM_CHART",
      "ARTIFACT_TYPE_OTHER",
    ]);
    // load-all: facet должен видеть полный набор (handler пагинирует).
    expect(repo.loadAllPages).toBe(true);
    // Колонка «Тип» присутствует (artifact_type).
    expect(repo.columns.some((c) => c.header === "Тип" && c.path === "artifact_type")).toBe(true);
  });

  it("tags — единственная мутация delete, nested apiPath, без create/update-полей", () => {
    const tag = getResource("tags")!;
    expect(tag.apiPath).toBe("/registry/v1/registries/{registryId}/repositories/{repository}/tags");
    expect(tag.payloadKey).toBe("tags");
    expect(tag.ops).toEqual({ create: false, update: false, delete: true });
    expect(tag.fields).toBeUndefined();
  });

  it("registries name-поле — required + immutable + create-only (входит в OCI-путь)", () => {
    const reg = getResource("registries")!;
    const name = reg.fields!.find((f) => f.name === "name")!;
    expect(name.type).toBe("string");
    expect(name.required).toBe(true);
    expect(name.immutable).toBe(true);
    expect(name.createOnly).toBe(true);
  });

  it("service prefix + project path → сегмент /registry/", () => {
    expect(resourceServicePrefix("registries")).toBe("registry");
    expect(resourceServicePrefix("repositories")).toBe("registry");
    expect(resourceServicePrefix("tags")).toBe("registry");
    expect(resourceProjectPath("registries", "prj-1")).toBe("/projects/prj-1/registry/registries");
    expect(resourceProjectPath("registries", null)).toBeNull();
  });
});
