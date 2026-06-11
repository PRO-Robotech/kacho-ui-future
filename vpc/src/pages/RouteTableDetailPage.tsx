// RouteTableDetailPage — обёртка над generic ResourceDetailPage,
// собирающая nested-breadcrumb когда RT открыт под network detail
// (URL `/projects/<projectId>/networks/<n>/route-tables/<id>`).

import { useParams } from "react-router-dom";
import { ResourceDetailPage } from "@/components/organisms/ResourceDetailPage";
import { REGISTRY } from "@/lib/resource-registry";
import { useNestedBreadcrumb } from "@/lib/use-nested-breadcrumb";

export function RouteTableDetailPage() {
  const { projectId, networkId } = useParams();
  const spec = REGISTRY["route-tables"];

  const { segments: breadcrumbSegments, backHref: backHrefOverride } = useNestedBreadcrumb({
    projectId,
    networkId,
    currentResourcePlural: spec.plural,
  });

  return <ResourceDetailPage spec={spec} backHrefOverride={backHrefOverride} breadcrumbSegments={breadcrumbSegments} />;
}
