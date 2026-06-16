// Hook для polling Operation до завершения.
// После Create/Update/Delete/action backend возвращает {operation: Operation}.
// Этот hook поллит GET /operations/{id} каждые 1 сек до done=true.
// URL verbatim из proto: operation/operation_service.proto → GET /operations/{operation_id}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Operation } from "@/api/types";

/**
 * useOperation — поллит /operations/{opId} каждые 1 сек.
 * Останавливается когда done=true.
 *
 * Передайте null чтобы деактивировать hook.
 */
export function useOperation(opId: string | null) {
  return useQuery({
    queryKey: ["operation", opId],
    queryFn: () => api.get<Operation>(`/operations/${opId}`),
    refetchInterval: (query) => (query.state.data?.done ? false : 1_000),
    enabled: !!opId,
    staleTime: 0,
  });
}

/**
 * invalidateResourceList — хелпер: инвалидирует кэш list-query после завершения операции.
 * Вызывать после done=true. Также инвалидирует breadcrumb-pill queries и
 * dashboard-queries — чтобы новые account/project/network/etc. сразу
 * появлялись в pills и в счётчиках без ручного refresh.
 *
 * useResourceList queryKey = [spec.id, "list", filterField, filterValue].
 * invalidateQueries с queryKey работает по prefix match — ["networks", "list"]
 * матчит все ["networks", "list", *, *] независимо от parent-фильтра.
 */
// Все query-ключи, которые нужно сбросить после завершения мутации над
// ресурсом resourceId. Вынесено отдельно, чтобы переиспользовать в немедленной
// и отложенной (safety) инвалидации.
//
// refetchType:"all" — КЛЮЧЕВОЕ: по умолчанию invalidateQueries рефетчит только
// АКТИВНЫЕ (примонтированные) запросы, а неактивные лишь помечает stale. При
// create-then-navigate список, на который мы переходим, ещё не примонтирован в
// момент инвалидации → он бы не рефетчился и показывал старое. "all" заставляет
// рефетчить и неактивные → новая строка видна сразу после перехода.
function invalidateResourceKeys(qc: ReturnType<typeof useQueryClient>, resourceId: string) {
  const opts = { refetchType: "all" as const };
  // Все list-варианты этого ресурса (любой parent-фильтр).
  qc.invalidateQueries({ queryKey: [resourceId, "list"], ...opts });
  // Detail-ключи resourceId-first:
  //   ResourceDetailPage/EditPage → [spec.id, "detail", uid]
  //   ResourceShell (Обзор + overviewBelow, где живут доменные панели) → [spec.id, "shell-detail", uid]
  qc.invalidateQueries({ queryKey: [resourceId, "detail"], ...opts });
  qc.invalidateQueries({ queryKey: [resourceId, "shell-detail"], ...opts });
  // RefNameLink резолвит имя по списку владельца — сбрасываем все ref-name кэши.
  qc.invalidateQueries({ queryKey: ["ref-name"], ...opts });
  // Network.Create side-effect'ом создаёт default Security Group.
  if (resourceId === "networks") {
    qc.invalidateQueries({ queryKey: ["security-groups", "list"], ...opts });
    qc.invalidateQueries({ queryKey: ["security-groups", "detail"], ...opts });
    qc.invalidateQueries({ queryKey: ["security-groups", "shell-detail"], ...opts });
  }
  // Breadcrumb pills + dashboard counts.
  qc.invalidateQueries({ queryKey: ["accounts-crumb"], ...opts });
  qc.invalidateQueries({ queryKey: ["projects-crumb"], ...opts });
  qc.invalidateQueries({ queryKey: ["dash"], ...opts });
}

export function useInvalidateResourceList() {
  const qc = useQueryClient();
  return (resourceId: string, _projectId?: string | null) => {
    void _projectId;
    // Немедленная инвалидация (рефетч активных + неактивных списков/detail).
    invalidateResourceKeys(qc, resourceId);
    // Отложенная safety-инвалидация: мутации асинхронные (Operation), и хотя
    // worker помечает Operation done после commit'а строки, повторный сброс
    // через ~1.2с защищает от любого краткого окна «done, но List ещё отдал
    // старое». Идемпотентно и безвредно (qc стабилен, повторный рефетч дёшев).
    setTimeout(() => invalidateResourceKeys(qc, resourceId), 1200);
  };
}
