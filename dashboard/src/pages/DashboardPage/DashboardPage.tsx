import { useEffect, useState, type FC } from "react";
import { Card, Col, Row, Space, Statistic, Typography } from "antd";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { SERVICE_MODULES } from "../../lib/service-modules";
import type { ServiceModule } from "../../lib/service-modules";
import { useModuleCounts } from "../../hooks/use-module-counts";
import { apiList, loadHostContext } from "../../utils";
import type { AccountRef, HostContext, ProjectRef } from "../../utils";

export interface DashboardPageProps {
  context?: HostContext;
  navigate?: (path: string) => void | Promise<void>;
}

export const DashboardPage: FC<DashboardPageProps> = ({ context, navigate = defaultNavigate }) => {
  const ctx = context ?? loadHostContext();
  const projectId = ctx.project?.id ?? null;
  const accountId = ctx.account?.id ?? null;

  // Левая панель: список аккаунтов + проекты выбранного аккаунта. Выбор проекта
  // навигирует на /projects/:id/dashboard — host подхватывает контекст из URL.
  const [accounts, setAccounts] = useState<AccountRef[]>([]);
  const [selAccountId, setSelAccountId] = useState<string | null>(accountId);
  const [projects, setProjects] = useState<ProjectRef[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiList<{ accounts?: Array<{ id: string; name?: string }> }>("/iam/v1/accounts", { pageSize: "1000" })
      .then((r) => {
        if (cancelled) return;
        const list = (r.accounts ?? []).map((a) => ({ id: a.id, name: a.name || a.id }));
        setAccounts(list);
        setSelAccountId((cur) => cur ?? accountId ?? list[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selAccountId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    apiList<{ projects?: Array<{ id: string; name?: string; accountId?: string }> }>("/iam/v1/projects", {
      account_id: selAccountId,
      pageSize: "1000",
    })
      .then((r) => {
        if (cancelled) return;
        setProjects((r.projects ?? []).map((p) => ({ id: p.id, name: p.name || p.id, accountId: p.accountId || selAccountId })));
      })
      .catch(() => setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [selAccountId]);

  const vpcCounts = useModuleCounts(findModule("vpc"), projectId);
  const computeCounts = useModuleCounts(findModule("compute"), projectId);
  const nlbCounts = useModuleCounts(findModule("nlb"), projectId);
  const iamCounts = useModuleCounts(findModule("iam"), accountId ?? "all", "");
  const countsByModule: Record<string, Record<string, number | null>> = {
    vpc: vpcCounts,
    compute: computeCounts,
    nlb: nlbCounts,
    iam: iamCounts,
  };

  const tileDisabled = (module: ServiceModule) => module.landing(projectId, accountId) == null;
  const openModule = (module: ServiceModule) => {
    const target = module.landing(projectId, accountId);
    if (target != null) void navigate(target);
  };

  const caption = ctx.project
    ? `Проект: ${ctx.project.name || ctx.project.id}`
    : "Выберите проект в панели слева, чтобы открыть VPC / Compute / NLB. IAM доступен всегда.";

  return (
    <section className="dashboard-console" data-testid="dashboard-page">
      <aside className="dashboard-nav">
        <NavGroup title="Аккаунты">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`dash-nav-item${a.id === selAccountId ? " is-active" : ""}`}
              onClick={() => setSelAccountId(a.id)}
              title={a.name}
            >
              {a.name}
            </button>
          ))}
        </NavGroup>

        <NavGroup title="Проекты">
          {projects.length === 0 && <div className="dash-nav-empty">Проектов нет</div>}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`dash-nav-item${p.id === projectId ? " is-active" : ""}`}
              onClick={() => navigate(`/projects/${p.id}/dashboard`)}
              title={p.name}
            >
              {p.name}
            </button>
          ))}
        </NavGroup>
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-heading">
          <Typography.Title level={3}>Сервисы облака</Typography.Title>
          <Typography.Text type="secondary">{caption}</Typography.Text>
        </div>

        <Row gutter={[16, 16]}>
          {SERVICE_MODULES.map((module) => {
            const disabled = tileDisabled(module);
            return (
              <Col key={module.key} xs={24} sm={24} md={12} lg={12} style={{ display: "flex" }}>
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
                  <Row gutter={16} className="dashboard-tile-stats">
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
              </Col>
            );
          })}
        </Row>
      </main>
    </section>
  );
};

const NavGroup: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="dash-nav-group">
    <div className="dash-nav-title">{title}</div>
    <div className="dash-nav-list">{children}</div>
  </div>
);

function findModule(key: string): ServiceModule {
  const module = SERVICE_MODULES.find((item) => item.key === key);
  if (!module) throw new Error(`Missing service module: ${key}`);
  return module;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export default DashboardPage;
