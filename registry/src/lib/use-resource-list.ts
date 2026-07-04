// Polling hook для получения списка ресурсов через REST GET.
// spec.apiPath = полный path: /iam/v1/projects, /vpc/v1/networks и т.д.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ResourceSpec } from "./resource-registry";

/**
 * useResourceList — поллит GET <apiPath>?<filterField>=<filterValue> каждые 3 сек.
 *
 * filterField + filterValue — параметр родителя (project_id / account_id).
 * Если оба null — список без фильтра (для cluster-scoped ресурсов).
 */
export function useResourceList<T = Record<string, unknown>>(
  spec: ResourceSpec,
  filterField: string | null,
  filterValue: string | null,
) {
  return useQuery({
    queryKey: [spec.id, "list", filterField, filterValue],
    queryFn: () => {
      const q: Record<string, string> = {};
      if (filterField && filterValue) q[filterField] = filterValue;
      return api.list<Record<string, T[]>>(spec.apiPath, q);
    },
    refetchInterval: 3_000,
    enabled: !filterField || !!filterValue,
    staleTime: 0,
  });
}

/**
 * fetchAllPages — грузит ВСЕ страницы списка (follow next_page_token до пустого) и
 * возвращает аккумулированный набор строк под payloadKey. Query-параметры
 * пагинации — camelCase (pageSize/pageToken); ключ next-токена в теле — snake_case
 * (next_page_token). Цикл ограничен MAX_PAGES (runaway-guard). listFn инъектится
 * (по умолчанию api.list) — чистая тестируемость без сети.
 */
const MAX_PAGES = 100;

type ListFn = (path: string, q: Record<string, string>) => Promise<Record<string, unknown>>;

export async function fetchAllPages<T = Record<string, unknown>>(
  apiPath: string,
  payloadKey: string,
  listFn: ListFn = (p, q) => api.list<Record<string, unknown>>(p, q),
): Promise<T[]> {
  const acc: T[] = [];
  let token = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const q: Record<string, string> = { pageSize: "1000" };
    if (token) q.pageToken = token;
    const resp = await listFn(apiPath, q);
    const rows = (resp[payloadKey] as T[] | undefined) ?? [];
    acc.push(...rows);
    token = (resp.next_page_token as string | undefined) ?? "";
    if (!token) break;
  }
  return acc;
}

/**
 * useResourceListAllPages — грузит ВСЕ страницы списка и отдаёт аккумулированный
 * набор под spec.payloadKey. Нужен для client-side facet над полным набором (напр.
 * образы реестра): handler пагинирует (pageByName), поэтому одиночная страница
 * дала бы неполный фильтр (helm-образ со страницы 2+ пропал бы).
 */
export function useResourceListAllPages<T = Record<string, unknown>>(
  spec: ResourceSpec,
  opts: { enabled: boolean },
) {
  return useQuery({
    queryKey: [spec.id, "list-all", spec.apiPath],
    queryFn: async () => {
      const rows = await fetchAllPages<T>(spec.apiPath, spec.payloadKey);
      return { [spec.payloadKey]: rows } as Record<string, T[]>;
    },
    refetchInterval: 3_000,
    enabled: opts.enabled,
    staleTime: 0,
  });
}
