// resource-detail-extensions — реестр доменных расширений detail-страницы NLB.
//
// ResourceShell остаётся generic (Обзор / связанные / Операции / JSON + формы-
// панели). Доменно-специфичные строки Обзора конкретного ресурса подключаются
// здесь по spec.id. Для NLB: LoadBalancer — регион/схема/размещение/VIP/статус;
// Listener — балансировщик/протокол/порт; TargetGroup — регион/health-check.
// Богатый LoadBalancer-detail (attach/detach TG, per-tab actions) подключается
// отдельной кастом-обёрткой на следующем этапе.

import { type ReactNode } from "react";
import { Tag, Typography } from "antd";

import type { DetailTab } from "@/components/organisms/DetailShell";
import { RefNameLink } from "@/components/molecules/RefNameLink";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { NlbVipCell } from "@/components/molecules/NlbVipCell";
import { getByPath } from "@/lib/resource-registry";

export interface DescItem {
  label: string;
  value: ReactNode;
}

export interface DetailExtCtx {
  data: Record<string, unknown>;
  projectId: string | null;
  /** Базовый URL detail-страницы ресурса (без хвостов /edit, /json, /<tab>). */
  detailBase: string;
  navigate: (to: string) => void;
}

export interface DetailExtension {
  overviewExtra?: (ctx: DetailExtCtx) => DescItem[];
  /** Контент под Обзор-таблицей (отдельные секции-таблицы с подписью). */
  overviewBelow?: (ctx: DetailExtCtx) => ReactNode;
  headerActions?: (ctx: DetailExtCtx) => ReactNode;
  extraTabs?: (ctx: DetailExtCtx) => DetailTab[];
  hideOperations?: boolean;
  title?: (data: Record<string, unknown>) => string | undefined;
}

// ─────────────────────────── helpers ───────────────────────────

const dash = <Typography.Text type="secondary">—</Typography.Text>;

function txt(v: unknown): ReactNode {
  const s = v == null ? "" : String(v);
  return s ? s : dash;
}

function code(v: unknown): ReactNode {
  const s = v == null ? "" : String(v);
  return s ? (
    <Typography.Text code style={{ fontSize: 12 }}>
      {s}
    </Typography.Text>
  ) : (
    dash
  );
}

function boolTag(v: unknown, yes = "Да", no = "Нет"): ReactNode {
  return v ? <Tag color="green">{yes}</Tag> : <Tag>{no}</Tag>;
}

// ─────────────────────────── реестр ───────────────────────────

export const DETAIL_EXTENSIONS: Record<string, DetailExtension> = {
  "load-balancers": {
    overviewExtra: ({ data }) => [
      { label: "Регион", value: txt(getByPath<string>(data, "region_id")) },
      { label: "Схема", value: code(getByPath<string>(data, "type")) },
      { label: "Размещение", value: code(getByPath<string>(data, "placement_type")) },
      {
        label: "VIP-адрес",
        value: (
          <NlbVipCell
            v4AddressId={getByPath<string>(data, "v4_address_id")}
            v6AddressId={getByPath<string>(data, "v6_address_id")}
          />
        ),
      },
      { label: "Session affinity", value: code(getByPath<string>(data, "session_affinity")) },
      { label: "Статус", value: <StatusBadge state={getByPath<string>(data, "status")} /> },
      { label: "Защита от удаления", value: boolTag(getByPath<boolean>(data, "deletion_protection")) },
    ],
  },

  listeners: {
    overviewExtra: ({ data }) => [
      {
        label: "Балансировщик",
        value: <RefNameLink specId="load-balancers" refId={getByPath<string>(data, "load_balancer_id")} maxChars={42} />,
      },
      { label: "Протокол", value: code(getByPath<string>(data, "protocol")) },
      { label: "Порт", value: code(getByPath<number>(data, "port")) },
      { label: "Порт на target", value: code(getByPath<number>(data, "target_port")) },
      { label: "Статус", value: <StatusBadge state={getByPath<string>(data, "status")} /> },
    ],
  },

  "target-groups": {
    overviewExtra: ({ data }) => [
      { label: "Регион", value: txt(getByPath<string>(data, "region_id")) },
      {
        label: "Drain timeout (с)",
        value: code(getByPath<number>(data, "deregistration_delay_seconds")),
      },
      { label: "Health-check", value: code(getByPath<string>(data, "health_check.name")) },
    ],
  },
};

export function detailExtension(specId: string): DetailExtension | undefined {
  return DETAIL_EXTENSIONS[specId];
}
