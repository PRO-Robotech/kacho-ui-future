// SystemPage — Stage 3 «System / Administration» область iam-remote.
//
// SystemRoutes (named) — <Routes>-блок для admin-ресурсов, монтируется IamPage
// под `/iam/system/*`. SystemPage (default) — self-contained federated expose
// (RemoteShell-обвязка + SystemRoutes), для прямого MF-mount'а.
//
// Ресурсы (registry-driven, generic ResourceListPage/CreatePage/DetailPage/
// EditPage — location-relative, панель/страница-формы):
//   Regions       — /geo/v1/regions             (geo.v1.RegionService + InternalRegionService)
//   Zones         — /geo/v1/zones               (geo.v1.ZoneService + InternalZoneService)
//   AddressPools  — /vpc/v1/addressPools        (kacho-vpc admin; CIDR через :addCidrBlocks/:removeCidrBlocks)
//   Cluster admins— /iam/v1/internal/cluster    (кастомная ClusterAdminsPage)
// Все мутации async → Operation (poll /operations/{id}).

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spin } from "antd";
import { REGISTRY } from "@shared/lib/resource-registry";
import { AdminLayout } from "@/components/organisms/AdminLayout";
import { ResourceListPage } from "@/components/organisms/ResourceListPage";
import { ResourceCreatePage } from "@/components/organisms/ResourceCreatePage";
import { ResourceDetailPage } from "@shared/components/organisms/ResourceDetailPage";
import { ResourceEditPage } from "@shared/components/organisms/ResourceEditPage";
import { AddressPoolDetailPage } from "@/pages/AddressPoolDetailPage";
import { RemoteShell } from "@/pages/RemoteShell";

const ClusterAdminsPage = lazy(() => import("@/pages/system/ClusterAdminsPage"));

const spin = (
  <div style={{ padding: 48, textAlign: "center" }}>
    <Spin size="large" />
  </div>
);

export function SystemRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="regions" replace />} />

      {/* List/cluster страницы — в AdminLayout (горизонтальные табы). */}
      <Route element={<AdminLayout />}>
        <Route path="regions" element={<ResourceListPage spec={REGISTRY.regions} />} />
        <Route path="zones" element={<ResourceListPage spec={REGISTRY.zones} />} />
        <Route path="address-pools" element={<ResourceListPage spec={REGISTRY["address-pools"]} />} />
        <Route
          path="cluster/admins"
          element={
            <Suspense fallback={spin}>
              <ClusterAdminsPage />
            </Suspense>
          }
        />
      </Route>

      {/* Create/Detail/Edit — страница-формы (без AdminLayout-табов). */}
      <Route path="regions/create" element={<ResourceCreatePage spec={REGISTRY.regions} />} />
      <Route path="regions/:uid" element={<ResourceDetailPage spec={REGISTRY.regions} />} />
      <Route path="regions/:uid/edit" element={<ResourceEditPage spec={REGISTRY.regions} />} />

      <Route path="zones/create" element={<ResourceCreatePage spec={REGISTRY.zones} />} />
      <Route path="zones/:uid" element={<ResourceDetailPage spec={REGISTRY.zones} />} />
      <Route path="zones/:uid/edit" element={<ResourceEditPage spec={REGISTRY.zones} />} />

      <Route path="address-pools/create" element={<ResourceCreatePage spec={REGISTRY["address-pools"]} />} />
      <Route path="address-pools/:uid" element={<AddressPoolDetailPage />} />
      <Route path="address-pools/:uid/edit" element={<ResourceEditPage spec={REGISTRY["address-pools"]} />} />

      <Route path="*" element={<Navigate to="regions" replace />} />
    </Routes>
  );
}

export default function SystemPage() {
  return (
    <RemoteShell>
      <SystemRoutes />
    </RemoteShell>
  );
}
