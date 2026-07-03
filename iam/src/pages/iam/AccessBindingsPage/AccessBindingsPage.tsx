// AccessBindingsPage — управление AccessBinding'ами.
// View modes:
//   - "byResource" → list per (resource_type + resource_id);
//   - "bySubject" → list per (subject_type + subject_id).
//   - "byAccount" → KAC item #1: admin-wide list по AccountID (новый RPC
//      AccessBindingService.ListByAccount, доступен только admin'у account'а).
//
// Create — отдельная модалка: subject_type/id + role + resource_type/id +
// поддержка resource_type=cluster (KAC item #5) для unified cluster-admin grant.
// На 409 ALREADY_EXISTS → inline Alert с verbatim message (KAC item #3).

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Empty, Form, Input, Select, Space, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/api/client";
import { ResourceTable, type Column } from "@/components/organisms/ResourceTable";
import { RowActionsMenu } from "@/components/molecules/RowActionsMenu";
import { REGISTRY, getByPath } from "@/lib/resource-registry";
import { buildSpecColumns } from "@/lib/spec-columns";
import {
  iamApi,
  IAM,
  type AccessBindingList,
  type User,
  type ServiceAccount,
  type Group,
} from "@/api/iam";
import { groupedRoleOptions } from "@/components/organisms/iam/IamCommon";
import { FormFooter } from "@/components/organisms/form/FormFooter";
import { FormShell } from "@/components/organisms/form/FormShell";
import { useBreadcrumb, useHeaderRight } from "@/components/molecules/PageHeaderSlot";
import { IamListShell } from "@/components/organisms/iam/IamListShell";
import { useContext } from "@/lib/context-store";
import { isAlreadyExistsError, mapApiErrorToMessage } from "@/lib/permissions";

type SubjectType = "user" | "service_account" | "group";
// KAC-224 (RBAC v2): только высокоуровневые скоупы, принимаемые backend
// validResourceTypes. Legacy resource-manager типы folder/organization/cloud
// удалены (KAC-124 / KAC-223 mig0008) — их выбор давал backend
// INVALID_ARGUMENT "Illegal argument resource_type". "cluster" — для unified
// cluster-admin grant (item #5, resource_id = "cluster_kacho_root").
type ResourceType = "account" | "project" | "cluster";

const SUBJECT_TYPES: SubjectType[] = ["user", "service_account", "group"];
export const RESOURCE_TYPES: ResourceType[] = ["account", "project", "cluster"];

/** Cluster singleton id для resource_type="cluster" (KAC item #5). */
export const CLUSTER_RESOURCE_ID = "cluster_kacho_root";

/** Cluster admin role id (для preset'ов / quick-grant link'ов). */
export const CLUSTER_ADMIN_ROLE_ID = "roles/admin";

// AccessBindingsPage — единая плоская таблица привязок доступа в выбранном
// Account. Account берётся из context-store (пилюля в шапке), как и у прочих
// account-scoped IAM-страниц. Показывается ОДНА таблица «кто какую роль имеет на
// каком ресурсе» — GET /iam/v1/accounts/{id}/accessBindings (ListByAccount).
// Прежний 3-view-mode (byResource/bySubject/byAccount) + карточка «Мои
// AccessBinding'и» + inline-модалка убраны как сбивающие с толку.
//
// Таблица — ТИПОВАЯ (как у generic-списков): ResourceTable + buildSpecColumns
// (колонки из REGISTRY["access-bindings"]: субъект/роль/ресурс/статус/область/
// кто выдал/защита/создано) + kebab-колонка RowActionsMenu (Просмотр + Отозвать
// = Delete). Create — отдельная full-page форма (AccessBindingCreatePage);
// CTA «Создать привязку доступа» делает navigate на неё. Detail — клик по строке.
export function AccessBindingsPage() {
  const account = useContext((s) => s.account);
  const navigate = useNavigate();
  const abSpec = REGISTRY["access-bindings"];

  // Legacy deep-link ?modal=cluster-admin / ?modal=access-bindings-create →
  // редирект на full-page create, сохраняя preset-параметры.
  const [searchParams] = useSearchParams();
  const legacyModal = searchParams.get("modal");
  const legacyRedirect = useMemo(() => {
    if (legacyModal !== "cluster-admin" && legacyModal !== "access-bindings-create") return null;
    const next = new URLSearchParams(searchParams);
    next.delete("modal");
    if (legacyModal === "cluster-admin") {
      if (!next.get("resource_type")) next.set("resource_type", "cluster");
      if (!next.get("resource_id")) next.set("resource_id", CLUSTER_RESOURCE_ID);
      if (!next.get("role_id")) next.set("role_id", CLUSTER_ADMIN_ROLE_ID);
    }
    const qs = next.toString();
    return `/iam/access-bindings/create${qs ? `?${qs}` : ""}`;
  }, [legacyModal, searchParams]);

  // Лёгкий фильтр-ряд: только активные / включая отозванные + опц. subject_type.
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<string>("");

  const accountId = account?.id ?? "";

  // Единая таблица — все bindings, видимые в выбранном Account (account-scoped +
  // project-scoped). Не запрашиваем, пока Account не выбран.
  const bindingsQ = useQuery({
    queryKey: ["iam", "access-bindings", "by-account", accountId, subjectTypeFilter, includeRevoked],
    queryFn: () =>
      iamApi.listAccessBindingsByAccount(accountId, {
        page_size: 200,
        subject_type_filter: subjectTypeFilter || undefined,
        include_revoked: includeRevoked,
      }),
    enabled: !!accountId,
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const bindings = (bindingsQ.data as AccessBindingList | undefined)?.access_bindings ?? [];

  // Колонки — из REGISTRY (без type-Tag'ов: тип несёт иконка IamRefLink) +
  // kebab-колонка. revoke = Delete (RowActionsMenu, spec.ops.delete); by-account
  // query имеет refetchInterval 5s, так что строка уходит ≤5s.
  const columns: Column<Record<string, unknown>>[] = useMemo(() => {
    const cols = buildSpecColumns(abSpec);
    cols.push({
      header: "",
      className: "text-right whitespace-nowrap",
      cell: (row) => <RowActionsMenu spec={abSpec} row={row} basePath="/iam/access-bindings" projectId={null} />,
    });
    return cols;
  }, [abSpec]);

  // breadcrumb / CTA через header-слоты. Мемоизируем node'ы (useEffect на [node]).
  const breadcrumbNode = useMemo(
    () => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Typography.Text type="secondary">{abSpec.serviceTitle}</Typography.Text>
        <Typography.Text type="secondary">/</Typography.Text>
        <Typography.Text strong>{abSpec.plural}</Typography.Text>
      </span>
    ),
    [abSpec.serviceTitle, abSpec.plural],
  );
  const ctaNode = useMemo(
    () => (
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => navigate("/iam/access-bindings/create")}
        data-testid="access-bindings-create-btn"
      >
        Создать привязку доступа
      </Button>
    ),
    [navigate],
  );
  useBreadcrumb(breadcrumbNode);
  useHeaderRight(ctaNode);

  if (legacyRedirect) return <Navigate to={legacyRedirect} replace />;

  if (!account) {
    return (
      <IamListShell specId="access-bindings" title={abSpec.plural}>
        <Empty
          description="Выберите Account вверху секции, чтобы увидеть привязки доступа."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: "48px 0" }}
        />
      </IamListShell>
    );
  }

  return (
    <IamListShell
      specId="access-bindings"
      title={abSpec.plural}
      count={bindings.length}
      right={
        <Space size={8} wrap>
          <Select
            value={includeRevoked ? "true" : "false"}
            onChange={(v) => setIncludeRevoked(v === "true")}
            options={[
              { value: "false", label: "Только активные" },
              { value: "true", label: "Включая отозванные" },
            ]}
            style={{ width: 200 }}
            data-testid="access-bindings-revoked-filter"
          />
          <Select
            placeholder="subject_type (все)"
            value={subjectTypeFilter || undefined}
            onChange={(v) => setSubjectTypeFilter(v ?? "")}
            allowClear
            options={(["user", "service_account", "group"] as const).map((t) => ({ value: t, label: t }))}
            style={{ width: 200 }}
            data-testid="access-bindings-subject-filter"
          />
        </Space>
      }
    >
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }} data-testid="access-bindings-table">
        <ResourceTable
          rows={bindings as unknown as Record<string, unknown>[]}
          columns={columns}
          rowKey={(r) => getByPath<string>(r, "id") ?? Math.random().toString()}
          loading={bindingsQ.isLoading}
          onRowClick={(row) => {
            const id = getByPath<string>(row, "id");
            if (id) navigate(`/iam/access-bindings/${id}`);
          }}
        />
      </div>
    </IamListShell>
  );
}

/**
 * Preset для create-формы — pre-fill полей («Grant Cluster Admin» CTA). Если
 * передать resource_type="cluster" + resource_id="cluster_kacho_root" +
 * role_id="roles/admin" — форма откроется с pre-fixated cluster-admin grant.
 */
export interface AccessBindingPreset {
  subject_type?: SubjectType;
  subject_id?: string;
  role_id?: string;
  resource_type?: ResourceType;
  resource_id?: string;
}

export function AccessBindingCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preset: AccessBindingPreset = useMemo(
    () => ({
      resource_type: (searchParams.get("resource_type") as ResourceType | null) ?? undefined,
      resource_id: searchParams.get("resource_id") ?? undefined,
      role_id: searchParams.get("role_id") ?? undefined,
      subject_type: (searchParams.get("subject_type") as SubjectType | null) ?? undefined,
      subject_id: searchParams.get("subject_id") ?? undefined,
    }),
    [searchParams],
  );
  const [form] = Form.useForm();
  const [subjectType, setSubjectType] = useState<SubjectType>(preset?.subject_type ?? "user");
  const [resourceType, setResourceType] = useState<ResourceType>(preset?.resource_type ?? "account");
  useHeaderRight(useMemo(() => null, []));
  useBreadcrumb(
    useMemo(
      () => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Typography.Text type="secondary">IAM</Typography.Text>
          <Typography.Text type="secondary">/</Typography.Text>
          <Link to="/iam/access-bindings">
            <Typography.Text type="secondary">Access Bindings</Typography.Text>
          </Link>
          <Typography.Text type="secondary">/</Typography.Text>
          <Typography.Text strong>Создать</Typography.Text>
        </span>
      ),
      [],
    ),
  );
  // KAC item #3: при 409 ALREADY_EXISTS / любой другой ошибке — inline
  // Alert внутри модалки, форма НЕ закрывается (см. CLAUDE.md §3.5).
  const [inlineError, setInlineError] = useState<{
    type: "warning" | "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  // Сбрасываем форму при открытии (если был preset — применить).
  useEffect(() => {
    setInlineError(null);
    setSubjectType(preset?.subject_type ?? "user");
    setResourceType(preset?.resource_type ?? "account");
    form.setFieldsValue({
      subject_type: preset?.subject_type ?? "user",
      subject_id: preset?.subject_id ?? undefined,
      role_id: preset?.role_id ?? undefined,
      resource_type: preset?.resource_type ?? "account",
      resource_id: preset?.resource_id ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.subject_type, preset?.subject_id, preset?.role_id, preset?.resource_type, preset?.resource_id]);

  const users = useQuery({
    queryKey: ["iam", "users", "list"],
    queryFn: () => iamApi.listUsers({ pageSize: "1000" }),
    staleTime: 30_000,
  });
  const roles = useQuery({
    queryKey: ["iam", "roles", "list"],
    queryFn: () => iamApi.listRoles({ pageSize: "1000" }),
    staleTime: 30_000,
  });
  const sas = useQuery({
    queryKey: ["iam", "service-accounts", "all"],
    queryFn: async () => {
      const accs = await iamApi.listAccounts({ pageSize: "1000" });
      const all: ServiceAccount[] = [];
      for (const a of accs.accounts) {
        const r = await iamApi.listServiceAccounts({
          account_id: a.id,
          pageSize: "1000",
        });
        all.push(...(r.service_accounts ?? []));
      }
      return all;
    },
    enabled: subjectType === "service_account",
    staleTime: 30_000,
  });
  const groups = useQuery({
    queryKey: ["iam", "groups", "all"],
    queryFn: async () => {
      const accs = await iamApi.listAccounts({ pageSize: "1000" });
      const all: Group[] = [];
      for (const a of accs.accounts) {
        const r = await iamApi.listGroups({
          account_id: a.id,
          pageSize: "1000",
        });
        all.push(...(r.groups ?? []));
      }
      return all;
    },
    enabled: subjectType === "group",
    staleTime: 30_000,
  });

  const subjectOptions = useMemo(() => {
    switch (subjectType) {
      case "user":
        return (users.data?.users ?? []).map((u: User) => ({
          value: u.id,
          label: `${u.email || u.display_name || u.id} · ${u.id}`,
        }));
      case "service_account":
        return (sas.data ?? []).map((sa) => ({
          value: sa.id,
          label: `${sa.name} · ${sa.id}`,
        }));
      case "group":
        return (groups.data ?? []).map((g) => ({
          value: g.id,
          label: `${g.name} · ${g.id}`,
        }));
    }
  }, [subjectType, users.data, sas.data, groups.data]);

  // Submit: вызов POST /iam/v1/accessBindings напрямую через `api.create`,
  // чтобы поймать 409 ALREADY_EXISTS (verbatim сообщение
  // "these permissions are already granted to <subject_id> on
  // <resource_type>:<resource_id>") — KAC item #3.
  const onFinish = async (v: Record<string, string>) => {
    setSubmitting(true);
    setInlineError(null);
    const body = {
      subject_type: v.subject_type,
      subject_id: v.subject_id,
      role_id: v.role_id,
      resource_type: v.resource_type,
      // KAC item #5: для cluster — auto-fill cluster_kacho_root, если user не
      // ввёл (Input может быть disabled = preset на cluster).
      resource_id: v.resource_type === "cluster" ? v.resource_id || CLUSTER_RESOURCE_ID : v.resource_id,
    };
    try {
      await api.create(IAM.accessBindings, body);
      // Sync success или Operation envelope — invalidate всё и закрываем.
      void qc.invalidateQueries({ queryKey: ["iam", "access-bindings"] });
      void qc.invalidateQueries({ queryKey: ["cluster-admins"] });
      form.resetFields();
      setSubmitting(false);
      navigate("/iam/access-bindings");
    } catch (e) {
      setSubmitting(false);
      if (isAlreadyExistsError(e)) {
        // KAC item #3: верность verbatim текста ("these permissions are
        // already granted to <subject_id> on <resource_type>:<resource_id>").
        setInlineError({
          type: "warning",
          message: (e instanceof ApiError && e.message) || "These permissions are already granted",
        });
        return;
      }
      setInlineError({
        type: "error",
        message: mapApiErrorToMessage(e),
      });
    }
  };

  return (
    <FormShell specId="access-bindings" mode="create" singular="AccessBinding">
      {inlineError && (
        <Alert
          type={inlineError.type}
          showIcon
          style={{ marginBottom: 12 }}
          message={inlineError.message}
          closable
          onClose={() => setInlineError(null)}
          data-testid="access-bindings-create-error"
        />
      )}
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: "200px" }}
        wrapperCol={{ flex: "auto" }}
        labelAlign="left"
        colon={false}
        initialValues={{
          subject_type: preset?.subject_type ?? "user",
          resource_type: preset?.resource_type ?? "account",
          resource_id:
            preset?.resource_type === "cluster" ? (preset?.resource_id ?? CLUSTER_RESOURCE_ID) : preset?.resource_id,
          subject_id: preset?.subject_id,
          role_id: preset?.role_id,
        }}
        onFinish={onFinish}
      >
        <Form.Item label="Subject type" name="subject_type" required>
          <Select
            options={SUBJECT_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={(v) => {
              setSubjectType(v as SubjectType);
              form.setFieldValue("subject_id", undefined);
            }}
          />
        </Form.Item>
        <Form.Item label="Subject" name="subject_id" required rules={[{ required: true, message: "Выберите subject" }]}>
          <Select
            placeholder={`Выберите ${subjectType}`}
            options={subjectOptions}
            showSearch
            optionFilterProp="label"
            loading={users.isLoading || sas.isLoading || groups.isLoading}
          />
        </Form.Item>
        <Form.Item label="Role" name="role_id" required rules={[{ required: true, message: "Выберите role" }]}>
          <Select
            placeholder="Выберите Role"
            options={groupedRoleOptions(roles.data?.roles ?? [])}
            showSearch
            optionFilterProp="label"
            loading={roles.isLoading}
          />
        </Form.Item>
        <Form.Item label="Resource type" name="resource_type" required>
          <Select
            options={RESOURCE_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={(v) => {
              const rt = v as ResourceType;
              setResourceType(rt);
              // KAC item #5: cluster → auto-fill singleton id.
              if (rt === "cluster") {
                form.setFieldValue("resource_id", CLUSTER_RESOURCE_ID);
              } else if (form.getFieldValue("resource_id") === CLUSTER_RESOURCE_ID) {
                form.setFieldValue("resource_id", undefined);
              }
            }}
          />
        </Form.Item>
        <Form.Item
          label="Resource"
          name="resource_id"
          required
          rules={[{ required: true, message: "Введите resource_id" }]}
        >
          <Input
            style={{ fontFamily: "monospace" }}
            placeholder={resourceType === "cluster" ? CLUSTER_RESOURCE_ID : "acc-... / prj-... / любой идентификатор"}
            disabled={resourceType === "cluster"}
          />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0, marginLeft: 200 }}>
          {resourceType === "cluster" ? (
            <>
              Cluster admin grant: subject получит cluster-wide роль на singleton <code>{CLUSTER_RESOURCE_ID}</code>.
              Эквивалент legacy
              <code> POST /iam/v1/internal/cluster/admins</code> (KAC item #5).
            </>
          ) : (
            <>
              Подсказка: для resource_type=account → используйте id из вкладки Accounts; для project → из вкладки
              Projects.
            </>
          )}
        </Typography.Paragraph>
        <FormFooter
          submitLabel="Создать"
          submitting={submitting}
          onSubmit={() => form.submit()}
          onCancel={() => navigate("/iam/access-bindings")}
        />
      </Form>
    </FormShell>
  );
}
