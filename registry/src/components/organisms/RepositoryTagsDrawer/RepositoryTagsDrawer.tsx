// RepositoryTagsDrawer — выдвижная боковая панель (Drawer) со списком тегов
// образа. Открывается по клику на образ в списке — БЕЗ перехода на отдельную
// страницу. Теги — path-scoped проекция ListTags(registryId, repository); read-
// only, кроме DeleteTag (async Operation). Digest сокращён до 9 символов (полный —
// по копированию).

import { type FC, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Drawer, Popconfirm, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { ApiError } from "@/api/client";
import { registriesApi } from "@/api/resources";
import { extractOperationId } from "@/components/molecules/OperationDialog";
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
    <Typography.Text code copyable={{ text: full }}>
      {short}…
    </Typography.Text>
  );
}

export const RepositoryTagsDrawer: FC<{
  registryId: string;
  repository: string | null;
  onClose: () => void;
}> = ({ registryId, repository, onClose }) => {
  const open = !!repository;
  const repo = repository ?? "";
  const qc = useQueryClient();

  const tagsKey = useMemo(() => ["tags", "list", registryId, repo], [registryId, repo]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: tagsKey,
    queryFn: () => registriesApi.listTags(registryId, repo),
    enabled: open && !!registryId && !!repo,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const rows = (data?.tags as Record<string, unknown>[] | undefined) ?? [];
  const invalidateTags = () => void qc.invalidateQueries({ queryKey: tagsKey, refetchType: "all" });

  // Стандартные колонки тега из реестра, но Digest — сокращённый (9 симв.).
  const columns: Column<Record<string, unknown>>[] = buildSpecColumns(TAGS_SPEC).map((c) =>
    c.header === "Digest" ? { ...c, cell: (row: Record<string, unknown>) => <ShortDigestCell value={getByPath(row, "digest")} /> } : c,
  );
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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={720}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo}</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
            · теги
          </Typography.Text>
        </span>
      }
      destroyOnHidden
    >
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
    </Drawer>
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
      >
        Удалить тег
      </Button>
    </Popconfirm>
  );
}
