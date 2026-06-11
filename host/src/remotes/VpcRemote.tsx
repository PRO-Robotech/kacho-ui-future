import { lazy, Suspense } from "react";
import type { FC } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router-dom";
import type { HostContext } from "../utils";

const VpcPage = lazy(async () => {
  const mod = await import("vpc/VpcPage");
  return { default: mod.default ?? mod.VpcPage };
});

export const VpcRemote: FC<{ context: HostContext }> = ({ context }) => {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<Spin />}>
      <VpcPage context={context} navigate={navigate} />
    </Suspense>
  );
};
