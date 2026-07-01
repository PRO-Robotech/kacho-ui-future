import { useEffect, useMemo } from "react";
import type { FC, ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntdApp } from "antd";
import { ThemeProvider } from "@/lib/theme-context";
import { contextApi } from "@/lib/context-store";
import "@/typography.css";
import "@/index.css";

export interface NlbPageProps {
  context?: {
    account: { id: string; name: string } | null;
    project: { id: string; name: string; accountId: string } | null;
  };
  navigate?: (path: string) => void | Promise<void>;
}

export const NlbPage: FC<NlbPageProps> = ({ context }) => {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 5_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

  useEffect(() => {
    if (context?.account) {
      contextApi.hydrate({ account: context.account });
    }
    if (context?.project) {
      contextApi.hydrate({ project: context.project });
    }
  }, [context]);

  return (
    <ThemeProvider>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <NlbFrame>
            <Routes>
              <Route index element={<NlbPlaceholder />} />
              <Route path="*" element={<NlbPlaceholder />} />
            </Routes>
          </NlbFrame>
        </QueryClientProvider>
      </AntdApp>
    </ThemeProvider>
  );
};

function NlbFrame({ children }: { children: ReactNode }) {
  return (
    <section className="nlb-remote-frame">
      <div className="nlb-remote-content">{children}</div>
    </section>
  );
}

// Заглушка Phase 1 — реальные списки/детали ресурсов NLB (LoadBalancer /
// Listener / TargetGroup) подключаются на следующих фазах через общий REGISTRY
// и ResourceListPage, как в VPC-remote.
function NlbPlaceholder() {
  return <h2 className="nlb-remote-heading">Network Load Balancing</h2>;
}

export default NlbPage;
