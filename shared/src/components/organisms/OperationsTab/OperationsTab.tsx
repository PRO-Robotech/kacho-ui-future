// OperationsTab — generic список операций (LRO) для конкретного ресурса.
// Использует verbatim YC pattern: GET <spec.apiPath>/{id}/operations.
//
// Фильтры: input по идентификатору + Select по статусу.
// Колонки — см. OperationsTable.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, Select } from "antd";
import { api, ApiError } from "@shared/api/client";
import { ErrorResult } from "@shared/components/molecules/ErrorResult";
import { OperationsTable, type Op, statusOf, type OperationStatus } from "@shared/components/molecules/OperationsTable";
import type { ResourceSpec } from "@shared/lib/resource-registry";
import { HeaderSlotPortal } from "@shared/components/organisms/DetailShell";

interface Props {
  spec: ResourceSpec;
  resourceId: string;
}

const STATUS_OPTIONS: { value: OperationStatus | "all"; label: string }[] = [
  { value: "all", label: "Все статусы" },
  { value: "running", label: "Выполняется" },
  { value: "done", label: "Выполнена" },
  { value: "error", label: "Ошибка" },
  { value: "cancelled", label: "Отменена" },
];

export function OperationsTab({ spec, resourceId }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OperationStatus | "all">("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [spec.id, "operations", resourceId],
    queryFn: () =>
      api.list<{ operations: Op[]; next_page_token?: string }>(`${spec.apiPath}/${resourceId}/operations`, {
        pageSize: "200",
      }),
    enabled: !!resourceId,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  // Хуки — ВСЕГДА до раннего return (Rules of Hooks).
  const ops = useMemo(() => {
    const raw = data?.operations ?? [];
    return (
      raw
        .map((o) => ({ ...o, resource_id: o.resource_id ?? resourceId }))
        // новое сверху — сортировка по дате создания desc.
        .sort((a, b) => {
          const ta = a.created_at ? Date.parse(a.created_at) : 0;
          const tb = b.created_at ? Date.parse(b.created_at) : 0;
          return tb - ta;
        })
    );
  }, [data, resourceId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ops.filter((o) => {
      if (status !== "all" && statusOf(o) !== status) return false;
      if (!q) return true;
      return (o.id ?? "").toLowerCase().includes(q);
    });
  }, [ops, query, status]);

  if (isError) {
    const httpStatus = error instanceof ApiError && error.status === 501 ? "404" : undefined;
    return (
      <ErrorResult
        error={error}
        status={httpStatus}
        title={httpStatus === "404" ? "404" : undefined}
        subTitle={httpStatus === "404" ? "ListOperations для этого ресурса пока не реализован." : undefined}
      />
    );
  }

  return (
    <div>
      {/* Фильтры операций — на уровень имени ресурса (зона 3, правый слот). */}
      <HeaderSlotPortal>
        <Input
          placeholder="Фильтр по идентификатору"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          style={{ width: 260 }}
        />
        <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} style={{ width: 180 }} />
      </HeaderSlotPortal>

      <OperationsTable rows={filtered} loading={isLoading} empty={ops.length > 0 && filtered.length === 0} />
    </div>
  );
}
