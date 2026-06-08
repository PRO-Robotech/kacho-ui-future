import { useEffect, useState } from "react";
import type { Dispatch, FC, SetStateAction } from "react";
import { Dropdown, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { ChevronRight } from "lucide-react";
import { BreadcrumbPill } from "../../atoms";
import {
  getAccount,
  getProject,
  listAccounts,
  listProjects,
  setHostContext,
  type AccountRef,
  type HostContext,
  type ProjectRef,
} from "../../../utils";

export const HostBreadcrumb: FC<{
  context: HostContext;
  onChange: Dispatch<SetStateAction<HostContext>>;
  navigate?: (path: string) => void | Promise<void>;
}> = ({ context, onChange, navigate = (path) => window.history.pushState(null, "", path) }) => {
  const { token } = theme.useToken();
  const account = context.account;
  const project = context.project;
  const [accounts, setAccounts] = useState<AccountRef[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [projectsLoadedFor, setProjectsLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await listAccounts({ pageSize: "1000" });
        if (!cancelled) {
          setAccounts((r.accounts ?? []).map((item) => ({ id: item.id, name: item.name || item.id })));
        }
      } catch {
        if (!cancelled) setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!context.project?.id || context.project.name) return;
    const currentProject = context.project;
    const currentAccount = context.account;
    let cancelled = false;
    void (async () => {
      try {
        const p = await getProject(currentProject.id);
        if (cancelled) return;
        const accountId = p.account_id ?? p.accountId ?? currentProject.accountId;
        setHostContext(onChange, {
          account:
            currentAccount?.id === accountId ? currentAccount : { id: accountId, name: currentAccount?.name ?? "" },
          project: { id: p.id, name: p.name || p.id, accountId },
        });
      } catch {
        // Hydration is best-effort; dropdown lists will still populate names.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context.account, context.project, onChange]);

  useEffect(() => {
    if (!context.account?.id || context.account.name) return;
    const currentAccount = context.account;
    const currentProject = context.project;
    let cancelled = false;
    void (async () => {
      try {
        const a = await getAccount(currentAccount.id);
        if (cancelled) return;
        setHostContext(onChange, {
          account: { id: a.id, name: a.name || a.id },
          project: currentProject,
        });
      } catch {
        // Hydration is best-effort; account list load will still populate names.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context.account, context.project, onChange]);

  const loadProjects = (accountId: string) => {
    if (projectsLoadedFor === accountId) return;
    void (async () => {
      try {
        const r = await listProjects({ account_id: accountId, pageSize: "1000" });
        setProjects(
          (r.projects ?? []).map((item) => ({
            id: item.id,
            name: item.name || item.id,
            accountId: item.account_id ?? item.accountId ?? accountId,
          })),
        );
        setProjectsLoadedFor(accountId);
      } catch {
        setProjects([]);
        setProjectsLoadedFor(accountId);
      }
    })();
  };

  const accountMenu: MenuProps = {
    items: accounts.length
      ? accounts.map((item) => ({ key: item.id, label: item.name }))
      : [{ key: "__empty", label: "Аккаунтов нет", disabled: true }],
    selectedKeys: context.account ? [context.account.id] : [],
    onClick: ({ key }) => {
      const nextAccount = accounts.find((item) => item.id === key);
      if (nextAccount) setHostContext(onChange, { account: nextAccount, project: null });
    },
  };

  const projectMenu: MenuProps = {
    items: projects.length
      ? projects.map((item) => ({ key: item.id, label: item.name }))
      : [{ key: "__empty", label: account ? "Проектов нет" : "Выберите аккаунт", disabled: true }],
    selectedKeys: context.project ? [context.project.id] : [],
    onClick: ({ key }) => {
      const nextProject = projects.find((item) => item.id === key);
      if (nextProject && account) {
        setHostContext(onChange, { account, project: nextProject });
        void navigate(`/projects/${nextProject.id}/dashboard`);
      }
    },
  };

  const sep = <ChevronRight size={14} strokeWidth={2} className="breadcrumb-separator" aria-hidden />;

  return (
    <div className="context-breadcrumb" style={{ color: token.colorTextSecondary }}>
      <Dropdown menu={accountMenu} trigger={["click"]} placement="bottomLeft">
        <BreadcrumbPill token={token} active={!!account} placeholder="Выберите аккаунт" chevron>
          {account?.name || account?.id}
        </BreadcrumbPill>
      </Dropdown>
      {sep}
      <Dropdown
        menu={projectMenu}
        trigger={["click"]}
        placement="bottomLeft"
        disabled={!account}
        onOpenChange={(open) => {
          if (open && account) loadProjects(account.id);
        }}
      >
        <BreadcrumbPill token={token} active={!!project} placeholder="Проект" chevron>
          {project?.name || project?.id}
        </BreadcrumbPill>
      </Dropdown>
      {sep}
      <Typography.Text className="breadcrumb-current">Все сервисы</Typography.Text>
    </div>
  );
};
