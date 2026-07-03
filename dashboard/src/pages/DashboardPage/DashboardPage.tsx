import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";
import { Card, Col, Empty, Input, Row, Space, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import {
  ArrowRight,
  Boxes,
  Building2,
  FolderClosed,
  FolderKanban,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { SERVICE_MODULES } from "../../lib/service-modules";
import type { ServiceModule } from "../../lib/service-modules";
import { IamResourceTable, type TableView } from "./IamResourceTable";
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

  // Дерево «аккаунт → проекты» c ленивой загрузкой: на старте грузятся ТОЛЬКО
  // аккаунты (быстрый первый рендер), проекты аккаунта — по раскрытию узла
  // (AntD loadData). Выбор проекта навигирует на /projects/:id/dashboard —
  // host берёт контекст из URL.
  const [accounts, setAccounts] = useState<AccountRef[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [projectsByAccount, setProjectsByAccount] = useState<Record<string, ProjectRef[]>>({});
  const loadedAccounts = useRef<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  // Поиск по сервисам (плашки «Ресурсы») — фильтр по названию/короткому имени.
  const [serviceQuery, setServiceQuery] = useState("");
  // Активный вид main-области: "services" — плашки сервисов, остальные —
  // таблицы account-scoped IAM-ресурсов (аккаунты/проекты/привязки/операции),
  // логика как у дочерних таблиц в зоне-3 деталей.
  const [view, setView] = useState<"services" | TableView>("accounts");

  // loadProjects — догружает проекты одного аккаунта (идемпотентно: повторно не
  // ходит). Вызывается из loadData (раскрытие) и при поиске (догрузка всех).
  const loadProjects = useCallback(async (accId: string) => {
    if (loadedAccounts.current.has(accId)) return;
    loadedAccounts.current.add(accId);
    try {
      const pr = await apiList<{ projects?: Array<{ id: string; name?: string; accountId?: string }> }>(
        "/iam/v1/projects",
        { account_id: accId, pageSize: "1000" },
      );
      const projects = (pr.projects ?? []).map((p) => ({
        id: p.id,
        name: p.name || p.id,
        accountId: p.accountId || accId,
      }));
      setProjectsByAccount((cur) => ({ ...cur, [accId]: projects }));
    } catch {
      setProjectsByAccount((cur) => ({ ...cur, [accId]: [] }));
    }
  }, []);

  // Старт — только список аккаунтов; проекты текущего аккаунта подгружаем сразу
  // (чтобы выбранный проект был виден в раскрытом узле).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accResp = await apiList<{ accounts?: Array<{ id: string; name?: string }> }>("/iam/v1/accounts", {
          pageSize: "1000",
        });
        const accs = (accResp.accounts ?? []).map((a) => ({ id: a.id, name: a.name || a.id }));
        if (cancelled) return;
        setAccounts(accs);
        setAccountsLoaded(true);
        const cur = accountId ?? accs[0]?.id ?? "";
        if (cur) {
          setExpanded((prev) => (prev.length ? prev : [`acc:${cur}`]));
          void loadProjects(cur);
        }
      } catch {
        if (!cancelled) {
          setAccounts([]);
          setAccountsLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = search.trim().toLowerCase();

  // Поиск требует проектов всех аккаунтов — догружаем их один раз, когда
  // пользователь начал искать (стартовую загрузку это не замедляет).
  useEffect(() => {
    if (!q) return;
    accounts.forEach((a) => void loadProjects(a.id));
  }, [q, accounts, loadProjects]);

  // loadData — коллбэк AntD Tree: при раскрытии узла аккаунта тянет его проекты.
  const onLoadData = useCallback(
    async (node: DataNode) => {
      const key = String(node.key);
      if (key.startsWith("acc:")) await loadProjects(key.slice(4));
    },
    [loadProjects],
  );

  // treeData для AntD Tree + авто-раскрытие совпадений при поиске. Узел аккаунта
  // без загруженных проектов оставляет children undefined (ленивый — стрелка +
  // loadData); загруженный — рендерит проекты (отфильтрованные поиском).
  const { treeData, searchExpanded } = useMemo(() => {
    const autoExpand: string[] = [];
    const data: DataNode[] = accounts
      .map((account) => {
        const accMatch = !q || account.name.toLowerCase().includes(q);
        const projects = projectsByAccount[account.id];
        const loaded = projects !== undefined;
        let children: DataNode[] | undefined;
        if (loaded) {
          const shown = projects.filter((p) => !q || accMatch || p.name.toLowerCase().includes(q));
          children = shown.map((p) => ({
            key: `prj:${p.id}`,
            isLeaf: true,
            icon: <FolderClosed size={13} />,
            title: <span className="dash-tree-prj">{highlight(p.name, q)}</span>,
          }));
          if (q && shown.length > 0) autoExpand.push(`acc:${account.id}`);
        }
        // При поиске убираем аккаунт, если ни имя, ни его (загруженные) проекты
        // не совпали.
        if (q && !accMatch && loaded && (children?.length ?? 0) === 0) return null;
        return {
          key: `acc:${account.id}`,
          selectable: false,
          isLeaf: false,
          title: <span className="dash-tree-acc">{highlight(account.name, q)}</span>,
          children,
        } as DataNode;
      })
      .filter((n): n is DataNode => n !== null);
    return { treeData: data, searchExpanded: autoExpand };
  }, [accounts, projectsByAccount, q]);

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

  // Селектор вида main-области: «Сервисы» (плашки VPC/Compute/NLB/IAM) + таблицы
  // account-scoped IAM-ресурсов. Клик переключает содержимое справа (не уводит со
  // страницы) — логика как у табов зоны-3 деталей, только селектор — эти кнопки.
  const viewTabs: { key: "services" | TableView; label: string; icon: ReactNode }[] = [
    { key: "services", label: "Сервисы", icon: <Boxes size={16} /> },
    { key: "accounts", label: "Аккаунты", icon: <Building2 size={16} /> },
    { key: "projects", label: "Проекты", icon: <FolderKanban size={16} /> },
    { key: "access-bindings", label: "Права доступа", icon: <ShieldCheck size={16} /> },
    { key: "operations", label: "Операции", icon: <History size={16} /> },
  ];

  // Фильтр плашек по поиску сервисов (название или короткое имя).
  const sq = serviceQuery.trim().toLowerCase();
  const shownModules = SERVICE_MODULES.filter(
    (m) => !sq || m.label.toLowerCase().includes(sq) || (m.short ?? "").toLowerCase().includes(sq),
  );

  return (
    <section className="dashboard-console" data-testid="dashboard-page">
      {/* Верхняя панель (шапка): слева — поиск по дереву аккаунтов/проектов,
          справа — пилюли выбранного контекста (аккаунт / проект). */}
      <div className="dashboard-topbar">
        <div className="dashboard-topbar-nav">
          <Input
            allowClear
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск аккаунта или проекта"
            prefix={<Search size={13} style={{ opacity: 0.5 }} />}
            className="dash-tree-search"
          />
        </div>
        <div className="dashboard-topbar-context">
          {ctx.account ? (
            <span className="dashboard-ctx-pill" title="Выбранный аккаунт">
              <Building2 size={13} />
              {ctx.account.name || ctx.account.id}
            </span>
          ) : null}
          {ctx.project ? (
            <span className="dashboard-ctx-pill" title="Выбранный проект">
              <FolderClosed size={13} />
              {ctx.project.name || ctx.project.id}
            </span>
          ) : null}
        </div>
      </div>

      <div className="dashboard-body">
        <aside className="dashboard-nav">
          {treeData.length === 0 ? (
            <div className="dash-nav-empty">{!accountsLoaded ? "Загрузка…" : "Ничего не найдено"}</div>
          ) : (
          <Tree
            showIcon
            blockNode
            className="dash-tree"
            treeData={treeData}
            loadData={onLoadData}
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
          <Typography.Title level={3}>Дашборд Kachō</Typography.Title>
          <Typography.Text type="secondary">{caption}</Typography.Text>
        </div>

        {/* Селектор вида: «Сервисы» (плашки) + таблицы IAM-ресурсов. Клик
            переключает контент справа, не уводя со страницы. */}
        <div className="dashboard-quicknav">
          {viewTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={view === t.key ? "dashboard-quick-btn dashboard-quick-btn-active" : "dashboard-quick-btn"}
              onClick={() => setView(t.key)}
              data-testid={`dashboard-view-${t.key}`}
            >
              <span className="dashboard-quick-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {view !== "services" ? (
          <IamResourceTable view={view} accountId={accountId} navigate={navigate} />
        ) : (
          <>
            {/* Поиск по сервисам — фильтрует плашки ресурсов ниже. */}
            <Input
              allowClear
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
              placeholder="Поиск сервисов"
              prefix={<Search size={15} style={{ opacity: 0.5 }} />}
              className="dashboard-service-search"
            />

            <div className="dashboard-section-head">
              <Typography.Title level={4} style={{ margin: 0 }}>
                Ресурсы
              </Typography.Title>
            </div>

            {treeData.length === 0 && accountsLoaded && accounts.length > 0 && q === "" ? (
              <Card>
                <Empty image={<Boxes size={40} color="#8b8f99" />} description="Нет доступных проектов" />
              </Card>
            ) : null}

            <Row gutter={[16, 16]}>
          {shownModules.map((module) => {
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
          </>
        )}
        </main>
      </div>
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
