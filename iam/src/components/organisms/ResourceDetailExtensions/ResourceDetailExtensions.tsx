// resource-detail-extensions — реестр доменных расширений detail-страницы.
//
// ResourceShell остаётся generic (Обзор/связанные/Операции/JSON + формы-панели).
// Доменно-специфичный контент конкретного ресурса (доп. строки Обзора, доменные
// табы — SG-правила, RouteTable-маршруты, Instance NIC/power, TG targets, IPAM,
// IAM access-bindings — кнопки-действия в шапке) подключается ЗДЕСЬ, по spec.id,
// переиспользуя уже существующие доменные компоненты/логику кастом-страниц.
//
// Так раскатка эталона на все ресурсы не теряет доменную функциональность и не
// раздувает ResourceShell. Карта миграции:
// docs/superpowers/specs/2026-05-30-kacho-ui-rollout-migration-map.json

import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PlusOutlined, KeyOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { toast } from "@/lib/toast";
import type { DetailTab } from "@/components/organisms/DetailShell";

import { RefNameLink } from "@/components/molecules/RefNameLink";
import { IamRefLink } from "@/components/molecules/IamRefLink";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { CopyableId } from "@/components/atoms/CopyableId";
import { SgRulesPanel, type SgRule } from "@/components/organisms/SgRulesPanel";
import { RoutesPanel } from "@/components/organisms/RoutesPanel";
import { SubnetCidrPanel } from "@/components/organisms/SubnetCidrPanel";
import { ResourceIcon } from "@/components/organisms/form/ResourceIcon";
import { CopyableMonoId, fmtTs } from "@/components/organisms/iam/IamCommon";
import { GroupMembersPanel } from "@/pages/iam/GroupsPage";
import type { Group } from "@/api/iam";
import { useTableScrollY } from "@/components/organisms/iam/IamListShell";
import { ReferrerLink } from "@/lib/spec-columns";
import { api } from "@/api/client";
import { iamApi, type AccessBinding, type User } from "@/api/iam";
import { AccessBindingCreateForm, type SubjectType } from "@/components/organisms/iam/AccessBindingCreateForm";
import { SaKeysPanel } from "@/components/organisms/SaKeysPanel";
import { getByPath } from "@/lib/resource-registry";

export interface DescItem {
  label: string;
  value: ReactNode;
}

export interface DetailExtCtx {
  data: Record<string, unknown>;
  projectId: string | null;
  /** Базовый URL detail-страницы ресурса (без хвостов /edit, /json, /<tab>). */
  detailBase: string;
  navigate: (to: string) => void;
}

export interface DetailExtension {
  overviewExtra?: (ctx: DetailExtCtx) => DescItem[];
  /** Контент под Обзор-таблицей (отдельные секции-таблицы с подписью, напр.
   *  статические маршруты RouteTable). */
  overviewBelow?: (ctx: DetailExtCtx) => ReactNode;
  headerActions?: (ctx: DetailExtCtx) => ReactNode;
  extraTabs?: (ctx: DetailExtCtx) => DetailTab[];
  /** Кастомная embedded create-форма для child-create-роута, которого НЕТ в
   *  REGISTRY (напр. "privileges" → AccessBindingCreateForm с залоченным
   *  субъектом). ResourceShell зовёт это в child-create branch, когда REGISTRY-spec
   *  для childRoute не найден. Форма сама навигирует через onSuccess/onCancel. */
  childCreate?: (childRoute: string, ctx: DetailExtCtx) => ReactNode;
  hideOperations?: boolean;
  title?: (data: Record<string, unknown>) => string | undefined;
}

// ─────────────────────────── helpers ───────────────────────────

const dash = <Typography.Text type="secondary">—</Typography.Text>;

function txt(v: unknown): ReactNode {
  const s = v == null ? "" : String(v);
  return s ? s : dash;
}

function mono(v: unknown): ReactNode {
  const s = v == null ? "" : String(v);
  return s ? <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{s}</span> : dash;
}

function boolTag(v: unknown, yes = "Да", no = "Нет"): ReactNode {
  return v ? <Tag color="green">{yes}</Tag> : <Tag>{no}</Tag>;
}

// CIDR-блоки — нейтральные (цвет текста) теги, друг под другом, клик = копировать.
function cidrTags(items: string[] | undefined): ReactNode {
  if (!items || items.length === 0) return dash;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {items.map((c) => (
        <Tag
          key={c}
          title="Нажмите, чтобы скопировать"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(c);
            toast.success(`Скопировано: ${c}`);
          }}
          style={{ margin: 0, cursor: "pointer", fontFamily: "ui-monospace, monospace", fontSize: 12 }}
        >
          {c}
        </Tag>
      ))}
    </span>
  );
}

// Ссылки на ресурсы (иконка + имя), друг под другом — единый вид как везде.
function refLinks(ids: string[] | undefined, specId: string): ReactNode {
  if (!ids || ids.length === 0) return dash;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {ids.map((id) => (
        <RefNameLink key={id} specId={specId} refId={id} maxChars={28} />
      ))}
    </span>
  );
}

// ── RouteTable static_routes ──
interface StaticRoute {
  destination_prefix?: string;
  next_hop_address?: string;
  gateway_id?: string;
}
// Статические маршруты — PROP таблицы маршрутизации (не смежный ресурс).
// Показываем ОТДЕЛЬНОЙ таблицей с подписью под Обзором (overviewBelow);
// добавление/правка — через «Редактировать» (generic array-field static_routes).

// ── Address: вычисление IP/семейства/вида ──
function addressInfo(data: Record<string, unknown>): { ip: string; family: string; kind: string } {
  const ext4 = getByPath<{ address?: string }>(data, "external_ipv4_address");
  const int4 = getByPath<{ address?: string }>(data, "internal_ipv4_address");
  const ext6 = getByPath<{ address?: string }>(data, "external_ipv6_address");
  const int6 = getByPath<{ address?: string }>(data, "internal_ipv6_address");
  if (ext4?.address) return { ip: ext4.address, family: "IPv4", kind: "Внешний" };
  if (int4?.address) return { ip: int4.address, family: "IPv4", kind: "Внутренний" };
  if (ext6?.address) return { ip: ext6.address, family: "IPv6", kind: "Внешний" };
  if (int6?.address) return { ip: int6.address, family: "IPv6", kind: "Внутренний" };
  return { ip: "", family: "—", kind: "—" };
}

// AddressRefTag — тег адреса: имя ресурса + доп-алиас (сам IP), кликабельно на
// detail адреса. Резолвит адрес по id (TanStack-дедуп).
function AddressRefTag({ id, projectId }: { id: string; projectId: string | null }) {
  const { data } = useQuery({
    queryKey: ["ref-address", id],
    queryFn: () => api.get<Record<string, unknown>>(`/vpc/v1/addresses/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
  const name = (data ? getByPath<string>(data, "name") : "") || id.slice(0, 12);
  const ip = data ? addressInfo(data).ip : "";
  // Единый вид ссылки на ресурс: иконка + имя (+ доп-алиас IP), не тег.
  const content = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <ResourceIcon specId="addresses" />
      {name}
      {ip && <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.85 }}> · {ip}</span>}
    </span>
  );
  return projectId ? (
    <Link
      to={`/projects/${projectId}/vpc/addresses/${id}`}
      onClick={(e) => e.stopPropagation()}
      className="text-primary hover:underline"
    >
      {content}
    </Link>
  ) : (
    <span className="text-foreground">{content}</span>
  );
}

function AddressRefTags({ ids, projectId }: { ids: string[] | undefined; projectId: string | null }): ReactNode {
  if (!ids || ids.length === 0) return dash;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {ids.map((id) => (
        <AddressRefTag key={id} id={id} projectId={projectId} />
      ))}
    </span>
  );
}

// ─────────────────────── IAM: привилегии субъекта ───────────────────────
// «Привилегии» — вложенный таб detail-страницы IAM-ресурса. Показывает
// AccessBinding'и, где данный ресурс — субъект (User/ServiceAccount/Group,
// listBySubject) либо ресурс-скоуп (Account, у которого subject-семантики нет,
// listByResource). Только чтение; выдача/отзыв — на странице «Привязки доступа».

type PrivilegesMode =
  | { kind: "subject"; subjectType: "user" | "service_account" | "group"; subjectId: string }
  | { kind: "resource"; resourceType: "account" | "project" | "cluster"; resourceId: string };

// Цвет тега типа субъекта — единая палитра со страницей «Привязки доступа».
function subjectColor(t: string): string {
  switch (t) {
    case "user":
      return "blue";
    case "service_account":
      return "gold";
    case "group":
      return "purple";
    default:
      return "default";
  }
}

// Цвет тега scope-tier'а (Область) — output-only поле AccessBinding.scope.
function scopeColor(s: string): string {
  switch (s) {
    case "CLUSTER":
      return "red";
    case "ACCOUNT":
      return "blue";
    case "PROJECT":
      return "green";
    default:
      return "default";
  }
}

// SubjectPrivilegesTab — таблица AccessBinding'ов, отфильтрованных по субъекту
// (listBySubject) или по ресурсу-скоупу (listByResource). Колонки зеркалят
// страницу «Привязки доступа»; фиксированная строка «своей» оси (субъект или
// ресурс) скрывается, т.к. она одинакова для всех строк.
function SubjectPrivilegesTab({ mode }: { mode: PrivilegesMode }) {
  const list = useQuery({
    queryKey:
      mode.kind === "subject"
        ? ["iam", "access-bindings", "by-subject", mode.subjectType, mode.subjectId]
        : ["iam", "access-bindings", "by-resource", mode.resourceType, mode.resourceId],
    queryFn: () =>
      mode.kind === "subject"
        ? iamApi.listAccessBindingsBySubject(mode.subjectType, mode.subjectId, { pageSize: "200" })
        : iamApi.listAccessBindingsByResource(mode.resourceType, mode.resourceId, { pageSize: "200" }),
    enabled: mode.kind === "subject" ? !!mode.subjectId : !!mode.resourceId,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  // Резолв role_id → name (как на странице «Привязки доступа»).
  const rolesList = useQuery({
    queryKey: ["iam", "roles", "list"],
    queryFn: () => iamApi.listRoles({ pageSize: "1000" }),
    staleTime: 30_000,
  });
  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rolesList.data?.roles ?? []) m.set(r.id, r.name);
    return m;
  }, [rolesList.data]);

  // В resource-режиме (Account) субъекты разные — резолвим email для user.
  const usersList = useQuery({
    queryKey: ["iam", "users", "list"],
    queryFn: () => iamApi.listUsers({ pageSize: "1000" }),
    enabled: mode.kind === "resource",
    staleTime: 30_000,
  });
  const userById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of usersList.data?.users ?? []) m.set(u.id, u);
    return m;
  }, [usersList.data]);

  const bindings = list.data?.access_bindings ?? [];
  const { wrapRef, scrollY } = useTableScrollY();

  const allColumns: ColumnsType<AccessBinding> = [
    {
      title: "Субъект",
      key: "subject",
      render: (_v, row) => {
        const u = row.subject_type === "user" ? userById.get(row.subject_id) : undefined;
        const human = u?.email || u?.display_name;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Tag color={subjectColor(row.subject_type)}>{row.subject_type}</Tag>
            {human && (
              <Typography.Text strong style={{ fontSize: 12 }}>
                {human}
              </Typography.Text>
            )}
            <CopyableMonoId id={row.subject_id} />
          </span>
        );
      },
    },
    {
      title: "Роль",
      dataIndex: "role_id",
      key: "role",
      render: (v: string) => {
        const roleName = roleNameById.get(v);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {roleName && <Typography.Text strong>{roleName}</Typography.Text>}
            <CopyableMonoId id={v} />
          </span>
        );
      },
    },
    {
      title: "Ресурс",
      key: "resource",
      render: (_v, row) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Tag>{row.resource_type}</Tag>
          <CopyableMonoId id={row.resource_id} />
        </span>
      ),
    },
    {
      title: "Область",
      dataIndex: "scope",
      key: "scope",
      width: 120,
      render: (v?: string) =>
        v && v !== "SCOPE_UNSPECIFIED" ? (
          <Tag color={scopeColor(v)}>{v}</Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "Создано",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (v) => fmtTs(v as string | undefined),
    },
  ];

  // subject-режим → субъект фиксирован (скрываем «Субъект»); resource-режим →
  // ресурс-скоуп фиксирован (скрываем «Ресурс»).
  const columns = allColumns.filter((c) => (mode.kind === "subject" ? c.key !== "subject" : c.key !== "resource"));

  return (
    <div style={{ height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div ref={wrapRef} className="kc-table-fill" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Table<AccessBinding>
          rowKey="id"
          size="small"
          className="kc-table"
          loading={list.isLoading}
          dataSource={bindings}
          columns={columns}
          pagination={false}
          scroll={{ x: "max-content", y: scrollY }}
          locale={{ emptyText: "Привилегий нет." }}
          data-testid="subject-privileges-table"
        />
      </div>
    </div>
  );
}

// GrantPrivilegeButton — CTA «Выдать доступ» в ШАПКЕ страницы (header-slot) на
// табе «Привилегии»: разворачивает embedded create-форму в зоне-3 detail-страницы
// (`${detailBase}/privileges/create`) с залоченным субъектом — контекст ресурса
// сохраняется (не уходим на standalone-страницу).
function GrantPrivilegeButton({ detailBase }: { detailBase: string }) {
  const navigate = useNavigate();
  return (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => navigate(`${detailBase}/privileges/create`)}
    >
      Выдать доступ
    </Button>
  );
}

// privilegesTab — DetailTab «Привилегии» для detail-страницы субъекта/скоупа.
// CTA «Выдать доступ» — в шапке страницы (headerAction → useHeaderRight); клик →
// embedded create в зоне-3 (childCreate).
function privilegesTab(mode: PrivilegesMode, detailBase: string): DetailTab {
  return {
    id: "privileges",
    label: "Привилегии",
    eyebrow: "Список",
    headerTitle: "Привилегии",
    headerIcon: <ResourceIcon specId="access-bindings" />,
    headerAction: <GrantPrivilegeButton detailBase={detailBase} />,
    fill: true,
    render: () => <SubjectPrivilegesTab mode={mode} />,
  };
}

// tokensTab — DetailTab «Токены» для detail-страницы сервисного аккаунта: список
// OAuth-ключей (SAKeyService) + выпуск токена с одноразовым показом секрета + отзыв.
// Registry-driven таблица внутри SaKeysPanel; CTA «Создать токен» живет в слоте шапки.
function tokensTab(serviceAccountId: string): DetailTab {
  return {
    id: "tokens",
    label: "Токены",
    eyebrow: "Список",
    headerTitle: "Токены",
    headerIcon: <KeyOutlined />,
    fill: true,
    render: () => <SaKeysPanel serviceAccountId={serviceAccountId} />,
  };
}

// privilegesChildCreate — билдер childCreate: embedded AccessBindingCreateForm в
// зоне-3 (mainOverride). subject-режим → субъект ЗАЛОЧЕН (реконсайл, subjectAccountId
// = home-account субъекта для scope по умолчанию); resource-режим (account-скоуп) →
// субъект НЕ залочен, форма стартует с preset-областью account:<id> (additive-only,
// multi-subject). На success/cancel — обратно на вкладку «Привилегии».
function privilegesChildCreate(
  spec:
    | { kind: "subject"; subjectType: SubjectType }
    | { kind: "resource"; resourceType: "account" | "project" | "cluster" },
): (childRoute: string, ctx: DetailExtCtx) => ReactNode {
  return (childRoute, { data, detailBase, navigate }) => {
    if (childRoute !== "privileges") return null;
    const id = getByPath<string>(data, "id") ?? "";
    const back = `${detailBase}/privileges`;
    if (spec.kind === "subject") {
      const subjectAccountId = getByPath<string>(data, "account_id") ?? null;
      return (
        <AccessBindingCreateForm
          lockedSubject={{ type: spec.subjectType, id }}
          subjectAccountId={subjectAccountId}
          onSuccess={() => navigate(back)}
          onCancel={() => navigate(back)}
        />
      );
    }
    return (
      <AccessBindingCreateForm
        preset={{ resource_type: spec.resourceType, resource_id: id }}
        onSuccess={() => navigate(back)}
        onCancel={() => navigate(back)}
      />
    );
  };
}

// ─────────────────────────── реестр ───────────────────────────

// RoleRule — правило RBAC-модели (rules[]): один module + наборы resources/verbs,
// опц. resource_names (ARM_NAMES) / match_labels (ARM_LABELS).
interface RoleRule {
  module?: string;
  resources?: string[];
  verbs?: string[];
  resource_names?: string[];
  match_labels?: Record<string, string>;
}

// arm выводится из формы правила (наличие resource_names / match_labels).
function roleRuleArm(rule: RoleRule): "ARM_NAMES" | "ARM_LABELS" | "ARM_ANCHOR" {
  if ((rule.resource_names ?? []).length > 0) return "ARM_NAMES";
  if (Object.keys(rule.match_labels ?? {}).length > 0) return "ARM_LABELS";
  return "ARM_ANCHOR";
}

// roleRulesView — рендер rules[] роли: карточка на правило с arm-бейджем
// (Все инстансы / По именам / По меткам) + module/resources/verbs (+ resourceNames/
// matchLabels для соответствующего arm).
function roleRulesView(rules: RoleRule[] | undefined): ReactNode {
  if (!rules || rules.length === 0) return dash;
  const chips = (xs: string[]) =>
    xs.map((x) => (
      <Tag key={x} style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
        {x}
      </Tag>
    ));
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
      {rules.map((rule, i) => {
        const arm = roleRuleArm(rule);
        const armLabel =
          arm === "ARM_NAMES"
            ? "По именам (resourceNames)"
            : arm === "ARM_LABELS"
              ? "По меткам (matchLabels)"
              : "Все инстансы в scope";
        const armColor = arm === "ARM_NAMES" ? "geekblue" : arm === "ARM_LABELS" ? "purple" : "default";
        return (
          <div
            key={i}
            style={{
              border: "1px solid var(--kc-border)",
              borderRadius: 6,
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <Tag color={armColor} style={{ alignSelf: "flex-start" }}>
              {armLabel}
            </Tag>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                module:
              </Typography.Text>
              <Tag style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{rule.module || "—"}</Tag>
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                resources:
              </Typography.Text>
              {chips(rule.resources ?? [])}
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                verbs:
              </Typography.Text>
              {chips(rule.verbs ?? [])}
            </span>
            {arm === "ARM_NAMES" && (
              <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  resourceNames:
                </Typography.Text>
                {chips(rule.resource_names ?? [])}
              </span>
            )}
            {arm === "ARM_LABELS" && (
              <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  matchLabels:
                </Typography.Text>
                {Object.entries(rule.match_labels ?? {}).map(([k, v]) => (
                  <Tag key={k} color="purple" style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {k}={v}
                  </Tag>
                ))}
              </span>
            )}
          </div>
        );
      })}
    </span>
  );
}

export const DETAIL_EXTENSIONS: Record<string, DetailExtension> = {
  // Role (RBAC rules-model): Тип (system/custom) + Правила (rules[]) + Область
  // (кластер/account/проект) в overview. permissions не показываются (рендер из rules[]).
  roles: {
    overviewExtra: ({ data }) => {
      const rows: DescItem[] = [
        {
          label: "Тип",
          value:
            getByPath<boolean>(data, "is_system") === true || getByPath<boolean>(data, "isSystem") === true ? (
              <Tag color="purple">system</Tag>
            ) : (
              <Tag>custom</Tag>
            ),
        },
        { label: "Правила", value: roleRulesView(getByPath<RoleRule[]>(data, "rules")) },
      ];
      const acc = getByPath<string>(data, "account_id");
      const cluster = getByPath<string>(data, "cluster_id");
      const project = getByPath<string>(data, "project_id");
      if (acc) rows.push({ label: "Область (Account)", value: <IamRefLink specId="accounts" refId={acc} /> });
      if (cluster) rows.push({ label: "Область (кластер)", value: mono(cluster) });
      if (project) rows.push({ label: "Область (проект)", value: <IamRefLink specId="projects" refId={project} /> });
      return rows;
    },
  },

  // ─────────────────────────── IAM ───────────────────────────

  // Account — не субъект AccessBinding'а, а ресурс-скоуп: таб показывает
  // привязки, выданные НА этот account (listByResource account).
  accounts: {
    // Обзор: ссылка «Владелец» (owner_user_id → user email).
    overviewExtra: ({ data }) => [
      {
        label: "Владелец",
        value: <IamRefLink specId="users" refId={getByPath<string>(data, "owner_user_id")} nameField="email" />,
      },
    ],
    extraTabs: ({ data, detailBase }) => {
      const id = getByPath<string>(data, "id") ?? "";
      return id ? [privilegesTab({ kind: "resource", resourceType: "account", resourceId: id }, detailBase)] : [];
    },
    childCreate: privilegesChildCreate({ kind: "resource", resourceType: "account" }),
  },

  // ServiceAccount — субъект типа service_account (listBySubject). Вкладки:
  // «Привилегии» (AccessBinding'и субъекта) + «Токены» (OAuth-ключи SAKeyService).
  "service-accounts": {
    overviewExtra: ({ data }) => [
      { label: "Аккаунт", value: <IamRefLink specId="accounts" refId={getByPath<string>(data, "account_id")} /> },
    ],
    extraTabs: ({ data, detailBase }) => {
      const id = getByPath<string>(data, "id") ?? "";
      if (!id) return [];
      return [
        privilegesTab({ kind: "subject", subjectType: "service_account", subjectId: id }, detailBase),
        tokensTab(id),
      ];
    },
    childCreate: privilegesChildCreate({ kind: "subject", subjectType: "service_account" }),
  },

  // User — субъект типа user (listBySubject). Обзор: статус приглашения, external
  // id, аккаунт и пригласивший пользователь (все output-only).
  users: {
    overviewExtra: ({ data }) => [
      { label: "Статус приглашения", value: <StatusBadge state={getByPath<string>(data, "invite_status")} /> },
      {
        label: "External ID",
        value: getByPath<string>(data, "external_id") ? (
          <CopyableId id={getByPath<string>(data, "external_id")!} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      },
      { label: "Аккаунт", value: <IamRefLink specId="accounts" refId={getByPath<string>(data, "account_id")} /> },
      {
        label: "Пригласил",
        value: <IamRefLink specId="users" refId={getByPath<string>(data, "invited_by")} nameField="email" />,
      },
    ],
    extraTabs: ({ data, detailBase }) => {
      const id = getByPath<string>(data, "id") ?? "";
      return id ? [privilegesTab({ kind: "subject", subjectType: "user", subjectId: id }, detailBase)] : [];
    },
    childCreate: privilegesChildCreate({ kind: "subject", subjectType: "user" }),
  },

  // Group — субъект типа group (listBySubject). Обзор: ссылка «Аккаунт»;
  // «Участники» — секция под Обзором (GroupMembersPanel, add/remove членов);
  // «Привилегии» — отдельный таб.
  groups: {
    overviewExtra: ({ data }) => [
      { label: "Аккаунт", value: <IamRefLink specId="accounts" refId={getByPath<string>(data, "account_id")} /> },
    ],
    overviewBelow: ({ data }) => (
      <GroupMembersPanel group={data as unknown as Group} accountId={getByPath<string>(data, "account_id") ?? null} />
    ),
    extraTabs: ({ data, detailBase }) => {
      const id = getByPath<string>(data, "id") ?? "";
      return id ? [privilegesTab({ kind: "subject", subjectType: "group", subjectId: id }, detailBase)] : [];
    },
    childCreate: privilegesChildCreate({ kind: "subject", subjectType: "group" }),
  },

  // AccessBinding — сводка биндинга в Обзоре: субъект/роль/ресурс (IamRefLink) +
  // статус/область/условие/защита. Резолв через те же specId, что list-колонки.
  "access-bindings": {
    overviewExtra: ({ data }) => {
      const subjType = String(getByPath<string>(data, "subject_type") ?? "");
      const subjSpec =
        subjType === "user"
          ? "users"
          : subjType === "group"
            ? "groups"
            : subjType === "service_account"
              ? "service-accounts"
              : undefined;
      const subjId = getByPath<string>(data, "subject_id") ?? "";
      const resType = String(getByPath<string>(data, "resource_type") ?? "");
      const resSpec = resType === "account" ? "accounts" : resType === "project" ? "projects" : undefined;
      const resId = getByPath<string>(data, "resource_id") ?? "";
      const scope = String(getByPath<string>(data, "scope") ?? "");
      const scopeColor = scope === "CLUSTER" ? "red" : scope === "ACCOUNT" ? "blue" : scope === "PROJECT" ? "green" : "default";
      const cond = getByPath<string>(data, "builtin_condition");
      return [
        {
          // Тип субъекта несёт иконка IamRefLink — тип-тег не дублируем.
          label: "Субъект",
          value: subjSpec ? (
            <IamRefLink specId={subjSpec} refId={subjId} nameField={subjType === "user" ? "email" : "name"} />
          ) : (
            <CopyableId id={subjId} />
          ),
        },
        { label: "Роль", value: <IamRefLink specId="roles" refId={getByPath<string>(data, "role_id")} /> },
        {
          // Тип ресурса несёт иконка IamRefLink — тип-тег не дублируем.
          label: "Ресурс",
          value: resSpec ? <IamRefLink specId={resSpec} refId={resId} /> : <CopyableId id={resId} />,
        },
        { label: "Статус", value: <StatusBadge state={getByPath<string>(data, "status")} /> },
        {
          label: "Область",
          value:
            scope && scope !== "SCOPE_UNSPECIFIED" ? (
              <Tag color={scopeColor}>{scope}</Tag>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          label: "Встроенное условие",
          value: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12 }}>{cond || "—"}</span>,
        },
        {
          label: "Защита от удаления",
          value: getByPath<boolean>(data, "deletion_protection") ? (
            <Tag color="gold">Да</Tag>
          ) : (
            <span className="text-muted-foreground">Нет</span>
          ),
        },
      ];
    },
  },

  networks: {
    overviewExtra: ({ data }) => [
      {
        label: "Группа безопасности по умолчанию",
        value: (
          <RefNameLink
            specId="security-groups"
            refId={getByPath<string>(data, "default_security_group_id")}
            maxChars={42}
          />
        ),
      },
    ],
  },

  subnets: {
    overviewExtra: ({ data }) => [
      { label: "Зона", value: mono(getByPath<string>(data, "zone_id")) },
      {
        label: "Сеть",
        value: <RefNameLink specId="networks" refId={getByPath<string>(data, "network_id")} maxChars={42} />,
      },
      {
        label: "Таблица маршрутизации",
        value: getByPath<string>(data, "route_table_id") ? (
          <RefNameLink specId="route-tables" refId={getByPath<string>(data, "route_table_id")} maxChars={42} />
        ) : (
          dash
        ),
      },
      // CIDR-блоки (IPv4/IPv6) — НЕ в таблице Обзора: они управляются отдельными
      // RPC (:add/:remove-cidr-blocks) и показаны отдельной панелью ниже.
    ],
    // CIDR-блоки — отдельная панель управления под Обзором (как «Статические
    // маршруты» у route-tables). Мутируются :add/:remove-cidr-blocks, не PATCH.
    overviewBelow: ({ data, projectId }) => {
      const subnetId = getByPath<string>(data, "id") ?? "";
      const v4 = (getByPath<string[]>(data, "v4_cidr_blocks") ?? []) as string[];
      const v6 = (getByPath<string[]>(data, "v6_cidr_blocks") ?? []) as string[];
      return <SubnetCidrPanel subnetId={subnetId} v4Blocks={v4} v6Blocks={v6} projectId={projectId} />;
    },
  },

  "route-tables": {
    overviewExtra: ({ data }) => [
      {
        label: "Сеть",
        value: <RefNameLink specId="networks" refId={getByPath<string>(data, "network_id")} maxChars={42} />,
      },
    ],
    // Статические маршруты — отдельная таблица с подписью под Обзором.
    overviewBelow: ({ data, projectId }) => {
      // KAC-239: маршруты управляются отдельно от ресурса — RoutesPanel
      // (Добавить / чекбоксы + bulk-delete), не правкой всего RT.
      const routes = (getByPath<StaticRoute[]>(data, "static_routes") ?? []) as StaticRoute[];
      const rtId = getByPath<string>(data, "id") ?? "";
      return <RoutesPanel routeTableId={rtId} projectId={projectId} routes={routes} />;
    },
  },

  "security-groups": {
    overviewExtra: ({ data, projectId }) => {
      // KAC-239 S2: потребители SG (used_by) — к кому подключена группа.
      const usedBy = getByPath<{ referrer?: { type?: string; id?: string } }[]>(data, "used_by") ?? [];
      return [
        {
          label: "Сеть",
          value: getByPath<string>(data, "network_id") ? (
            <RefNameLink specId="networks" refId={getByPath<string>(data, "network_id")} maxChars={42} />
          ) : (
            dash
          ),
        },
        { label: "Default для сети", value: boolTag(getByPath<boolean>(data, "default_for_network")) },
        {
          label: "Потребители",
          value:
            usedBy.length === 0 ? (
              dash
            ) : (
              <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                {usedBy.map((u, i) => (
                  <ReferrerLink key={i} projectId={projectId} referrer={u.referrer} />
                ))}
              </span>
            ),
        },
      ];
    },
    // req: правила — ОТДЕЛЬНЫМ табом «Правила» (таблица + «Добавить» + чекбоксы +
    // bulk-delete через SgRulesPanel). Бэкенд — UpdateRules по стабильным id.
    extraTabs: ({ data, projectId }) => {
      const all = (getByPath<SgRule[]>(data, "rules") ?? []) as SgRule[];
      const sgId = getByPath<string>(data, "id") ?? "";
      // KAC-243 (scenario 18): network_id SG → SG-target picker в редакторе
      // правил фильтрует кандидатов по той же сети.
      const networkId = getByPath<string>(data, "network_id") ?? "";
      return [
        {
          id: "rules",
          label: "Правила",
          count: all.length,
          render: () => <SgRulesPanel sgId={sgId} projectId={projectId} rules={all} networkId={networkId} />,
        },
      ];
    },
  },

  addresses: {
    overviewExtra: ({ data, projectId }) => {
      const info = addressInfo(data);
      const usedBy = getByPath<{ referrer?: { type?: string; id?: string } }[]>(data, "used_by") ?? [];
      const used = getByPath<boolean>(data, "used") ?? usedBy.length > 0;
      return [
        { label: "IP-адрес", value: cidrTags(info.ip ? [info.ip] : undefined) },
        { label: "Версия", value: txt(info.family) },
        { label: "Вид", value: txt(info.kind) },
        { label: "Используется", value: boolTag(used) },
        {
          label: "Потребители",
          value:
            usedBy.length === 0 ? (
              dash
            ) : (
              <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                {usedBy.map((u, i) => (
                  <ReferrerLink key={i} projectId={projectId} referrer={u.referrer} />
                ))}
              </span>
            ),
        },
        { label: "Защита от удаления", value: boolTag(getByPath<boolean>(data, "deletion_protection")) },
      ];
    },
  },

  gateways: {
    overviewExtra: ({ data }) => [
      { label: "Тип", value: txt(getByPath<string>(data, "type") || "SHARED_EGRESS_GATEWAY") },
    ],
  },

  "network-interfaces": {
    overviewExtra: ({ data, projectId }) => [
      {
        label: "Подсеть",
        value: <RefNameLink specId="subnets" refId={getByPath<string>(data, "subnet_id")} maxChars={42} />,
      },
      { label: "MAC-адрес", value: mono(getByPath<string>(data, "mac_address")) },
      {
        label: "IPv4-адреса",
        value: <AddressRefTags ids={getByPath<string[]>(data, "v4_address_ids")} projectId={projectId} />,
      },
      {
        label: "IPv6-адреса",
        value: <AddressRefTags ids={getByPath<string[]>(data, "v6_address_ids")} projectId={projectId} />,
      },
      {
        label: "Группы безопасности",
        value: refLinks(getByPath<string[]>(data, "security_group_ids"), "security-groups"),
      },
    ],
  },
};

export function detailExtension(specId: string): DetailExtension | undefined {
  return DETAIL_EXTENSIONS[specId];
}
