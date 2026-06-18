// InstanceDetailPage — generic ResourceDetailPage для compute Instance плюс
// secondary-actions "Подключить диск" / "Отключить диск" (verbs :attachDisk /
// :detachDisk) и встроенные Start/Stop/Restart (ops в registry).
//
// Старт/Стоп/Перезапуск рендерятся самим ResourceDetailPage (spec.ops.start/stop/restart
// → POST <apiPath>/{id}:start|:stop|:restart). Здесь добавляем attach/detach над
// tab content через secondaryActions.
//
// TODO(KAC-14/KAC-9): когда Instance.network_interfaces[] начнут нести `nic_id`
// (ссылка на отдельный vpc NetworkInterface — отдельный тикет KAC-9), сделать
// рендеринг NIC-блока с ссылкой на /projects/<projectId>/vpc/network-interfaces/<nic_id>
// (registry spec "network-interfaces"). Пока в proto/data этого поля нет — блок не
// рендерим (generic ResourceDetailPage показывает network_interfaces как есть).

import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button, Modal, Space, Typography, Tag } from "antd";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { ResourceDetailPage } from "@/components/organisms/ResourceDetailPage";
import { OperationDialog, extractOperationId } from "@/components/molecules/OperationDialog";
import { RefSelect } from "@/components/organisms/form/RefSelect";
import { api, ApiError } from "@/api/client";
import { REGISTRY, getByPath } from "@/lib/resource-registry";
import { useProjectStore } from "@/lib/context-store";
import { useInvalidateResourceList } from "@/lib/use-operation";
import { toast } from "@/lib/toast";

const SPEC = REGISTRY["compute-instances"];

export function InstanceDetailPage() {
  const { uid: instanceId } = useParams();
  const project = useProjectStore((s) => s.project);
  const invalidate = useInvalidateResourceList();

  const [attachOpen, setAttachOpen] = useState(false);
  const [detachOpen, setDetachOpen] = useState(false);
  const [attachDiskId, setAttachDiskId] = useState<string | undefined>();
  const [autoDelete, setAutoDelete] = useState(false);
  const [detachDiskId, setDetachDiskId] = useState<string | undefined>();
  const [opId, setOpId] = useState<string | null>(null);
  const [opTitle, setOpTitle] = useState("Операция");

  const onOpDone = useCallback(() => {
    setOpId(null);
    invalidate("compute-instances", project?.id);
    invalidate("compute-disks", project?.id);
  }, [invalidate, project?.id]);

  const attachMut = useMutation({
    mutationFn: () =>
      api.action(`${SPEC.apiPath}/${instanceId}:attachDisk`, {
        attached_disk_spec: { disk_id: attachDiskId, auto_delete: autoDelete },
      }),
    onSuccess: (resp) => {
      setAttachOpen(false);
      const id = extractOperationId(resp);
      if (id) {
        setOpTitle("Подключение диска");
        setOpId(id);
      } else {
        invalidate("compute-instances", project?.id);
        invalidate("compute-disks", project?.id);
      }
    },
    onError: (e) =>
      toast.error(`Подключить диск: ${e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message}`),
  });

  const detachMut = useMutation({
    mutationFn: () => api.action(`${SPEC.apiPath}/${instanceId}:detachDisk`, { disk_id: detachDiskId }),
    onSuccess: (resp) => {
      setDetachOpen(false);
      const id = extractOperationId(resp);
      if (id) {
        setOpTitle("Отключение диска");
        setOpId(id);
      } else {
        invalidate("compute-instances", project?.id);
        invalidate("compute-disks", project?.id);
      }
    },
    onError: (e) =>
      toast.error(`Отключить диск: ${e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message}`),
  });

  const secondaryActions = useMemo(
    () => (data: Record<string, unknown>) => {
      const bootDiskId = (getByPath<Record<string, unknown>>(data, "boot_disk")?.disk_id as string | undefined) ?? "";
      const secondary = getByPath<Array<Record<string, unknown>>>(data, "secondary_disks") ?? [];
      const secondaryIds = secondary.map((d) => d.disk_id as string).filter(Boolean);
      return (
        <Space size={8} wrap>
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setAttachDiskId(undefined);
              setAutoDelete(false);
              setAttachOpen(true);
            }}
          >
            Подключить диск
          </Button>
          <Button
            icon={<MinusOutlined />}
            disabled={secondaryIds.length === 0}
            onClick={() => {
              setDetachDiskId(secondaryIds[0]);
              setDetachOpen(true);
            }}
          >
            Отключить диск
          </Button>
          {bootDiskId && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Загрузочный диск: <Tag>{bootDiskId}</Tag>
            </Typography.Text>
          )}
        </Space>
      );
    },
    [],
  );

  return (
    <>
      <ResourceDetailPage spec={SPEC} secondaryActions={secondaryActions} />

      <Modal
        title="Подключить диск к ВМ"
        open={attachOpen}
        onCancel={() => setAttachOpen(false)}
        onOk={() => attachMut.mutate()}
        okButtonProps={{ disabled: !attachDiskId, loading: attachMut.isPending }}
        okText="Подключить"
        cancelText="Отмена"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <Typography.Text>Диск</Typography.Text>
            <RefSelect
              refResource="compute-disks"
              refProjectScoped
              value={attachDiskId}
              onChange={(v) => setAttachDiskId(v || undefined)}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={autoDelete} onChange={(e) => setAutoDelete(e.target.checked)} />
            Удалять диск вместе с ВМ (auto_delete)
          </label>
        </div>
      </Modal>

      <Modal
        title="Отключить диск от ВМ"
        open={detachOpen}
        onCancel={() => setDetachOpen(false)}
        onOk={() => detachMut.mutate()}
        okButtonProps={{ disabled: !detachDiskId, loading: detachMut.isPending, danger: true }}
        okText="Отключить"
        cancelText="Отмена"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Загрузочный диск отключить нельзя. Введите ID одного из дополнительных дисков.
          </Typography.Text>
          <div>
            <Typography.Text>ID диска</Typography.Text>
            <input
              value={detachDiskId ?? ""}
              onChange={(e) => setDetachDiskId(e.target.value || undefined)}
              placeholder="epd..."
              style={{
                width: "100%",
                padding: "6px 8px",
                fontFamily: "ui-monospace, monospace",
                fontSize: 13,
                background: "transparent",
                border: "1px solid var(--ant-color-border, #383941)",
                borderRadius: 6,
                color: "inherit",
              }}
            />
          </div>
        </div>
      </Modal>

      <OperationDialog opId={opId} title={opTitle} onSuccess={onOpDone} onClose={onOpDone} />
    </>
  );
}
