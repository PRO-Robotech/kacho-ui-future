// AdminLayout — обёртка над admin-страницами /iam/system/{regions,zones,
// address-pools,cluster/admins} в iam-remote. Рендерит горизонтальные табы
// навигации между admin-ресурсами (Stage 3).
//
// Применяется только для list/cluster страниц. Detail/Create/Edit ресурсов
// используют ResourceDetailPage/CreatePage/EditPage как обычно.
//
// GlobalResourceFormModal здесь НЕ монтируется: IamFrame (IamPage) / SystemPage
// монтируют его на уровне фрейма; regions/zones/address-pools используют
// panel/page-формы (ResourceCreatePage/EditPage), а не ?modal-флоу.

import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Space, Tabs, Typography } from "antd";
import { usePermissions } from "@shared/lib/permissions";

interface AdminTab {
  key: string;
  label: string;
  /** Predicate над PermissionSnapshot — true → таб виден; default — всегда. */
  visible?: (p: ReturnType<typeof usePermissions>) => boolean;
}

const TABS: AdminTab[] = [
  { key: "/iam/system/regions", label: "Регионы" },
  { key: "/iam/system/zones", label: "Зоны" },
  {
    key: "/iam/system/address-pools",
    label: "Пулы адресов",
    // AddressPool — admin-only (FGA admin@cluster:cluster_kacho_root).
    visible: (p) => p.isSystemAdmin,
  },
  {
    key: "/iam/system/cluster/admins",
    label: "Cluster admins",
    // /iam/v1/internal/cluster/* требует system_admin.
    visible: (p) => p.isSystemAdmin,
  },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const perms = usePermissions();

  const visibleTabs = useMemo(() => TABS.filter((t) => !t.visible || t.visible(perms)), [perms]);

  const active =
    visibleTabs.find((t) => location.pathname.startsWith(t.key))?.key ?? visibleTabs[0]?.key ?? TABS[0].key;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={3} className="t-page-title" style={{ margin: 0 }}>
          Администрирование
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Глобальные ресурсы инфраструктуры. Доступны только администраторам.
        </Typography.Text>
      </div>

      <Tabs
        activeKey={active}
        onChange={(k) => navigate(k)}
        items={visibleTabs.map((t) => ({ key: t.key, label: t.label }))}
        size="middle"
        style={{ marginBottom: 0 }}
        data-testid="admin-tabs"
      />

      <Outlet />
    </Space>
  );
}

export default AdminLayout;
