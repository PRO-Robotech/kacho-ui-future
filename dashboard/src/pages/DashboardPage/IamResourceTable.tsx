import { useEffect, useState, type FC, type ReactNode } from "react";
import { Button, Empty, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Building2, FolderKanban, History, Plus, ShieldCheck } from "lucide-react";
import { apiList } from "../../utils";

// Таблицы account-scoped IAM-ресурсов прямо в дашборде (аккаунты/проекты/привязки/
// операции): логика как у дочерних таблиц в зоне-3 деталей — селектор (кнопки
// вверху) выбирает ресурс, здесь рендерится его таблица; клик по строке ведёт на
// detail-страницу ресурса в iam-remote. dashboard-remote по правилам Module
// Federation не импортирует компоненты iam-remote — таблицы свои, через api, но
// оформлены под общий стиль (шапка «Список» + счётчик + CTA «Создать»).

export type TableView = "accounts" | "projects" | "access-bindings" | "operations";

interface Row {
  id?: string;
  [k: string]: unknown;
}

interface Props {
  view: TableView;
  accountId: string | null;
  navigate: (path: string) => void | Promise<void>;
}

// fmtDate — короткий формат (dd.mm.yyyy, hh:mm) из ISO-строки.
function fmtDate(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const mono = (v: unknown): ReactNode => (
  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12.5 }}>
    {typeof v === "string" && v ? v : "—"}
  </span>
);

const nameCell = (v: unknown, r: Row): ReactNode => (typeof v === "string" && v ? v : String(r.id ?? ""));

// statusTag — статус привязки цветным тегом (как StatusBadge в iam-таблицах).
function bindingStatusTag(v: unknown): ReactNode {
  const s = typeof v === "string" ? v.replace(/^STATUS_/, "") : "";
  if (!s || s === "UNSPECIFIED") return <Tag>Unspecified</Tag>;
  const color = s === "ACTIVE" ? "green" : s === "REVOKED" ? "red" : "default";
  return <Tag color={color}>{s}</Tag>;
}

function opStatusTag(r: Row): ReactNode {
  if (r.error) return <Tag color="red">Ошибка</Tag>;
  if (r.done) return <Tag color="green">Выполнена</Tag>;
  return <Tag color="blue">Выполняется</Tag>;
}

// Конфиг каждой таблицы. apiList возвращает RAW camelCase (без конверсии) —
// поэтому dataIndex в camelCase (ownerUserId/createdAt/accountId/subjectId/…).
function viewConfig(
  view: TableView,
  accountId: string | null,
): {
  title: string;
  icon: ReactNode;
  path: string;
  query: Record<string, string>;
  payloadKey: string;
  enabled: boolean;
  columns: ColumnsType<Row>;
  detail?: (row: Row) => string | null;
  createPath?: string;
  createLabel?: string;
} {
  switch (view) {
    case "accounts":
      return {
        title: "Аккаунты",
        icon: <Building2 size={16} />,
        path: "/iam/v1/accounts",
        query: { pageSize: "1000" },
        payloadKey: "accounts",
        enabled: true,
        columns: [
          { title: "Имя", dataIndex: "name", key: "name", render: nameCell },
          { title: "Идентификатор", dataIndex: "id", key: "id", render: mono },
          { title: "Владелец", dataIndex: "ownerUserId", key: "ownerUserId", render: mono },
          { title: "Дата создания", dataIndex: "createdAt", key: "createdAt", render: (v) => fmtDate(v) },
        ],
        detail: (r) => (r.id ? `/iam/accounts/${r.id}` : null),
        createPath: "/iam/accounts/create",
        createLabel: "Создать аккаунт",
      };
    case "projects":
      return {
        title: "Проекты",
        icon: <FolderKanban size={16} />,
        path: "/iam/v1/projects",
        query: accountId ? { account_id: accountId, pageSize: "1000" } : { pageSize: "1000" },
        payloadKey: "projects",
        enabled: !!accountId,
        columns: [
          { title: "Имя", dataIndex: "name", key: "name", render: nameCell },
          { title: "Идентификатор", dataIndex: "id", key: "id", render: mono },
          { title: "Аккаунт", dataIndex: "accountId", key: "accountId", render: mono },
          { title: "Дата создания", dataIndex: "createdAt", key: "createdAt", render: (v) => fmtDate(v) },
        ],
        detail: (r) => (r.id ? `/iam/projects/${r.id}` : null),
        createPath: "/iam/projects/create",
        createLabel: "Создать проект",
      };
    case "access-bindings":
      return {
        title: "Привязки доступа",
        icon: <ShieldCheck size={16} />,
        path: accountId ? `/iam/v1/accounts/${accountId}/accessBindings` : "/iam/v1/accessBindings",
        query: { page_size: "200", include_revoked: "false" },
        payloadKey: "accessBindings",
        enabled: !!accountId,
        columns: [
          { title: "Субъект", dataIndex: "subjectId", key: "subjectId", render: mono },
          { title: "Роль", dataIndex: "roleId", key: "roleId", render: mono },
          { title: "Ресурс", dataIndex: "resourceId", key: "resourceId", render: mono },
          { title: "Статус", dataIndex: "status", key: "status", render: (v) => bindingStatusTag(v) },
          { title: "Дата создания", dataIndex: "createdAt", key: "createdAt", render: (v) => fmtDate(v) },
        ],
        detail: (r) => (r.id ? `/iam/access-bindings/${r.id}` : null),
        createPath: "/iam/access-bindings/create",
        createLabel: "Создать привязку доступа",
      };
    case "operations":
    default:
      return {
        title: "Операции",
        icon: <History size={16} />,
        path: accountId ? `/iam/v1/accounts/${accountId}/operations:all` : "/iam/v1/operations",
        query: { pageSize: "100" },
        payloadKey: "operations",
        enabled: !!accountId,
        columns: [
          { title: "Идентификатор", dataIndex: "id", key: "id", render: mono },
          { title: "Статус", key: "status", render: (_v, r) => opStatusTag(r) },
          {
            title: "Операция",
            dataIndex: "description",
            key: "description",
            render: (v) => (typeof v === "string" && v ? v : "—"),
          },
          { title: "Дата создания", dataIndex: "createdAt", key: "createdAt", render: (v) => fmtDate(v) },
        ],
        detail: () => null,
      };
  }
}

export const IamResourceTable: FC<Props> = ({ view, accountId, navigate }) => {
  const cfg = viewConfig(view, accountId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cfg.enabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiList<Record<string, Row[] | undefined>>(cfg.path, cfg.query)
      .then((resp) => {
        if (!cancelled) setRows(resp[cfg.payloadKey] ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, accountId]);

  return (
    <div className="dashboard-table-wrap">
      {/* Шапка списка: иконка + «Список» + название + счётчик слева, CTA «Создать»
          справа — как у generic-списков iam. */}
      <div className="dashboard-table-head">
        <span className="dashboard-table-eyebrow-icon">{cfg.icon}</span>
        <div className="dashboard-table-titles">
          <span className="dashboard-table-eyebrow">Список</span>
          <span className="dashboard-table-title">
            {cfg.title}
            {!loading && cfg.enabled && <span className="dashboard-table-count">{rows.length}</span>}
          </span>
        </div>
        {cfg.createPath && (
          <Button
            type="primary"
            size="small"
            icon={<Plus size={15} />}
            onClick={() => void navigate(cfg.createPath as string)}
            className="dashboard-table-create"
          >
            {cfg.createLabel}
          </Button>
        )}
      </div>

      {!cfg.enabled ? (
        <Empty description="Выберите аккаунт в дереве слева" style={{ padding: "48px 0" }} />
      ) : (
        <Table<Row>
          rowKey={(r) => String(r.id ?? Math.random())}
          size="small"
          className="dashboard-res-table"
          loading={loading}
          dataSource={rows}
          columns={cfg.columns}
          pagination={false}
          scroll={{ x: "max-content" }}
          onRow={(r) => ({
            style: cfg.detail?.(r) ? { cursor: "pointer" } : undefined,
            onClick: () => {
              const t = cfg.detail?.(r);
              if (t) void navigate(t);
            },
          })}
          locale={{ emptyText: <Empty description="Нет данных" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      )}
    </div>
  );
};
