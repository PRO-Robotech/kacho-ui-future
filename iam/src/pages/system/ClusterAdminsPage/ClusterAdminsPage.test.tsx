import { render, screen } from "@testing-library/react";
import { jest } from "@jest/globals";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/client";
import type { ClusterAdminsPage as ClusterAdminsPageExport } from "./ClusterAdminsPage";

type QueryState = { data?: unknown; error?: unknown; isLoading?: boolean; isFetching?: boolean };

// Драйвим react-query руками (реальный клиент под vm-modules не монтируем):
// на каждый queryKey отдаём заранее заданное состояние.
let queryState: Record<string, QueryState>;

jest.unstable_mockModule("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const state = queryState[String(queryKey[0])] ?? {};
    return {
      data: state.data,
      error: state.error,
      isLoading: state.isLoading ?? false,
      isFetching: state.isFetching ?? false,
    };
  },
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// Явный (не Proxy) мок иконок: setup.ts отдаёт thenable-Proxy, из-за которого
// `await import()` модуля с иконками не резолвится.
jest.unstable_mockModule("@ant-design/icons", () => ({
  __esModule: true,
  DeleteOutlined: () => null,
  ExclamationCircleOutlined: () => null,
  ReloadOutlined: () => null,
  UserAddOutlined: () => null,
}));

jest.unstable_mockModule("@/api/cluster", () => ({
  clusterApi: { listAdmins: jest.fn(), get: jest.fn(), revokeAdmin: jest.fn() },
}));

jest.unstable_mockModule("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

jest.unstable_mockModule("@/lib/use-operation", () => ({
  useOperation: () => ({ data: undefined }),
}));

jest.unstable_mockModule("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("@/components/organisms/system/GrantAdminModal", () => ({
  GrantAdminModal: () => null,
}));

jest.unstable_mockModule("@/components/organisms/iam/IamCommon", () => ({
  CopyableMonoId: () => null,
  fmtTs: () => "",
}));

jest.unstable_mockModule("@/components/molecules/ErrorResult", () => ({
  ErrorResult: ({ subTitle }: { subTitle?: string }) => <div>{subTitle}</div>,
}));

let ClusterAdminsPage: typeof ClusterAdminsPageExport;

function renderPage() {
  return render(
    <MemoryRouter>
      <ClusterAdminsPage />
    </MemoryRouter>,
  );
}

describe("ClusterAdminsPage", () => {
  beforeAll(async () => {
    ({ ClusterAdminsPage } = await import("./ClusterAdminsPage"));
  });

  beforeEach(() => {
    queryState = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the admins surface and grant CTA when the list resolves", () => {
    queryState = {
      "cluster-admins": { data: [] },
      cluster: { data: {} },
    };

    renderPage();

    expect(screen.getByTestId("cluster-admins-page-title")).toHaveTextContent("Cluster admins");
    expect(screen.getByTestId("cluster-admins-grant-button")).toBeInTheDocument();
  });

  it("shows the forbidden block on a 403 from the gateway", () => {
    const denied = new ApiError(403, "permission_denied", null, "forbidden");
    queryState = {
      "cluster-admins": { error: denied },
      cluster: { error: denied },
    };

    renderPage();

    expect(screen.getByTestId("cluster-admins-forbidden")).toBeInTheDocument();
    expect(screen.queryByTestId("cluster-admins-page-title")).not.toBeInTheDocument();
  });
});
