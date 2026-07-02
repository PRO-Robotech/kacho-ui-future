import { useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { Card, Col, Empty, Input, Row, Space, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { ArrowRight, Boxes, FolderClosed, LockKeyhole, Search } from "lucide-react";
import { SERVICE_MODULES } from "../../lib/service-modules";
import type { ServiceModule } from "../../lib/service-modules";
import { useModuleCounts } from "../../hooks/use-module-counts";
import { apiList, loadHostContext } from "../../utils";
import type { AccountRef, HostContext, ProjectRef } from "../../utils";

export interface DashboardPageProps {
  context?: HostContext;
  navigate?: (path: string) => void | Promise<void>;
}

interface AccountTree {
  account: AccountRef;
  projects: ProjectRef[];
}

export const DashboardPage: FC<DashboardPageProps> = ({ context, navigate = defaultNavigate }) => {
  const ctx = context ?? loadHostContext();
  const projectId = ctx.project?.id ?? null;
  const accountId = ctx.account?.id ?? null;

  // Дерево «аккаунт → проекты»: аккаунты + проекты каждого (parallel). Выбор
  // проекта навигирует на /projects/:id/dashboard — host берёт контекст из URL.
  const [tree, setTree] = useState<AccountTree[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accResp = await apiList<{ accounts?: Array<{ id: string; name?: string }> }>("/iam/v1/accounts", {
          pageSize: "1000",
        });
        const accounts = (accResp.accounts ?? []).map((a) => ({ id: a.id, name: a.name || a.id }));
        const withProjects = await Promise.all(
          accounts.map(async (account) => {
            try {
              const pr = await apiList<{ projects?: Array<{ id: string; name?: string; accountId?: string }> }>(
                "/iam/v1/projects",
                { account_id: account.id, pageSize: "1000" },
              );
              const projects = (pr.projects ?? []).map((p) => ({
                id: p.id,
                name: p.name || p.id,
                accountId: p.accountId || account.id,
              }));
              return { account, projects };
            } catch {
              return { account, projects: [] as ProjectRef[] };
            }
          }),
        );
        if (cancelled) return;
        setTree(withProjects);
        // раскрыть аккаунт текущего проекта (или первый).
        setExpanded((cur) => (cur.length ? cur : [`acc:${accountId ?? withProjects[0]?.account.id ?? ""}`]));
      } catch {
        if (!cancelled) setTree([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = search.trim().toLowerCase();

  // treeData для AntD Tree + авто-раскрытие совпадений при поиске.
  const { treeData, searchExpanded } = useMemo(() => {
    const autoExpand: string[] = [];
    const data: DataNode[] = tree
      .map(({ account, projects }) => {
        const accMatch = !q || account.name.toLowerCase().includes(q);
        const shownProjects = projects.filter((p) => !q || accMatch || p.name.toLowerCase().includes(q));
        if (q && !accMatch && shownProjects.length === 0) return null;
        if (q && shownProjects.length > 0) autoExpand.push(`acc:${account.id}`);
        return {
          key: `acc:${account.id}`,
          selectable: false,
          title: <span className="dash-tree-acc">{highlight(account.name, q)}</span>,
          children: shownProjects.map((p) => ({
            key: `prj:${p.id}`,
            isLeaf: true,
            icon: <FolderClosed size={13} />,
            title: <span className="dash-tree-prj">{highlight(p.name, q)}</span>,
          })),
        } as DataNode;
      })
      .filter((n): n is DataNode => n !== null);
    return { treeData: data, searchExpanded: autoExpand };
  }, [tree, q]);

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
    : "Выберите проект в дереве слева, чтобы открыть VPC / Compute / NLB. IAM доступен всегда.";

  return (
    <section className="dashboard-console" data-testid="dashboard-page">
      <aside className="dashboard-nav">
        <Input
          allowClear
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск аккаунта или проекта"
          prefix={<Search size={13} style={{ opacity: 0.5 }} />}
          className="dash-tree-search"
        />
        {treeData.length === 0 ? (
          <div className="dash-nav-empty">{tree.length === 0 ? "Загрузка…" : "Ничего не найдено"}</div>
        ) : (
          <Tree
            showIcon
            blockNode
            className="dash-tree"
            treeData={treeData}
            selectedKeys={projectId ? [`prj:${projectId}`] : []}
            expandedKeys={q ? searchExpanded : expanded}
            onExpand={(keys) => setExpanded(keys as string[])}
            onSelect={(_keys, info) => {
              const key = String(info.node.key);
              if (key.startsWith("prj:")) void navigate(`/projects/${key.slice(4)}/dashboard`);
            }}
          />
        )}
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-heading">
          <Typography.Title level={3}>Сервисы облака</Typography.Title>
          <Typography.Text type="secondary">{caption}</Typography.Text>
        </div>

        {treeData.length === 0 && tree.length > 0 && q === "" ? (
          <Card>
            <Empty image={<Boxes size={40} color="#8b8f99" />} description="Нет доступных проектов" />
          </Card>
        ) : null}

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
                  <div className="dashboard-tile-stats">
                    {module.stats.map((stat) => (
                      <div key={stat.key} className="dashboard-metric">
                        <span className="dashboard-metric-value">{countsByModule[module.key]?.[stat.key] ?? "—"}</span>
                        <span className="dashboard-metric-label" title={stat.label}>
                          {stat.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </main>
    </section>
  );
};

// highlight — подсветка совпадения поиска в названии узла.
function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="dash-tree-mark">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function findModule(key: string): ServiceModule {
  const module = SERVICE_MODULES.find((item) => item.key === key);
  if (!module) throw new Error(`Missing service module: ${key}`);
  return module;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export default DashboardPage;
