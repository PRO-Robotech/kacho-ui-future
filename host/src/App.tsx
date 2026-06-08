import { useState } from "react";
import type { Dispatch, FC, SetStateAction } from "react";
import { ConfigProvider, theme } from "antd";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { HostShell } from "./components";
import { ModulePlaceholderPage, ReachabilityPage } from "./pages";
import { DashboardRemote } from "./remotes";

const App: FC = () => {
  const [dark, setDark] = useState(false);

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#3d8df5",
          borderRadius: 6,
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      }}
    >
      <BrowserRouter>
        <AppRoutes dark={dark} setDark={setDark} />
      </BrowserRouter>
    </ConfigProvider>
  );
};

const AppRoutes: FC<{
  dark: boolean;
  setDark: Dispatch<SetStateAction<boolean>>;
}> = ({ dark, setDark }) => {
  const location = useLocation();
  const showReachability = (import.meta.env?.DEV ?? false) && location.pathname === "/dev/reachability";

  return (
    <HostShell dark={dark} setDark={setDark} showReachability={showReachability}>
      {(context) => (
        <Routes>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardRemote context={context} />} />
          <Route path="/projects/:projectId/dashboard" element={<DashboardRemote context={context} />} />
          <Route path="/projects/:projectId/:moduleKey/*" element={<ModulePlaceholderPage />} />
          <Route path="/iam/:iamSection/*" element={<ModulePlaceholderPage />} />
          <Route path="/system/search" element={<ModulePlaceholderPage />} />
          <Route path="/system/:systemSection/*" element={<ModulePlaceholderPage />} />
          <Route path="/dev/reachability" element={<ReachabilityPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      )}
    </HostShell>
  );
};

export default App;
