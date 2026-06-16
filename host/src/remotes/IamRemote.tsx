import { lazy, Suspense } from "react";
import type { FC } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router-dom";
import type { HostContext } from "../utils";

const IamPage = lazy(async () => {
  const mod = await import("iam/IamPage");
  return { default: mod.default ?? mod.IamPage };
});

export const IamRemote: FC<{ context: HostContext }> = ({ context }) => {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<Spin />}>
      <IamPage context={context} navigate={navigate} />
    </Suspense>
  );
};
