import { lazy, Suspense } from "react";
import type { FC } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router-dom";
import type { HostContext } from "../utils";

const DashboardPage = lazy(async () => {
  const mod = await import("dashboard/DashboardPage");
  return { default: mod.default ?? mod.DashboardPage };
});

export const DashboardRemote: FC<{ context: HostContext }> = ({ context }) => {
  const navigate = useNavigate();

  return (
    <Suspense fallback={<Spin aria-label="Загрузка dashboard" />}>
      <DashboardPage context={context} navigate={navigate} />
    </Suspense>
  );
};
