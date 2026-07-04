// RepositoryTagsPage — drill-down список тегов образа под реестром.
//
// Образ = OCI-репозиторий (wire), теги = его версии. Ресурс PATH-scoped:
// ListTags(registryId, repository) требует ОБА path-параметра, поэтому у тегов
// нет плоского project-scoped route — они живут под detail реестра
// (/registries/:uid/repositories/:repository/tags). Отсюда generic-конвейер
// (умеет только project_id-query) их не тянет — фетчим напрямую через
// registriesApi.listTags. Read-only, кроме DeleteTag (async Operation).

import { type FC, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Popconfirm, Typography } from "antd";
import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import { ApiError } from "@/api/client";
import { registriesApi } from "@/api/resources";
import { extractOperationId } from "@/components/molecules/OperationDialog";
import { PanelHeader } from "@/components/molecules/PanelHeader";
import { ResourceIcon } from "@/components/organisms/form/ResourceIcon";
import { ResourceTable, type Column } from "@/components/organisms/ResourceTable";
import { ErrorResult } from "@/components/molecules/ErrorResult";
import { useBreadcrumb } from "@/components/molecules/PageHeaderSlot";
import { REGISTRY, getByPath } from "@/lib/resource-registry";
import { buildSpecColumns } from "@/lib/spec-columns";
import { useOperation } from "@/lib/use-operation";
import { toast } from "@/lib/toast";

const TAGS_SPEC = REGISTRY.tags;

export const RepositoryTagsPage: FC = () => {
  const { projectId, uid, repository } = useParams();
  const registryId = uid ?? "";
  const repo = repository ?? "";
  const qc = useQueryClient();

  // queryKey совпадает по префиксу ["tags","list"] с generic-инвалидацией
  // (useInvalidateResourceList) — но здесь список path-scoped, поэтому ключ несёт
  // и registryId, и repository (у одного реестра много образов с тегами).
  const tagsKey = useMemo(() => ["tags", "list", registryId, repo], [registryId, repo]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: tagsKey,
    queryFn: () => registriesApi.listTags(registryId, repo),
    enabled: !!registryId && !!repo,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  // Назад — на таб «Образы» detail реестра (тот же detailBase, что во shell).
  const backHref = `/projects/${projectId}/registry/registries/${registryId}/repositories`;

  const breadcrumb = useMemo(
    () => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Typography.Text type="secondary">{TAGS_SPEC.serviceTitle}</Typography.Text>
        <Typography.Text type="secondary">/</Typography.Text>
        <Link to={backHref}>
          <Typography.Text type="secondary">Образы</Typography.Text>
        </Link>
        <Typography.Text type="secondary">/</Typography.Text>
        <Typography.Text strong style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>
          {repo}
        </Typography.Text>
      </span>
    ),
    [backHref, repo],
  );
  useBreadcrumb(breadcrumb);

  const rows = (data?.tags as Record<string, unknown>[] | undefined) ?? [];

  const invalidateTags = () => void qc.invalidateQueries({ queryKey: tagsKey, refetchType: "all" });

  const columns: Column<Record<string, unknown>>[] = buildSpecColumns(TAGS_SPEC);
  columns.push({
    header: "",
    className: "text-right whitespace-nowrap",
    cell: (row) => (
      <TagDeleteAction
        registryId={registryId}
        repository={repo}
        tag={getByPath<string>(row, "tag") ?? ""}
        onDone={invalidateTags}
      />
    ),
  });

  if (isError) return <ErrorResult error={error} />;

  return (
    <div
      className="kc-surface"
      style={{ padding: 20, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {/* Шапка (иконка + «Теги» + «<repo> · теги» + кнопка «К образам») —
          фиксирована сверху, тело таблицы скроллится внутри поверхности. */}
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <PanelHeader
          icon={<ResourceIcon specId={TAGS_SPEC.id} />}
          eyebrow="Теги"
          title={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {repo}
              </span>
              <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                · теги
              </Typography.Text>
            </span>
          }
          right={
            <Link to={backHref}>
              <Button icon={<ArrowLeftOutlined />}>К образам</Button>
            </Link>
          }
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <ResourceTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          rowKey={(r) =>
            getByPath<string>(r, "tag") ?? getByPath<string>(r, "digest") ?? Math.random().toString()
          }
          empty="Нет тегов — образ ещё не публиковался (docker push)."
        />
      </div>
    </div>
  );
};

// TagDeleteAction — per-row удаление тега (async Operation). Popconfirm →
// registriesApi.deleteTag → extractOperationId → useOperation poll до done →
// invalidate списка тегов. Ошибка → toast, список сохраняется.
function TagDeleteAction({
  registryId,
  repository,
  tag,
  onDone,
}: {
  registryId: string;
  repository: string;
  tag: string;
  onDone: () => void;
}) {
  const [pendingOpId, setPendingOpId] = useState<string | null>(null);
  const { data: op } = useOperation(pendingOpId);

  const mutation = useMutation({
    mutationFn: () => registriesApi.deleteTag(registryId, repository, tag),
    onSuccess: (resp) => {
      const opId = extractOperationId(resp);
      if (opId) {
        setPendingOpId(opId);
      } else {
        toast.success(`Тег ${tag} удалён`);
        onDone();
      }
    },
    onError: (e) => {
      const m = e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message;
      toast.error(`Удалить тег ${tag}: ${m}`);
    },
  });

  useEffect(() => {
    if (!pendingOpId || !op?.done) return;
    if (op.error) {
      toast.error(`Удалить тег ${tag}: ${op.error.message ?? "ошибка"}`);
    } else {
      toast.success(`Тег ${tag} удалён`);
      onDone();
    }
    setPendingOpId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op?.done, op?.error?.code]);

  const pending = mutation.isPending || pendingOpId !== null;

  return (
    <Popconfirm
      title="Удалить тег"
      description={
        <span>
          Тег <b>{tag}</b> будет удалён безвозвратно.
        </span>
      }
      okText="Удалить"
      okButtonProps={{ danger: true, loading: pending }}
      cancelText="Отмена"
      onConfirm={() => mutation.mutate()}
    >
      <Button
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined />}
        loading={pending}
        onClick={(e) => e.stopPropagation()}
        aria-label="Удалить тег"
      >
        Удалить тег
      </Button>
    </Popconfirm>
  );
}
