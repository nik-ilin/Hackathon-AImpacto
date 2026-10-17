import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "../providers/AuthProvider";
import { useAuth } from "../providers/auth-context";
import { AppLayout } from "../../components/layout/AppLayout";
import { Loading, Notice } from "../../components/ui";
import { supabase } from "../../lib/supabase/client";
import { AuthPage, SetupPage } from "../../features/auth/AuthPages";
import { LandingPage } from "../../features/discovery/LandingPage";
import {
  DashboardPage,
  ExplorePage,
} from "../../features/discovery/DiscoveryPages";
import { RequiredProfile } from "../../features/profiles/RequiredProfile";
import { ProfilePage } from "../../features/profiles/ProfilePage";
import {
  GroupDetailPage,
  GroupFormPage,
  MyGroupsPage,
} from "../../features/groups/GroupPages";
import { RequestsPage } from "../../features/memberships/RequestsPage";
import {
  ProjectDetailPage,
  ProjectFormPage,
} from "../../features/projects/ProjectPages";
import { Link } from "react-router-dom";

export function ProtectedRoute() {
  const { session, identityEpoch, loading, error, recovery } = useAuth();
  const location = useLocation();
  if (!supabase) return <Navigate to="/setup" replace />;
  if (loading) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  if (!session)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  if (recovery) return <Navigate to="/reset-password" replace />;
  return <Outlet key={identityEpoch} />;
}
function RecoveryRedirect() {
  const { recovery } = useAuth();
  const location = useLocation();
  return recovery && location.pathname !== "/reset-password" ? (
    <Navigate to="/reset-password" replace />
  ) : null;
}
function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <h1>Esta ruta todavía no lleva a un descubrimiento.</h1>
      <p>La página no existe o su dirección ha cambiado.</p>
      <Link className="button button-primary" to="/">
        Volver al inicio
      </Link>
    </main>
  );
}
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        <RecoveryRedirect />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route
            path="/login"
            element={<AuthPage key="login" mode="login" />}
          />
          <Route
            path="/register"
            element={<AuthPage key="register" mode="register" />}
          />
          <Route
            path="/recover-password"
            element={<AuthPage key="recover" mode="recover" />}
          />
          <Route
            path="/reset-password"
            element={<AuthPage key="reset" mode="reset" />}
          />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/onboarding" element={<ProfilePage onboarding />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route
                path="/groups/new"
                element={
                  <RequiredProfile>
                    <GroupFormPage />
                  </RequiredProfile>
                }
              />
              <Route path="/groups/:groupId" element={<GroupDetailPage />} />
              <Route path="/groups/:groupId/edit" element={<GroupFormPage />} />
              <Route path="/my-groups" element={<MyGroupsPage />} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route
                path="/groups/:groupId/projects/new"
                element={<ProjectFormPage />}
              />
              <Route
                path="/projects/:projectId"
                element={<ProjectDetailPage />}
              />
              <Route
                path="/projects/:projectId/edit"
                element={<ProjectFormPage />}
              />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
