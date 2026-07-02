// RolesPage — список Role.
// - System roles (is_system=true) read-only;
// - custom roles (account_id !== "") — editable: name/description/permissions.
//
// Permissions editor — JSON-paste textarea с regex-validation
// `<module>.<resource>.<verb>` (E0 acceptance §2.3).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Form, Input, Popconfirm, Space, Table, Tabs, Tag, Typography, Alert } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/api/client";
import { iamApi, IAM, type Role } from "@/api/iam";
import { useIamMutation, fmtTs, CopyableMonoId, SystemTag } from "@/components/organisms/iam/IamCommon";
import { FormFooter } from "@/components/organisms/form/FormFooter";
import { FormShell } from "@/components/organisms/form/FormShell";
import { useBreadcrumb, useHeaderRight } from "@/components/molecules/PageHeaderSlot";
import { IamListShell, useTableScrollY } from "@/components/organisms/iam/IamListShell";
import { useContext } from "@/lib/context-store";

// Regex per E0 acceptance §2.3 — permission string format
// kacho.<module>.<resource>.<verb> (allowing * wildcards in 3rd and 4th part).
// Доп. tolerated: модуль может быть просто `<module>` без префикса `kacho.`
// (как в seed-roles в БД: "compute.instances.*" вместо "kacho.compute.instances.*").
const PERM_RE = /^[a-z_]+(\.[a-z_*]+){2}$/;

export function RolesPage() {
  const navigate = useNavigate();
  // KAC-127: разделение system / custom ролей табами.
  const [roleKind, setRoleKind] = useState<"system" | "custom">("system");
  const headerAction = useMemo(
    () => (
      <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/iam/roles/create")}>
        Создать пользовательскую роль
      </Button>
    ),
    [navigate],
  );
  useHeaderRight(headerAction);

  const { data, isLoading } = useQuery({
    queryKey: ["iam", "roles", "list"],
    queryFn: () => iamApi.listRoles({ pageSize: "1000" }),
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);
  const systemRoles = useMemo(() => roles.filter((r) => r.is_system), [roles]);
  const customRoles = useMemo(() => roles.filter((r) => !r.is_system), [roles]);
  const visibleRoles = roleKind === "system" ? systemRoles : customRoles;
  const { wrapRef, scrollY } = useTableScrollY();

  const del = useIamMutation({
    method: "DELETE",
    path: (b) => `${IAM.roles}/${b as string}`,
    invalidateKeys: [["iam", "roles", "list"]],
    successText: "Role удалена",
  });

  const columns: ColumnsType<Role> = [
    {
      title: "Имя",
      dataIndex: "name",
      key: "name",
      render: (v) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: "Тип",
      key: "system",
      width: 110,
      render: (_v, row) => <SystemTag isSystem={row.is_system} />,
    },
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 220,
      render: (v) => <CopyableMonoId id={v} />,
    },
    {
      title: "Аккаунт",
      dataIndex: "account_id",
      key: "account",
      width: 200,
      render: (v) => (v ? <CopyableMonoId id={v} /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      title: "Описание",
      dataIndex: "description",
      key: "description",
      render: (v) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "Разрешения",
      dataIndex: "permissions",
      key: "perms",
      render: (v: string[] | undefined) => (
        <Space size={4} wrap>
          {(v ?? []).slice(0, 4).map((p) => (
            <Tag key={p} style={{ fontFamily: "monospace", fontSize: 11 }}>
              {p}
            </Tag>
          ))}
          {(v?.length ?? 0) > 4 && <Typography.Text type="secondary">+{(v?.length ?? 0) - 4} more</Typography.Text>}
        </Space>
      ),
    },
    {
      title: "Создано",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (v) => fmtTs(v),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_v, row) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            disabled={row.is_system}
            title={row.is_system ? "system roles read-only" : "Изменить"}
            onClick={() => navigate(`/iam/roles/${row.id}/edit`)}
          />
          <Popconfirm
            title="Удалить Role?"
            description={`Удалить «${row.name}»? Custom role с активными AccessBinding → FailedPrecondition.`}
            okText="Удалить"
            okButtonProps={{ danger: true }}
            cancelText="Отмена"
            onConfirm={() => void del.run(row.id)}
            disabled={row.is_system}
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={row.is_system}
              title={row.is_system ? "system roles read-only" : "Удалить"}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <IamListShell specId="roles" title="Roles" count={roles.length}>
      <Tabs
        activeKey={roleKind}
        onChange={(k) => setRoleKind(k as "system" | "custom")}
        size="middle"
        items={[
          { key: "system", label: `Системные (${systemRoles.length})` },
          { key: "custom", label: `Кастомные (${customRoles.length})` },
        ]}
        style={{ marginBottom: 12, flexShrink: 0 }}
      />

      <div ref={wrapRef} className="kc-table-fill" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Table<Role>
          rowKey="id"
          size="small"
          className="kc-table"
          loading={isLoading}
          dataSource={visibleRoles}
          columns={columns}
          pagination={false}
          scroll={{ x: "max-content", y: scrollY }}
          locale={{
            emptyText: roleKind === "system" ? "Системных ролей нет." : "Кастомных ролей нет.",
          }}
        />
      </div>
    </IamListShell>
  );
}

function PermissionsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lines = useMemo(
    () =>
      value
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [value],
  );

  const invalid = useMemo(() => lines.filter((l) => !PERM_RE.test(l)), [lines]);

  return (
    <div>
      <Input.TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder={"compute.instances.*\nvpc.networks.read\niam.access_bindings.list"}
        style={{ fontFamily: "monospace", fontSize: 12 }}
      />
      <div style={{ fontSize: 12, marginTop: 6, color: "rgba(255,255,255,0.45)" }}>
        Один permission на строку. Формат: <code>module.resource.verb</code> (e.g. <code>compute.instances.*</code>).
      </div>
      {invalid.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message={`Невалидных строк: ${invalid.length}`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "monospace", fontSize: 12 }}>
              {invalid.slice(0, 5).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          }
        />
      )}
      {lines.length > 0 && invalid.length === 0 && (
        <div style={{ fontSize: 12, marginTop: 6, color: "#52c41a" }}>{lines.length} permissions OK</div>
      )}
    </div>
  );
}

export function RoleCreatePage() {
  const navigate = useNavigate();
  const account = useContext((s) => s.account);
  const [form] = Form.useForm();
  const [perms, setPerms] = useState("");
  useHeaderRight(useMemo(() => null, []));
  useBreadcrumb(
    useMemo(
      () => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Typography.Text type="secondary">IAM</Typography.Text>
          <Typography.Text type="secondary">/</Typography.Text>
          <Link to="/iam/roles">
            <Typography.Text type="secondary">Roles</Typography.Text>
          </Link>
          <Typography.Text type="secondary">/</Typography.Text>
          <Typography.Text strong>Создать</Typography.Text>
        </span>
      ),
      [],
    ),
  );
  const mut = useIamMutation({
    method: "POST",
    path: IAM.roles,
    invalidateKeys: [["iam", "roles", "list"]],
    successText: "Role создана",
    onSuccess: () => {
      form.resetFields();
      setPerms("");
      navigate("/iam/roles");
    },
  });

  return (
    <FormShell specId="roles" mode="create" singular="Role" title="Пользовательская роль">
      {!account && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Выберите Account"
          description="Чтобы создать пользовательскую роль, сначала выберите Account в шапке."
        />
      )}
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: "200px" }}
        wrapperCol={{ flex: "auto" }}
        labelAlign="left"
        colon={false}
        onFinish={(v) => {
          const perm_list = perms
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const invalid = perm_list.filter((p) => !PERM_RE.test(p));
          if (invalid.length > 0) {
            return;
          }
          if (perm_list.length === 0) {
            return;
          }
          const body: Record<string, unknown> = {
            account_id: account?.id,
            name: v.name,
            permissions: perm_list,
          };
          if (v.description) body.description = v.description;
          void mut.run(body);
        }}
      >
        <Form.Item label="Account">
          <Typography.Text>
            {account?.name || account?.id || "—"}
            {account?.id && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {" "}
                · {account.id}
              </Typography.Text>
            )}
          </Typography.Text>
        </Form.Item>
        <Form.Item
          label="Имя"
          name="name"
          required
          rules={[
            {
              required: true,
              // Backend: custom-role name ^[a-z][a-z0-9_]{0,40}$ — БЕЗ дефиса
              // (дефис только в system-ролях roles/<mod>.<name>). UI-regex
              // обязан совпадать, иначе backend отвергает с INVALID_ARGUMENT.
              pattern: /^[a-z][a-z0-9_]{0,40}$/,
              message: "строчные латинские буквы, цифры, подчёркивания; начинается с буквы; до 41 символа",
            },
          ]}
        >
          <Input placeholder="my_role" />
        </Form.Item>
        <Form.Item label="Описание" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Permissions" required>
          <PermissionsEditor value={perms} onChange={setPerms} />
        </Form.Item>
        <FormFooter
          submitLabel="Создать"
          submitting={mut.submitting}
          submitDisabled={!account}
          onSubmit={() => form.submit()}
          onCancel={() => navigate("/iam/roles")}
        />
      </Form>
    </FormShell>
  );
}

export function RoleEditPage() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [perms, setPerms] = useState("");
  const { data: role } = useQuery({
    queryKey: ["iam", "roles", "detail", uid],
    queryFn: () => api.get<Role>(`${IAM.roles}/${uid}`),
    enabled: !!uid,
  });
  useHeaderRight(useMemo(() => null, []));
  useBreadcrumb(
    useMemo(
      () => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Typography.Text type="secondary">IAM</Typography.Text>
          <Typography.Text type="secondary">/</Typography.Text>
          <Link to="/iam/roles">
            <Typography.Text type="secondary">Roles</Typography.Text>
          </Link>
          <Typography.Text type="secondary">/</Typography.Text>
          <Typography.Text strong>Редактирование</Typography.Text>
        </span>
      ),
      [],
    ),
  );

  // Sync perms из role при открытии
  useEffect(() => {
    if (role) {
      setPerms((role.permissions ?? []).join("\n"));
      form.setFieldsValue({
        name: role.name,
        description: role.description ?? "",
      });
    }
  }, [role, form]);

  const mut = useIamMutation({
    method: "PATCH",
    path: () => `${IAM.roles}/${uid}`,
    invalidateKeys: [["iam", "roles", "list"]],
    successText: "Role обновлена",
    onSuccess: () => navigate("/iam/roles"),
  });

  return (
    <FormShell specId="roles" mode="edit" singular="Role">
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: "200px" }}
        wrapperCol={{ flex: "auto" }}
        labelAlign="left"
        colon={false}
        onFinish={(v) => {
          const update_mask: string[] = [];
          const body: Record<string, unknown> = {};
          if ((v.name ?? "") !== (role?.name ?? "")) {
            update_mask.push("name");
            body.name = v.name;
          }
          if ((v.description ?? "") !== (role?.description ?? "")) {
            update_mask.push("description");
            body.description = v.description;
          }
          const perm_list = perms
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const invalid = perm_list.filter((p) => !PERM_RE.test(p));
          const origPerms = role?.permissions ?? [];
          const permsChanged = perm_list.length !== origPerms.length || perm_list.some((p, i) => p !== origPerms[i]);
          if (permsChanged) {
            if (invalid.length > 0) return;
            update_mask.push("permissions");
            body.permissions = perm_list;
          }
          if (update_mask.length === 0) {
            navigate("/iam/roles");
            return;
          }
          body.update_mask = update_mask.join(",");
          void mut.run(body);
        }}
      >
        <Form.Item label="Имя" name="name">
          <Input />
        </Form.Item>
        <Form.Item label="Описание" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Permissions">
          <PermissionsEditor value={perms} onChange={setPerms} />
        </Form.Item>
        <FormFooter
          submitLabel="Сохранить"
          submitting={mut.submitting}
          onSubmit={() => form.submit()}
          onCancel={() => navigate("/iam/roles")}
        />
      </Form>
    </FormShell>
  );
}
