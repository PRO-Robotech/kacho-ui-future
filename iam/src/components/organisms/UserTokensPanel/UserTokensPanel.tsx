// UserTokensPanel — вкладка «Токены» пользователя: список OAuth-токенов
// (UserTokenService.List) в форме стандартного ресурса + выпуск токена с TTL +
// одноразовый показ секрета + отзыв. Зеркалит SaKeysPanel.
//
// Создание — НЕ модалка, а ФОРМА в зоне-3 detail-страницы (как inline-create
// смежных ресурсов IAM): CTA «Создать токен» в шапке навигирует на
// `${detailBase}/tokens/create`, ResourceShell разворачивает UserTokenCreateForm
// через childCreate. После успешного Issue форма кладёт секрет (private_key_pem
// приходит один раз в Operation.response) в secret-store и навигирует обратно на
// таблицу; сам секрет показывается ОДИН раз after-create МОДАЛКОЙ (копировать/
// скачать), после закрытия он безвозвратно теряется. Ошибка мутации НЕ навигирует —
// только toast. Все мутации — async через Operation.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Descriptions,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import { CopyOutlined, DownloadOutlined, KeyOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";

import { iamApi, userTokensPath } from "@shared/api/iam";
import type { IssueUserTokenBody, IssueUserTokenResponse, UserOAuthClient } from "@shared/api/iam";
import type { Operation } from "@shared/api/types";
import { CopyableMonoId, fmtTs, useIamMutation } from "@shared/components/organisms/iam/IamCommon";
import { LabelsEditor, labelsFromEntries, type LabelEntry } from "@shared/components/organisms/LabelsEditor";
import { FormShell } from "@shared/components/organisms/form/FormShell";
import { FormFooter } from "@shared/components/organisms/form/FormFooter";
import { useTableScrollY } from "@/components/organisms/iam/IamListShell";
import { toast } from "@shared/lib/toast";
import { MAX_TTL_DAYS, TTL_PRESETS, expiryState, ttlDaysToSeconds } from "@shared/lib/tokens-util";
import { useSecretStore, type SecretStore, type TokenSecret } from "@/components/organisms/iam/TokenCreateStore";

// Бейдж срока действия токена: «Бессрочный» / «Истек» / «истекает через X».
function ExpiryBadge({ expiresAt }: { expiresAt?: string }) {
  const st = expiryState(expiresAt);
  const color = st.kind === "expired" ? "red" : st.kind === "none" ? "default" : "green";
  return (
    <Tag color={color} style={{ margin: 0 }}>
      {st.label}
    </Tag>
  );
}

// SecretBody — одноразовый показ секрета выпущенного токена (client_id + PEM,
// копировать/скачать). Рендерится внутри after-create модалки на таблице
// (UserTokensPanel) — держит private_key_pem в памяти до явного закрытия; фоновая
// ошибка (clipboard/скачивание) секрет не теряет.
function SecretBody({ resp }: { resp: IssueUserTokenResponse }) {
  const pem = resp.private_key_pem ?? "";
  const keyId = resp.key_id ?? resp.key?.id ?? "";
  const clientId = resp.client_id ?? "";

  const copyPem = async () => {
    try {
      await navigator.clipboard.writeText(pem);
      toast.success("Приватный ключ скопирован");
    } catch {
      toast.error("Не удалось скопировать. Скопируйте вручную из поля ниже.");
    }
  };

  const downloadPem = () => {
    try {
      const blob = new Blob([pem], { type: "application/x-pem-file" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${keyId || clientId || "user-token"}.pem`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Файл ключа сохранен");
    } catch {
      toast.error("Не удалось скачать файл. Скопируйте ключ вручную.");
    }
  };

  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Сохраните ключ — он больше не будет показан"
        description="Приватный ключ выдается один раз и нигде не хранится. После закрытия окна восстановить его будет невозможно — потребуется выпустить новый токен."
      />
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Идентификатор ключа">
          <CopyableMonoId id={keyId} />
        </Descriptions.Item>
        <Descriptions.Item label="Client ID">
          <CopyableMonoId id={clientId} />
        </Descriptions.Item>
        <Descriptions.Item label="Алгоритм">{resp.algorithm || "ES256"}</Descriptions.Item>
      </Descriptions>
      <Typography.Text strong style={{ display: "block", marginBottom: 6 }}>
        Приватный ключ (PEM)
      </Typography.Text>
      <Input.TextArea
        readOnly
        value={pem}
        autoSize={{ minRows: 6, maxRows: 14 }}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
      />
      <Space style={{ marginTop: 12 }}>
        <Button icon={<CopyOutlined />} onClick={copyPem}>
          Скопировать
        </Button>
        <Button icon={<DownloadOutlined />} onClick={downloadPem}>
          Скачать
        </Button>
      </Space>
    </>
  );
}

// TokenSecretModal — after-create модалка одноразового показа секрета. Рендерится
// на таблице (UserTokensPanel), управляется secret-store: форма зоны-3 кладёт туда
// секрет после Issue → модалка открывается. Закрытие очищает store (секрет теряется).
function TokenSecretModal({ store }: { store: SecretStore }) {
  const secret = useSecretStore(store);
  return (
    <Modal
      title="Токен создан"
      open={!!secret}
      onCancel={() => store.set(null)}
      maskClosable={false}
      width={640}
      footer={[
        <Button key="close" type="primary" onClick={() => store.set(null)}>
          Я сохранил ключ
        </Button>,
      ]}
    >
      {secret ? <SecretBody resp={secret as unknown as IssueUserTokenResponse} /> : null}
    </Modal>
  );
}

// UserTokenCreateForm — ФОРМА выпуска токена в зоне-3 detail-страницы пользователя
// (childCreate). Поля: Имя (≤63) + Описание (≤256) + Метки (LabelsEditor) + Срок
// (пресеты либо «Свой срок» в днях). Клиентская валидация ДО submit; ошибка мутации
// НЕ навигирует (toast от useIamMutation) — форма остаётся открытой. На success
// кладёт секрет в secret-store (для after-create модалки на таблице) и навигирует
// обратно на таблицу. Зеркалит SaKeyCreateForm.
export function UserTokenCreateForm({
  userId,
  secretStore,
  onSuccess,
  onCancel,
}: {
  userId: string;
  secretStore: SecretStore;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState<LabelEntry[]>([]);
  const [ttlKey, setTtlKey] = useState<string>("90d");
  const [customDays, setCustomDays] = useState<number | null>(90);

  const issue = useIamMutation({
    method: "POST",
    path: userTokensPath(userId),
    invalidateKeys: [["iam", "user-tokens", userId]],
    onSuccess: (op: Operation) => {
      const resp = (op.response ?? undefined) as unknown as IssueUserTokenResponse | undefined;
      // Секрет → secret-store: after-create модалка на таблице покажет его один раз.
      secretStore.set((resp ?? {}) as TokenSecret);
      onSuccess();
    },
  });

  const customInvalid = ttlKey === "custom" && (customDays == null || customDays < 1 || customDays > MAX_TTL_DAYS);

  const submit = () => {
    if (name.length > 63) {
      toast.error("Имя не длиннее 63 символов");
      return;
    }
    if (description.length > 256) {
      toast.error("Описание не длиннее 256 символов");
      return;
    }
    if (customInvalid) {
      toast.error(`Срок в днях — от 1 до ${MAX_TTL_DAYS}`);
      return;
    }
    const ttlSeconds =
      ttlKey === "custom"
        ? ttlDaysToSeconds(customDays ?? 0)
        : (TTL_PRESETS.find((p) => p.key === ttlKey)?.seconds ?? 0);
    const body: IssueUserTokenBody = {
      name: name.trim(),
      description: description.trim(),
      labels: labelsFromEntries(labels),
      ttl_seconds: ttlSeconds,
    };
    // Ошибка submit/операции НЕ навигирует — useIamMutation покажет toast, форма
    // остаётся открытой (onSuccess зовётся только на done && !error).
    void issue.run(body).catch(() => undefined);
  };

  const segmentOptions = [
    ...TTL_PRESETS.map((p) => ({ label: p.label, value: p.key })),
    { label: "Свой срок", value: "custom" },
  ];

  return (
    <FormShell specId="users" mode="create" singular="Токен">
      <Form layout="vertical">
        <Form.Item label="Имя" help="Не более 63 символов.">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={63} placeholder="Например: ci" />
        </Form.Item>
        <Form.Item label="Описание" help="Например: токен для CI. Не более 256 символов.">
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={256}
            showCount
            autoSize={{ minRows: 1, maxRows: 3 }}
            placeholder="Назначение токена"
          />
        </Form.Item>
        <Form.Item label="Метки">
          <LabelsEditor value={labels} onChange={setLabels} />
        </Form.Item>
        <Form.Item label="Срок действия">
          <Segmented value={ttlKey} onChange={(v) => setTtlKey(String(v))} options={segmentOptions} />
        </Form.Item>
        {ttlKey === "custom" && (
          <Form.Item
            label="Срок в днях"
            validateStatus={customInvalid ? "error" : undefined}
            help={customInvalid ? `От 1 до ${MAX_TTL_DAYS} дней` : `Максимум ${MAX_TTL_DAYS} дней (~2 года)`}
          >
            <InputNumber
              value={customDays ?? undefined}
              onChange={(v) => setCustomDays(typeof v === "number" ? v : null)}
              min={1}
              max={MAX_TTL_DAYS}
              style={{ width: 160 }}
            />
          </Form.Item>
        )}
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
          «Без срока» — токен действует бессрочно. Секрет будет показан один раз после создания.
        </Typography.Paragraph>
      </Form>
      <FormFooter
        submitLabel="Создать токен"
        submitting={issue.submitting}
        submitDisabled={customInvalid}
        onSubmit={submit}
        onCancel={onCancel}
      />
    </FormShell>
  );
}

// TokensEmptyState — welcome для пустой таблицы токенов (в стиле ResourceEmptyState:
// иконка + заголовок + CTA), т.к. у токенов нет ResourceSpec.
function TokensEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        maxWidth: 600,
        margin: "0 auto",
        minHeight: "calc(100vh - 320px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 44,
          color: "#3D8DF5",
          background: "linear-gradient(135deg, rgba(61,141,245,0.16), rgba(61,141,245,0.04))",
          border: "1px solid var(--ant-color-border-secondary, #2f3138)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        }}
      >
        <KeyOutlined />
      </div>
      <Typography.Title level={4} style={{ margin: "0 0 10px", fontWeight: 600 }}>
        Создайте свой первый токен
      </Typography.Title>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        Создать токен
      </Button>
    </div>
  );
}

// UserTokensPanel — таблица токенов (стандартная форма ресурса) + kebab-меню отзыва
// в строке + empty-state с CTA. Создание — форма в зоне-3 (childCreate): CTA
// открывает её через onCreate (навигация на `${detailBase}/tokens/create`).
// After-create секрет показывается модалкой TokenSecretModal (secret-store). Список
// рефетчится после выпуска/отзыва.
export function UserTokensPanel({
  userId,
  secretStore,
  onCreate,
}: {
  userId: string;
  secretStore: SecretStore;
  onCreate: () => void;
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["iam", "user-tokens", userId],
    queryFn: () => iamApi.listUserTokens(userId, { page_size: "1000" }),
    enabled: !!userId,
    staleTime: 0,
  });

  const revoke = useIamMutation({
    method: "DELETE",
    path: (body) => `${userTokensPath(userId)}/${encodeURIComponent((body as { tokenId: string }).tokenId)}`,
    invalidateKeys: [["iam", "user-tokens", userId]],
    successText: "Токен отозван",
  });

  useEffect(() => {
    if (!revoke.submitting) setRevokingId(null);
  }, [revoke.submitting]);

  const tokens = list.data?.tokens ?? [];
  const { wrapRef, scrollY } = useTableScrollY();

  // domEvent.stopPropagation обязателен на каждом menu-item: antd рендерит меню в
  // portal, но React-bubble идёт по virtual-tree → клик доходит до строки таблицы.
  const revokeToken = (row: UserOAuthClient) => {
    Modal.confirm({
      title: "Отозвать токен?",
      content: "Токен перестанет действовать безвозвратно.",
      okText: "Отозвать",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: () => {
        setRevokingId(row.id);
        void revoke.run({ tokenId: row.id }).catch(() => undefined);
      },
    });
  };

  const rowActions = (row: UserOAuthClient) => {
    const items: MenuProps["items"] = [
      {
        key: "revoke",
        label: "Отозвать",
        danger: true,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          revokeToken(row);
        },
      },
    ];
    return (
      <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
        <Button
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label="Действия"
          loading={revoke.submitting && revokingId === row.id}
          onClick={(e) => e.stopPropagation()}
        />
      </Dropdown>
    );
  };

  const columns: ColumnsType<UserOAuthClient> = [
    {
      title: "Имя",
      key: "name",
      render: (_v, row) =>
        row.name || row.description || <Typography.Text type="secondary">—</Typography.Text>,
    },
    { title: "Идентификатор", dataIndex: "id", key: "id", render: (v: string) => <CopyableMonoId id={v} /> },
    {
      title: "Описание",
      dataIndex: "description",
      key: "description",
      render: (v?: string) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    { title: "Дата создания", dataIndex: "created_at", key: "created_at", width: 200, render: (v?: string) => fmtTs(v) },
    {
      title: "Последнее использование",
      dataIndex: "last_used_at",
      key: "last_used_at",
      width: 210,
      render: (v?: string) => fmtTs(v),
    },
    {
      title: "Истекает",
      dataIndex: "expires_at",
      key: "expires_at",
      width: 190,
      render: (v?: string) => <ExpiryBadge expiresAt={v} />,
    },
    {
      title: "",
      key: "actions",
      width: 56,
      render: (_v, row) => rowActions(row),
    },
  ];

  const isEmpty = !list.isLoading && tokens.length === 0;

  return (
    <div style={{ height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {isEmpty ? (
        <TokensEmptyState onCreate={onCreate} />
      ) : (
        <div ref={wrapRef} className="kc-table-fill" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <Table<UserOAuthClient>
            rowKey="id"
            size="small"
            className="kc-table"
            loading={list.isLoading}
            dataSource={tokens}
            columns={columns}
            pagination={false}
            scroll={{ x: "max-content", y: scrollY }}
            data-testid="user-tokens-table"
          />
        </div>
      )}

      <TokenSecretModal store={secretStore} />
    </div>
  );
}
