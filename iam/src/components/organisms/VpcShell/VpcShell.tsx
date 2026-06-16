// VpcShell — обёртка для list / detail VPC-страниц, добавляющая mount
// <ResourceFormModal/> для всех ресурсов (open через ?modal=<spec>-create
// или ?modal=<spec>-edit&id=<uid>).
//
// Один компонент per route — заменяет прямой mount ResourceListPage /
// ResourceDetailPage в роутинге, чтобы у каждой VPC-страницы автоматически
// был mount-point модалки.

import { useParams } from "react-router-dom";
import { ResourceListPage } from "@/components/organisms/ResourceListPage";
import { ResourceDetailPage } from "@/components/organisms/ResourceDetailPage";
import { ResourceFormModal } from "@/components/organisms/ResourceFormModal";
import type { ResourceSpec } from "@/lib/resource-registry";

interface ListProps {
  spec: ResourceSpec;
  parentField?: string;
  parentParam?: string;
}

export function VpcListShell({ spec, parentField, parentParam }: ListProps) {
  const { projectId } = useParams();
  return (
    <>
      <ResourceListPage spec={spec} parentField={parentField} parentParam={parentParam} />
      {projectId && <ResourceFormModal projectId={projectId} />}
    </>
  );
}

interface DetailProps {
  spec: ResourceSpec;
  paramKey?: string;
}

export function VpcDetailShell({ spec, paramKey }: DetailProps) {
  const { projectId } = useParams();
  return (
    <>
      <ResourceDetailPage spec={spec} paramKey={paramKey} />
      {projectId && <ResourceFormModal projectId={projectId} />}
    </>
  );
}
