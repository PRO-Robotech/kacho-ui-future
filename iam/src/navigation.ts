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

export const IAM_NAVIGATION: RemoteNavSection[] = [
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
      { key: "iam-access", icon: "users", label: "Права доступа", path: "/iam/access" },
    ],
  },
  // Stage 3 — System / Administration (admin-only, kacho-only global-ресурсы).
  // Обслуживаются iam-remote под /iam/system/* (см. IamPage SystemRoutes).
  {
    key: "system",
    segment: "system",
    icon: "globe",
    label: "Администрирование",
    landingPath: "/iam/system/regions",
    items: [
      { key: "system-regions", icon: "globe", label: "Регионы", path: "/iam/system/regions" },
      { key: "system-zones", icon: "route", label: "Зоны", path: "/iam/system/zones" },
      { key: "system-address-pools", icon: "network", label: "Пулы адресов", path: "/iam/system/address-pools" },
      { key: "system-cluster-admins", icon: "shield", label: "Cluster admins", path: "/iam/system/cluster/admins" },
    ],
  },
  // Stage 4 — Tokens & keys (выпуск OAuth-креденшалов). Под /iam/tokens/*.
  {
    key: "tokens",
    segment: "tokens",
    icon: "key",
    label: "Токены и ключи",
    landingPath: "/iam/tokens/service-account-keys",
    items: [
      {
        key: "tokens-sa-keys",
        icon: "key",
        label: "Ключи сервисных аккаунтов",
        path: "/iam/tokens/service-account-keys",
      },
      { key: "tokens-user-tokens", icon: "lock", label: "Токены пользователей", path: "/iam/tokens/user-tokens" },
    ],
  },
];

export const DASHBOARD_NAVIGATION = IAM_NAVIGATION;
export default IAM_NAVIGATION;
