export type RemoteIconName =
  | "activity"
  | "cable"
  | "camera"
  | "cloud"
  | "folder"
  | "git-branch"
  | "globe"
  | "hard-drive"
  | "key"
  | "layers"
  | "lock"
  | "network"
  | "route"
  | "scale"
  | "server"
  | "shield"
  | "users";

export interface RemoteNavItem {
  key: string;
  icon: RemoteIconName;
  label: string;
  path: string;
  requiresProject?: boolean;
}

export interface RemoteNavSection {
  key: string;
  segment: string;
  icon: RemoteIconName;
  label: string;
  landingPath: string;
  requiresProject?: boolean;
  items: RemoteNavItem[];
}

export const DASHBOARD_NAVIGATION: RemoteNavSection[] = [
  {
    key: "vpc",
    segment: "vpc",
    icon: "network",
    label: "Virtual Private Cloud",
    landingPath: "vpc/networks",
    requiresProject: true,
    items: [
      { key: "vpc-networks", icon: "network", label: "Облачные сети", path: "vpc/networks", requiresProject: true },
      { key: "vpc-subnets", icon: "git-branch", label: "Подсети", path: "vpc/subnets", requiresProject: true },
      { key: "vpc-addresses", icon: "globe", label: "IP-адреса", path: "vpc/addresses", requiresProject: true },
      { key: "vpc-route-tables", icon: "route", label: "Таблицы маршрутов", path: "vpc/route-tables", requiresProject: true },
      { key: "vpc-security-groups", icon: "shield", label: "Группы безопасности", path: "vpc/security-groups", requiresProject: true },
      { key: "vpc-network-interfaces", icon: "cable", label: "Сетевые интерфейсы", path: "vpc/network-interfaces", requiresProject: true },
      { key: "vpc-gateways", icon: "layers", label: "Шлюзы", path: "vpc/gateways", requiresProject: true },
      { key: "vpc-operations", icon: "activity", label: "Операции", path: "vpc/operations", requiresProject: true },
    ],
  },
  {
    key: "compute",
    segment: "compute",
    icon: "cloud",
    label: "Compute Cloud",
    landingPath: "compute/instances",
    requiresProject: true,
    items: [
      { key: "compute-instances", icon: "server", label: "Виртуальные машины", path: "compute/instances", requiresProject: true },
      { key: "compute-disks", icon: "hard-drive", label: "Диски", path: "compute/disks", requiresProject: true },
      { key: "compute-images", icon: "folder", label: "Образы", path: "compute/images", requiresProject: true },
      { key: "compute-snapshots", icon: "camera", label: "Снимки дисков", path: "compute/snapshots", requiresProject: true },
    ],
  },
  {
    key: "nlb",
    segment: "nlb",
    icon: "scale",
    label: "Network Load Balancer",
    landingPath: "nlb/load-balancers",
    requiresProject: true,
    items: [
      { key: "nlb-load-balancers", icon: "network", label: "Балансировщики", path: "nlb/load-balancers", requiresProject: true },
      { key: "nlb-listeners", icon: "cable", label: "Listeners", path: "nlb/listeners", requiresProject: true },
      { key: "nlb-target-groups", icon: "git-branch", label: "Target Groups", path: "nlb/target-groups", requiresProject: true },
      { key: "nlb-operations", icon: "activity", label: "Операции", path: "nlb/operations", requiresProject: true },
    ],
  },
  {
    key: "iam",
    segment: "iam",
    icon: "key",
    label: "Identity and Access Management",
    landingPath: "/iam/accounts",
    items: [
      { key: "iam-accounts", icon: "layers", label: "Аккаунты", path: "/iam/accounts" },
      { key: "iam-projects", icon: "folder", label: "Проекты", path: "/iam/projects" },
      { key: "iam-users", icon: "users", label: "Пользователи", path: "/iam/users" },
      { key: "iam-service-accounts", icon: "key", label: "Сервисные аккаунты", path: "/iam/service-accounts" },
      { key: "iam-groups", icon: "git-branch", label: "Группы", path: "/iam/groups" },
      { key: "iam-roles", icon: "lock", label: "Роли", path: "/iam/roles" },
      { key: "iam-access-bindings", icon: "shield", label: "Связки прав", path: "/iam/access-bindings" },
    ],
  },
];
