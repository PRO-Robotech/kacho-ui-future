// SaKeysPanel — вкладка «Токены» сервисного аккаунта: список OAuth-ключей
// (SAKeyService.List) в форме стандартного ресурса + выпуск токена с TTL +
// одноразовый показ секрета + отзыв. Секрет (private_key_pem) приходит один раз
// в Operation.response — показываем его немедленно ВНУТРИ той же модалки
// (create-форма сменяется secret-view; копировать/скачать), после закрытия он
// безвозвратно теряется. Все мутации — async через Operation.
//
// CTA «Создать токен» вынесена из тела панели в шапку страницы (tokensTab
// headerAction в registerExtensions) через общий open-store — кнопка шапки и
// панель координируют состояние модалки без роутинга.

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

import { iamApi, saKeysPath } from "@shared/api/iam";
import type { IssueSAKeyBody, IssueSAKeyResponse, ServiceAccountOAuthClient } from "@shared/api/iam";
import type { Operation } from "@shared/api/types";
import { CopyableMonoId, fmtTs, useIamMutation } from "@shared/components/organisms/iam/IamCommon";
import { LabelsEditor, labelsFromEntries, type LabelEntry } from "@shared/components/organisms/LabelsEditor";
import { useTableScrollY } from "@/components/organisms/iam/IamListShell";
import { toast } from "@shared/lib/toast";
import { MAX_TTL_DAYS, TTL_PRESETS, expiryState, ttlDaysToSeconds } from "@shared/lib/tokens-util";
import { useOpenStore, type OpenStore } from "@/components/organisms/iam/TokenCreateStore";

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
// копировать/скачать). Рендерится ВНУТРИ create-модалки после Issue (не отдельная
// модалка) — держит private_key_pem в памяти до явного закрытия; фоновая ошибка
// (clipboard/скачивание) секрет не теряет.
function SecretBody({ resp }: { resp: IssueSAKeyResponse }) {
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
      a.download = `${keyId || clientId || "sa-key"}.pem`;
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

// CreateTokenModal — модалка выпуска токена. Поля: Имя (≤63) + Описание (≤256) +
// Метки (LabelsEditor) + Срок (пресеты либо «Свой срок» в днях). Клиентская
// валидация ДО submit; ошибка мутации НЕ закрывает модалку (toast от
// useIamMutation). На success — форма СМЕНЯЕТСЯ на secret-view в этой же модалке
// (секрет показывается один раз), модалка остаётся открытой до явного закрытия.
function CreateTokenModal({
  open,
  serviceAccountId,
  onClose,
}: {
  open: boolean;
  serviceAccountId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState<LabelEntry[]>([]);
  const [ttlKey, setTtlKey] = useState<string>("90d");
  const [customDays, setCustomDays] = useState<number | null>(90);
  const [secret, setSecret] = useState<IssueSAKeyResponse | null>(null);

  const resetForm = () => {
    setName("");
    setDescription("");
    setLabels([]);
    setTtlKey("90d");
    setCustomDays(90);
  };

  const issue = useIamMutation({
    method: "POST",
    path: saKeysPath(serviceAccountId),
    invalidateKeys: [["iam", "sa-keys", serviceAccountId]],
    onSuccess: (op: Operation) => {
      const resp = (op.response ?? undefined) as unknown as IssueSAKeyResponse | undefined;
      // Форма сменяется на secret-view — модалка НЕ закрывается.
      setSecret(resp ?? {});
    },
  });

  const handleClose = () => {
    if (issue.submitting) return; // не закрываем во время выпуска
    resetForm();
    setSecret(null);
    onClose();
  };

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
    const body: IssueSAKeyBody = {
      name: name.trim(),
      description: description.trim(),
      labels: labelsFromEntries(labels),
      ttl_seconds: ttlSeconds,
    };
    // Ошибка submit/операции не закрывает модалку — useIamMutation покажет toast.
    void issue.run(body).catch(() => undefined);
  };

  const segmentOptions = [
    ...TTL_PRESETS.map((p) => ({ label: p.label, value: p.key })),
    { label: "Свой срок", value: "custom" },
  ];

  return (
    <Modal
      title={secret ? "Токен создан" : "Создать токен"}
      open={open}
      onCancel={handleClose}
      maskClosable={false}
      width={secret ? 640 : undefined}
      okText="Создать"
      cancelText="Отмена"
      confirmLoading={issue.submitting}
      onOk={secret ? undefined : submit}
      footer={
        secret
          ? [
              <Button key="close" type="primary" onClick={handleClose}>
                Я сохранил ключ
              </Button>,
            ]
          : undefined
      }
      okButtonProps={{ disabled: customInvalid }}
    >
      {secret ? (
        <SecretBody resp={secret} />
      ) : (
        <Form layout="vertical">
          <Form.Item label="Имя" help="Не более 63 символов.">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={63} placeholder="Например: ci" />
          </Form.Item>
          <Form.Item label="Описание" help="Например: ключ для CI. Не более 256 символов.">
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
      )}
    </Modal>
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

// SaKeysPanel — таблица токенов (стандартная форма ресурса) + kebab-меню отзыва в
// строке + empty-state с CTA. Модалка создания управляется open-store (кнопка в
// шапке страницы, см. tokensTab). Список рефетчится после выпуска/отзыва.
export function SaKeysPanel({ serviceAccountId, openStore }: { serviceAccountId: string; openStore: OpenStore }) {
  const open = useOpenStore(openStore);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["iam", "sa-keys", serviceAccountId],
    queryFn: () => iamApi.listSaKeys(serviceAccountId, { page_size: "1000" }),
    enabled: !!serviceAccountId,
    staleTime: 0,
  });

  const revoke = useIamMutation({
    method: "DELETE",
    path: (body) => `${saKeysPath(serviceAccountId)}/${encodeURIComponent((body as { keyId: string }).keyId)}`,
    invalidateKeys: [["iam", "sa-keys", serviceAccountId]],
    successText: "Токен отозван",
  });

  useEffect(() => {
    if (!revoke.submitting) setRevokingId(null);
  }, [revoke.submitting]);

  const keys = list.data?.keys ?? [];
  const { wrapRef, scrollY } = useTableScrollY();

  // domEvent.stopPropagation обязателен на каждом menu-item: antd рендерит меню в
  // portal, но React-bubble идёт по virtual-tree → клик доходит до строки таблицы.
  const revokeToken = (row: ServiceAccountOAuthClient) => {
    Modal.confirm({
      title: "Отозвать токен?",
      content: "Токен перестанет действовать безвозвратно.",
      okText: "Отозвать",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: () => {
        setRevokingId(row.id);
        void revoke.run({ keyId: row.id }).catch(() => undefined);
      },
    });
  };

  const rowActions = (row: ServiceAccountOAuthClient) => {
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

  const columns: ColumnsType<ServiceAccountOAuthClient> = [
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

  const isEmpty = !list.isLoading && keys.length === 0;

  return (
    <div style={{ height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {isEmpty ? (
        <TokensEmptyState onCreate={() => openStore.set(true)} />
      ) : (
        <div ref={wrapRef} className="kc-table-fill" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <Table<ServiceAccountOAuthClient>
            rowKey="id"
            size="small"
            className="kc-table"
            loading={list.isLoading}
            dataSource={keys}
            columns={columns}
            pagination={false}
            scroll={{ x: "max-content", y: scrollY }}
            data-testid="sa-keys-table"
          />
        </div>
      )}

      <CreateTokenModal open={open} serviceAccountId={serviceAccountId} onClose={() => openStore.set(false)} />
    </div>
  );
}
