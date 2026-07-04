// RepositoryTagsPanel — встроенная боковая панель тегов образа. Живёт ВНУТРИ
// зоны контента (сиблинг таблицы образов), не оверлей: раздвигает таблицу вбок,
// не покидает лайаут. Теги — path-scoped проекция ListTags(registryId,
// repository); read-only, кроме DeleteTag (async Operation). Digest сокращён до
// 9 символов (полный — по копированию).

import { type FC, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Popconfirm, Typography } from "antd";
import { CloseOutlined, DeleteOutlined } from "@ant-design/icons";
import { ApiError } from "@/api/client";
import { registriesApi } from "@/api/resources";
import { extractOperationId } from "@/components/molecules/OperationDialog";
import { ResourceIcon } from "@/components/organisms/form/ResourceIcon";
import { ResourceTable, type Column } from "@/components/organisms/ResourceTable";
import { ErrorResult } from "@/components/molecules/ErrorResult";
import { REGISTRY, getByPath } from "@/lib/resource-registry";
import { buildSpecColumns } from "@/lib/spec-columns";
import { useOperation } from "@/lib/use-operation";
import { shortDigest } from "@/lib/short-digest";
import { toast } from "@/lib/toast";

const TAGS_SPEC = REGISTRY.tags;

/** ShortDigestCell — короткий digest (9 симв.) + копирование полного значения. */
function ShortDigestCell({ value }: { value: unknown }) {
  const full = typeof value === "string" ? value : "";
  const short = shortDigest(value);
  if (!short) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <Typography.Text code copyable={{ text: full }} style={{ fontSize: 12 }}>
      {short}…
    </Typography.Text>
  );
}

export const RepositoryTagsPanel: FC<{
  registryId: string;
  repository: string;
  onClose: () => void;
}> = ({ registryId, repository, onClose }) => {
  const qc = useQueryClient();
  const tagsKey = useMemo(() => ["tags", "list", registryId, repository], [registryId, repository]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: tagsKey,
    queryFn: () => registriesApi.listTags(registryId, repository),
    enabled: !!registryId && !!repository,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const rows = (data?.tags as Record<string, unknown>[] | undefined) ?? [];
  const invalidateTags = () => void qc.invalidateQueries({ queryKey: tagsKey, refetchType: "all" });

  // Колонки тега из реестра, но Digest — сокращённый (9 симв.) + delete-действие.
  const columns: Column<Record<string, unknown>>[] = buildSpecColumns(TAGS_SPEC).map((c) =>
    c.header === "Digest" ? { ...c, cell: (row: Record<string, unknown>) => <ShortDigestCell value={getByPath(row, "digest")} /> } : c,
  );
  columns.push({
    header: "",
    className: "text-right whitespace-nowrap",
    cell: (row) => (
      <TagDeleteAction registryId={registryId} repository={repository} tag={getByPath<string>(row, "tag") ?? ""} onDone={invalidateTags} />
    ),
  });

  return (
    <div
      className="kc-surface"
      style={{ height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* Шапка панели: иконка + имя образа + «теги» + крестик закрытия. */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px 10px 16px",
          borderBottom: "1px solid var(--kc-border, rgba(128,128,128,0.18))",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <ResourceIcon specId={TAGS_SPEC.id} />
          <span style={{ fontWeight: 600, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {repository}
          </span>
          <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
            · теги
          </Typography.Text>
        </span>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="Закрыть теги" />
      </div>

      <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: "8px 8px 12px" }}>
        {isError ? (
          <ErrorResult error={error} />
        ) : (
          <ResourceTable
            rows={rows}
            columns={columns}
            loading={isLoading}
            rowKey={(r) => getByPath<string>(r, "tag") ?? getByPath<string>(r, "digest") ?? Math.random().toString()}
            empty="Нет тегов — образ ещё не публиковался (docker push)."
          />
        )}
      </div>
    </div>
  );
};

// TagDeleteAction — per-row удаление тега (async Operation): Popconfirm →
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
      />
    </Popconfirm>
  );
}
