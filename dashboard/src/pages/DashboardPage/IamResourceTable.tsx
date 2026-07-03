import { useEffect, useState, type FC, type ReactNode } from "react";
import { Empty, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { apiList } from "../../utils";

// Таблицы account-scoped IAM-ресурсов прямо в дашборде (аккаунты/проекты/привязки/
// операции): логика как у дочерних таблиц в зоне-3 деталей — селектор (кнопки
// вверху) выбирает ресурс, здесь рендерится его таблица; клик по строке ведёт на
// detail-страницу ресурса в iam-remote. dashboard-remote по правилам Module
// Federation не импортирует компоненты iam-remote — таблицы свои, через api.

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

// Конфиг каждой таблицы. apiList возвращает RAW camelCase (без конверсии) —
// поэтому dataIndex в camelCase (ownerUserId/createdAt/accountId/subjectId/…).
function viewConfig(
  view: TableView,
  accountId: string | null,
): {
  title: string;
  path: string;
  query: Record<string, string>;
  payloadKey: string;
  enabled: boolean;
  columns: ColumnsType<Row>;
  detail?: (row: Row) => string | null;
} {
  switch (view) {
    case "accounts":
      return {
        title: "Аккаунты",
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
      };
    case "projects":
      return {
        title: "Проекты",
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
      };
    case "access-bindings":
      return {
        title: "Привязки доступа",
        path: accountId ? `/iam/v1/accounts/${accountId}/accessBindings` : "/iam/v1/accessBindings",
        query: { page_size: "200", include_revoked: "false" },
        payloadKey: "accessBindings",
        enabled: !!accountId,
        columns: [
          { title: "Субъект", dataIndex: "subjectId", key: "subjectId", render: mono },
          { title: "Роль", dataIndex: "roleId", key: "roleId", render: mono },
          { title: "Ресурс", dataIndex: "resourceId", key: "resourceId", render: mono },
          {
            title: "Статус",
            dataIndex: "status",
            key: "status",
            render: (v) => (typeof v === "string" && v ? v.replace(/^STATUS_/, "") : "—"),
          },
          { title: "Дата создания", dataIndex: "createdAt", key: "createdAt", render: (v) => fmtDate(v) },
        ],
        detail: (r) => (r.id ? `/iam/access-bindings/${r.id}` : null),
      };
    case "operations":
    default:
      return {
        title: "Операции",
        path: accountId ? `/iam/v1/accounts/${accountId}/operations:all` : "/iam/v1/operations",
        query: { pageSize: "100" },
        payloadKey: "operations",
        enabled: !!accountId,
        columns: [
          { title: "Идентификатор", dataIndex: "id", key: "id", render: mono },
          {
            title: "Статус",
            key: "status",
            render: (_v, r) => (r.error ? "Ошибка" : r.done ? "Выполнена" : "Выполняется"),
          },
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

  if (!cfg.enabled) {
    return <Empty description="Выберите аккаунт в дереве слева" style={{ padding: "48px 0" }} />;
  }

  return (
    <div className="dashboard-table-wrap">
      <div className="dashboard-table-head">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {cfg.title}
        </Typography.Title>
        {!loading && <span className="dashboard-table-count">{rows.length}</span>}
      </div>
      <Table<Row>
        rowKey={(r) => String(r.id ?? Math.random())}
        size="small"
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
        locale={{ emptyText: "Нет данных" }}
      />
    </div>
  );
};
