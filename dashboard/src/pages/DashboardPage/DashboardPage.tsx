import type { FC } from "react";
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Tooltip, Typography } from "antd";
import { ArrowRight, Boxes, FolderOpen, LockKeyhole } from "lucide-react";
import { SERVICE_MODULES } from "../../lib/service-modules";
import type { ServiceModule } from "../../lib/service-modules";
import { useModuleCounts } from "../../hooks/use-module-counts";
import { loadHostContext } from "../../utils";
import type { HostContext } from "../../utils";

export interface DashboardPageProps {
  context?: HostContext;
  navigate?: (path: string) => void | Promise<void>;
}

export const DashboardPage: FC<DashboardPageProps> = ({ context, navigate = defaultNavigate }) => {
  const ctx = context ?? loadHostContext();
  const projectId = ctx.project?.id ?? null;
  const accountId = ctx.account?.id ?? null;

  const vpcModule = findModule("vpc");
  const computeModule = findModule("compute");
  const nlbModule = findModule("nlb");
  const iamModule = findModule("iam");

  const vpcCounts = useModuleCounts(vpcModule, projectId);
  const computeCounts = useModuleCounts(computeModule, projectId);
  const nlbCounts = useModuleCounts(nlbModule, projectId);
  const iamCounts = useModuleCounts(iamModule, accountId ?? "all", "");

  const countsByModule = {
    [vpcModule.key]: vpcCounts,
    [computeModule.key]: computeCounts,
    [nlbModule.key]: nlbCounts,
    [iamModule.key]: iamCounts,
  };

  const tileDisabled = (module: ServiceModule) => module.landing(projectId, accountId) == null;
  const openModule = (module: ServiceModule) => {
    const target = module.landing(projectId, accountId);
    if (target == null) {
      return;
    }
    void navigate(target);
  };

  const caption = getCaption(ctx);
  const allEmpty =
    ctx.project != null &&
    SERVICE_MODULES.filter((module) => module.key !== "iam").every((module) =>
      module.stats.every((stat) => (countsByModule[module.key]?.[stat.key] ?? null) === 0),
    );

  return (
    <section className="dashboard-workbench" data-testid="dashboard-page">
      <Space orientation="vertical" size={20} className="dashboard-stack">
        <div className="dashboard-heading">
          <Typography.Title level={3}>Сервисы облака</Typography.Title>
          <Typography.Text type="secondary">{caption}</Typography.Text>
        </div>

        {!ctx.account && (
          <Alert
            type="info"
            showIcon
            title="Выберите Account и Project в шапке для просмотра VPC и Compute ресурсов. IAM доступен всегда."
            action={
              <Button
                size="small"
                icon={<ArrowRight size={14} />}
                onClick={() => navigate("/iam/accounts")}
                data-testid="dashboard-go-iam"
              >
                Перейти в IAM
              </Button>
            }
          />
        )}

        <Row gutter={[16, 16]}>
          {SERVICE_MODULES.map((module) => {
            const disabled = tileDisabled(module);
            const card = (
              <Card
                hoverable={!disabled}
                data-testid={`dashboard-tile-${module.key}`}
                data-disabled={disabled ? "true" : "false"}
                onClick={() => openModule(module)}
                styles={{ body: { padding: 16 } }}
                className={disabled ? "dashboard-tile dashboard-tile-disabled" : "dashboard-tile"}
                title={
                  <Space>
                    <span className="dashboard-tile-icon" style={{ color: module.color }}>
                      {module.icon}
                    </span>
                    <span>{module.label}</span>
                  </Space>
                }
                extra={disabled ? <LockKeyhole size={16} /> : <ArrowRight size={16} />}
              >
                <Typography.Paragraph type="secondary" className="dashboard-description">
                  {module.description}
                </Typography.Paragraph>
                {disabled && (
                  <Typography.Text type="warning" className="dashboard-warning">
                    Выберите проект в шапке, чтобы открыть ресурсы.
                  </Typography.Text>
                )}
                <Row gutter={16}>
                  {module.stats.map((stat) => (
                    <Col key={stat.key} span={Math.floor(24 / module.stats.length)}>
                      <Statistic
                        title={stat.label}
                        value={countsByModule[module.key]?.[stat.key] ?? "-"}
                        styles={{ content: { fontSize: 22 } }}
                      />
                    </Col>
                  ))}
                </Row>
              </Card>
            );

            return (
              <Col key={module.key} xs={24} sm={24} md={12} lg={12}>
                {disabled ? <Tooltip title="Выберите проект в селекторе в шапке">{card}</Tooltip> : card}
              </Col>
            );
          })}
        </Row>

        {allEmpty && (
          <Card>
            <Empty
              image={<FolderOpen size={40} color="#8b8f99" />}
              imageStyle={{ height: 56 }}
              description={
                <Space orientation="vertical" size={6}>
                  <Typography.Text strong>В каталоге нет ресурсов</Typography.Text>
                  <Typography.Text type="secondary" className="dashboard-empty-copy">
                    Выберите сервис на плашке выше, чтобы создать первый ресурс.
                  </Typography.Text>
                </Space>
              }
            >
              <Button type="primary" icon={<Boxes size={14} />} onClick={() => openModule(SERVICE_MODULES[0])}>
                Перейти в {SERVICE_MODULES[0].short}
              </Button>
            </Empty>
          </Card>
        )}
      </Space>
    </section>
  );
};

function findModule(key: string): ServiceModule {
  const module = SERVICE_MODULES.find((item) => item.key === key);
  if (!module) {
    throw new Error(`Missing service module: ${key}`);
  }
  return module;
}

function getCaption(ctx: HostContext): string {
  if (ctx.project) {
    return `Проект: ${ctx.project.name || ctx.project.id}`;
  }
  if (ctx.account) {
    return `Аккаунт: ${ctx.account.name || ctx.account.id} - выберите проект чтобы перейти к ресурсам.`;
  }
  return "Контекст не выбран - выберите Account и Project в шапке. IAM-блок доступен всегда.";
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export default DashboardPage;
