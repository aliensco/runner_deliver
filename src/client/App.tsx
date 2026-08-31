import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Route as RouteIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/toast";
import { DashboardPage } from "./pages/DashboardPage";
import { DispatchPage } from "./pages/DispatchPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { CreateOrderPage, OrdersPage } from "./pages/OrdersPage";
import { LoginPage } from "./pages/LoginPage";
import { MerchantsPage, RidersPage } from "./pages/PeoplePages";
import { LedgerPage, PricingPage, SettingsPage } from "./pages/OperationsPages";
import { RiderProfilePage, RiderTasksPage } from "./pages/RiderPages";
import type { Role, User } from "./lib/types";

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedApplication />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}

function ProtectedApplication() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="app-loading"><span className="brand-mark"><RouteIcon /></span><strong>RunnerGo</strong><i /></div>;
  if (!auth.user) return <Navigate to="/login" state={{ from: location }} replace />;
  const user = auth.user;
  return (
    <AppShell user={user} onLogout={auth.logout}>
      <Routes>
        <Route index element={<DashboardPage user={user} />} />
        <Route path="orders" element={<OrdersPage user={user} />} />
        <Route path="orders/:id" element={<OrderDetailPage user={user} />} />
        <Route path="orders/new" element={<RoleRoute user={user} roles={["admin", "merchant"]}><CreateOrderPage user={user} /></RoleRoute>} />
        <Route path="dispatch" element={<RoleRoute user={user} roles={["admin"]}><DispatchPage /></RoleRoute>} />
        <Route path="merchants" element={<RoleRoute user={user} roles={["admin"]}><MerchantsPage /></RoleRoute>} />
        <Route path="riders" element={<RoleRoute user={user} roles={["admin"]}><RidersPage /></RoleRoute>} />
        <Route path="pricing" element={<RoleRoute user={user} roles={["admin"]}><PricingPage /></RoleRoute>} />
        <Route path="ledger" element={<RoleRoute user={user} roles={["admin", "merchant"]}><LedgerPage user={user} /></RoleRoute>} />
        <Route path="settings" element={<RoleRoute user={user} roles={["admin"]}><SettingsPage /></RoleRoute>} />
        <Route path="tasks" element={<RoleRoute user={user} roles={["rider"]}><RiderTasksPage /></RoleRoute>} />
        <Route path="income" element={<RoleRoute user={user} roles={["rider"]}><LedgerPage user={user} /></RoleRoute>} />
        <Route path="profile" element={<RoleRoute user={user} roles={["rider"]}><RiderProfilePage user={user} /></RoleRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function RoleRoute({ user, roles, children }: { user: User; roles: Role[]; children: ReactNode }) {
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}
