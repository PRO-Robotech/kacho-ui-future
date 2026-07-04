// ArtifactTypeTag — иконка типа OCI-артефакта образа (docker-образ / helm-чарт /
// иной). Значение — enum-имя из REST-проекции Repository.artifact_type
// (ARTIFACT_TYPE_*, сериализуется gateway'ем как строка). UNSPECIFIED / пусто → «—».
// Тип показываем компактной цветной иконкой (текстовую метку — в tooltip/aria).

import { type FC, type ComponentType } from "react";
import { Tooltip, Typography } from "antd";
import { Container, ShipWheel, Package, type LucideProps } from "lucide-react";

// Метаданные отображения per enum-значение: иконка (lucide), цвет, метка.
const ARTIFACT_META: Record<string, { label: string; color: string; Icon: ComponentType<LucideProps> }> = {
  // Container — контейнерный образ (docker/OCI); ShipWheel («штурвал») — Helm-чарт.
  ARTIFACT_TYPE_CONTAINER_IMAGE: { label: "Docker-образ", color: "#2496ed", Icon: Container },
  ARTIFACT_TYPE_HELM_CHART: { label: "Helm-чарт", color: "#6e56cf", Icon: ShipWheel },
  ARTIFACT_TYPE_OTHER: { label: "Иной", color: "var(--kc-text-tertiary, #8b929e)", Icon: Package },
};

/** artifactTypeLabel — человекочитаемая метка типа (для фильтра/тестов/tooltip). */
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
  const { Icon, label, color } = meta;
  return (
    <Tooltip title={label}>
      <span aria-label={label} role="img" style={{ display: "inline-flex", alignItems: "center", color }}>
        <Icon size={19} strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
};
