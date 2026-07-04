import { artifactTypeLabel } from "./ArtifactTypeTag";

// GWT-8 — маппинг типа артефакта в человекочитаемую метку (колонка «Тип» + facet).
describe("artifactTypeLabel", () => {
  it("docker-образ → «Docker-образ»", () => {
    expect(artifactTypeLabel("ARTIFACT_TYPE_CONTAINER_IMAGE")).toBe("Docker-образ");
  });
  it("helm-чарт → «Helm-чарт»", () => {
    expect(artifactTypeLabel("ARTIFACT_TYPE_HELM_CHART")).toBe("Helm-чарт");
  });
  it("иной артефакт → «Иной»", () => {
    expect(artifactTypeLabel("ARTIFACT_TYPE_OTHER")).toBe("Иной");
  });
  it("UNSPECIFIED / отсутствие / мусор → «—»", () => {
    expect(artifactTypeLabel("ARTIFACT_TYPE_UNSPECIFIED")).toBe("—");
    expect(artifactTypeLabel(undefined)).toBe("—");
    expect(artifactTypeLabel("")).toBe("—");
    expect(artifactTypeLabel(42)).toBe("—");
  });
});
