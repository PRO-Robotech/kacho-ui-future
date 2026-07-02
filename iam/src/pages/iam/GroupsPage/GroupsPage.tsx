// GroupsPage — список Group per Account + Create + Edit + Delete +
// inline Members-panel (раскрывается через expandedRowRender → table)
// со списком member'ов (User/SA) + Add/Remove.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Form, Input, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/api/client";
import { iamApi, IAM, type Group, type GroupMember, type User, type ServiceAccount } from "@/api/iam";
import { useIamMutation, fmtTs, CopyableMonoId } from "@/components/organisms/iam/IamCommon";
import { FormFooter } from "@/components/organisms/form/FormFooter";
import { FormShell } from "@/components/organisms/form/FormShell";
import { useBreadcrumb, useHeaderRight } from "@/components/molecules/PageHeaderSlot";
import { IamListShell, useTableScrollY } from "@/components/organisms/iam/IamListShell";
import { useContext } from "@/lib/context-store";

export function GroupsPage() {
  const account = useContext((s) => s.account);
  const accountId = account?.id ?? null;
  const navigate = useNavigate();
  const headerAction = useMemo(
    () => (
      <Button
        type="primary"
        icon={<PlusOutlined />}
        disabled={!accountId}
        onClick={() => navigate("/iam/groups/create")}
      >
        Создать Group
      </Button>
    ),
    [accountId, navigate],
  );
  useHeaderRight(headerAction);

  const list = useQuery({
    queryKey: ["iam", "groups", "list", accountId],
    queryFn: () => iamApi.listGroups({ account_id: accountId!, pageSize: "200" }),
    enabled: !!accountId,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const del = useIamMutation({
    method: "DELETE",
    path: (b) => `${IAM.groups}/${b as string}`,
    invalidateKeys: [["iam", "groups", "list"]],
    successText: "Group удалён",
  });

  const groups = list.data?.groups ?? [];
  const { wrapRef, scrollY } = useTableScrollY();

  const columns: ColumnsType<Group> = [
    {
      title: "Имя",
      dataIndex: "name",
      key: "name",
      render: (v) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      render: (v) => <CopyableMonoId id={v} />,
    },
    {
      title: "Описание",
      dataIndex: "description",
      key: "description",
      render: (v) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "Создан",
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
            onClick={() => navigate(`/iam/groups/${row.id}/edit`)}
          />
          <Popconfirm
            title="Удалить Group?"
            description={`Удалить «${row.name}»?`}
            okText="Удалить"
            okButtonProps={{ danger: true }}
            cancelText="Отмена"
            onConfirm={() => void del.run(row.id)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <IamListShell specId="groups" title="Группы" count={groups.length}>
      {!accountId ? (
        <Typography.Text type="secondary">Выберите Account, чтобы увидеть его Groups.</Typography.Text>
      ) : (
        <div ref={wrapRef} className="kc-table-fill" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <Table<Group>
            rowKey="id"
            size="small"
            className="kc-table"
            loading={list.isLoading}
            dataSource={groups}
            columns={columns}
            pagination={false}
            scroll={{ x: "max-content", y: scrollY }}
            expandable={{
              expandedRowRender: (row) => <GroupMembersPanel group={row} accountId={accountId} />,
            }}
            locale={{ emptyText: "Group'ов нет. Создайте первую." }}
          />
        </div>
      )}
    </IamListShell>
  );
}

export function GroupCreatePage() {
  const account = useContext((s) => s.account);
  const accountId = account?.id ?? null;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  useHeaderRight(useMemo(() => null, []));
  useBreadcrumb(
    useMemo(
      () => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Typography.Text type="secondary">IAM</Typography.Text>
          <Typography.Text type="secondary">/</Typography.Text>
          <Link to="/iam/groups">
            <Typography.Text type="secondary">Groups</Typography.Text>
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
    path: IAM.groups,
    invalidateKeys: [["iam", "groups", "list"]],
    successText: "Group создана",
    onSuccess: () => {
      form.resetFields();
      navigate("/iam/groups");
    },
  });

  return (
    <FormShell specId="groups" mode="create" singular="Group">
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: "200px" }}
        wrapperCol={{ flex: "auto" }}
        labelAlign="left"
        colon={false}
        onFinish={(v) => {
          if (!accountId) return;
          const body: Record<string, unknown> = {
            account_id: accountId,
            name: v.name,
          };
          if (v.description) body.description = v.description;
          void mut.run(body);
        }}
      >
        <Form.Item label="Account">
          <Typography.Text code>{accountId ?? "—"}</Typography.Text>
        </Form.Item>
        <Form.Item
          label="Имя"
          name="name"
          required
          rules={[
            {
              required: true,
              pattern: /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/,
              message: "lowercase, цифры, дефисы; 3-63 символа",
            },
          ]}
        >
          <Input placeholder="developers" />
        </Form.Item>
        <Form.Item label="Описание" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <FormFooter
          submitLabel="Создать"
          submitting={mut.submitting}
          submitDisabled={!accountId}
          onSubmit={() => form.submit()}
          onCancel={() => navigate("/iam/groups")}
        />
      </Form>
    </FormShell>
  );
}

export function GroupEditPage() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { data: group } = useQuery({
    queryKey: ["iam", "groups", "detail", uid],
    queryFn: () => api.get<Group>(`${IAM.groups}/${uid}`),
    enabled: !!uid,
  });
  useEffect(() => {
    if (!group) return;
    form.setFieldsValue({ name: group.name ?? "", description: group.description ?? "" });
  }, [form, group]);
  useHeaderRight(useMemo(() => null, []));
  useBreadcrumb(
    useMemo(
      () => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Typography.Text type="secondary">IAM</Typography.Text>
          <Typography.Text type="secondary">/</Typography.Text>
          <Link to="/iam/groups">
            <Typography.Text type="secondary">Groups</Typography.Text>
          </Link>
          <Typography.Text type="secondary">/</Typography.Text>
          <Typography.Text strong>Редактирование</Typography.Text>
        </span>
      ),
      [],
    ),
  );
  const mut = useIamMutation({
    method: "PATCH",
    path: () => `${IAM.groups}/${uid}`,
    invalidateKeys: [["iam", "groups", "list"]],
    successText: "Group обновлена",
    onSuccess: () => navigate("/iam/groups"),
  });

  return (
    <FormShell specId="groups" mode="edit" singular="Group">
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: "200px" }}
        wrapperCol={{ flex: "auto" }}
        labelAlign="left"
        colon={false}
        initialValues={{
          name: group?.name ?? "",
          description: group?.description ?? "",
        }}
        onFinish={(v) => {
          const update_mask: string[] = [];
          const body: Record<string, unknown> = {};
          if ((v.name ?? "") !== (group?.name ?? "")) {
            update_mask.push("name");
            body.name = v.name;
          }
          if ((v.description ?? "") !== (group?.description ?? "")) {
            update_mask.push("description");
            body.description = v.description;
          }
          if (update_mask.length === 0) {
            navigate("/iam/groups");
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
        <FormFooter
          submitLabel="Сохранить"
          submitting={mut.submitting}
          onSubmit={() => form.submit()}
          onCancel={() => navigate("/iam/groups")}
        />
      </Form>
    </FormShell>
  );
}

function GroupMembersPanel({ group, accountId }: { group: Group; accountId: string | null }) {
  const members = useQuery({
    queryKey: ["iam", "groups", group.id, "members"],
    queryFn: () => iamApi.listGroupMembers(group.id, { pageSize: "200" }),
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const users = useQuery({
    queryKey: ["iam", "users", "list"],
    queryFn: () => iamApi.listUsers({ pageSize: "1000" }),
    staleTime: 30_000,
  });

  const sas = useQuery({
    queryKey: ["iam", "service-accounts", "list", accountId],
    queryFn: () => iamApi.listServiceAccounts({ account_id: accountId!, pageSize: "1000" }),
    enabled: !!accountId,
    staleTime: 30_000,
  });

  const addMut = useIamMutation({
    method: "ACTION",
    path: `${IAM.groups}/${group.id}:addMember`,
    invalidateKeys: [["iam", "groups", group.id, "members"]],
    successText: "Member добавлен",
  });

  const removeMut = useIamMutation({
    method: "ACTION",
    path: `${IAM.groups}/${group.id}:removeMember`,
    invalidateKeys: [["iam", "groups", group.id, "members"]],
    successText: "Member удалён",
  });

  const [pickerType, setPickerType] = useState<"user" | "service_account">("user");
  const [pickerValue, setPickerValue] = useState<string | null>(null);

  const memberList = members.data?.members ?? [];

  const columns: ColumnsType<GroupMember> = [
    {
      title: "Тип",
      dataIndex: "member_type",
      key: "type",
      width: 130,
      render: (v) => <Tag color={v === "user" ? "blue" : "gold"}>{v}</Tag>,
    },
    {
      title: "ID",
      dataIndex: "member_id",
      key: "id",
      render: (v) => <CopyableMonoId id={v} />,
    },
    {
      title: "Добавлен",
      dataIndex: "added_at",
      key: "added_at",
      width: 180,
      render: (v) => fmtTs(v),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_v, row) => (
        <Popconfirm
          title="Удалить member?"
          okText="Удалить"
          okButtonProps={{ danger: true }}
          cancelText="Отмена"
          onConfirm={() =>
            void removeMut.run({
              member_type: row.member_type,
              member_id: row.member_id,
            })
          }
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={8} style={{ width: "100%", padding: 8 }}>
      <Typography.Text strong>Members группы {group.name}</Typography.Text>

      <Space size={8} wrap>
        <Select
          value={pickerType}
          style={{ width: 200 }}
          onChange={(v) => {
            setPickerType(v);
            setPickerValue(null);
          }}
          options={[
            { value: "user", label: "User" },
            { value: "service_account", label: "Service Account" },
          ]}
        />
        <Select
          style={{ width: 360 }}
          value={pickerValue ?? undefined}
          onChange={(v) => setPickerValue(v)}
          placeholder={`Выберите ${pickerType}`}
          options={
            pickerType === "user"
              ? (users.data?.users ?? []).map((u: User) => ({
                  value: u.id,
                  label: `${u.email || u.display_name || u.id} · ${u.id}`,
                }))
              : (sas.data?.service_accounts ?? []).map((sa: ServiceAccount) => ({
                  value: sa.id,
                  label: `${sa.name} · ${sa.id}`,
                }))
          }
          showSearch
          optionFilterProp="label"
        />
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          disabled={!pickerValue}
          onClick={() => {
            if (!pickerValue) return;
            void addMut.run({
              member_type: pickerType,
              member_id: pickerValue,
            });
            setPickerValue(null);
          }}
        >
          Добавить
        </Button>
      </Space>

      <Table<GroupMember>
        rowKey={(r) => `${r.member_type}:${r.member_id}`}
        size="small"
        loading={members.isLoading}
        dataSource={memberList}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "Members нет." }}
      />
    </Space>
  );
}
