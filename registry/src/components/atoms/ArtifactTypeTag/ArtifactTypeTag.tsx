// ArtifactTypeTag — цветной тег типа OCI-артефакта образа (docker-образ / helm-чарт
// / иной). Значение — enum-имя из REST-проекции Repository.artifact_type
// (ARTIFACT_TYPE_*, сериализуется gateway'ем как строка). UNSPECIFIED / пусто → «—».

import { type FC } from "react";
import { Tag, Typography } from "antd";

// Метаданные отображения per enum-значение (label + цвет AntD Tag).
const ARTIFACT_META: Record<string, { label: string; color: string }> = {
  ARTIFACT_TYPE_CONTAINER_IMAGE: { label: "Docker-образ", color: "blue" },
  ARTIFACT_TYPE_HELM_CHART: { label: "Helm-чарт", color: "geekblue" },
  ARTIFACT_TYPE_OTHER: { label: "Иной", color: "default" },
};

/** artifactTypeLabel — человекочитаемая метка типа (для фильтра/тестов). */
export function artifactTypeLabel(value: unknown): string {
  const key = typeof value === "string" ? value : "";
  return ARTIFACT_META[key]?.label ?? "—";
}

export const ArtifactTypeTag: FC<{ value: unknown }> = ({ value }) => {
  const key = typeof value === "string" ? value : "";
  const meta = ARTIFACT_META[key];
  if (!meta) {
    // UNSPECIFIED / отсутствует — тип не определён (best-effort classify).
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return <Tag color={meta.color}>{meta.label}</Tag>;
};
