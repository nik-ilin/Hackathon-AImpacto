import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Atom,
  Compass,
  LayoutDashboard,
  Users,
  Inbox,
  UserRound,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "../../app/providers/auth-context";
import { backend } from "../../lib/supabase/client";
import { errorMessage } from "../../lib/errors/messages";
import { Button, Notice } from "../ui";

const navigation = [
  { to: "/dashboard", label: "Mi espacio", icon: LayoutDashboard },
  { to: "/explore", label: "Explorar grupos", icon: Compass },
  { to: "/my-groups", label: "Mis grupos", icon: Users },
  { to: "/requests", label: "Solicitudes", icon: Inbox },
];
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="NexoLab, inicio">
      <span className="brand-symbol">
        <Atom size={26} strokeWidth={1.7} aria-hidden="true" />
      </span>
      Nexo<span>Lab</span>
    </Link>
  );
}
export function AppLayout() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await backend().auth.signOut();
      if (failure) throw failure;
      navigate("/");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Cerrar navegación"
          >
            <X />
          </button>
        </div>
        <p className="nav-label">TU TRAYECTORIA CIENTÍFICA</p>
        <nav aria-label="Navegación principal">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="eyebrow">EL SIGUIENTE PASO</span>
            <h3>La ciencia avanza en equipo.</h3>
            <Link to="/groups/new" onClick={() => setOpen(false)}>
              Crea tu grupo <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <NavLink
            to="/profile"
            className="nav-item"
            onClick={() => setOpen(false)}
          >
            <UserRound size={19} aria-hidden="true" />
            Mi perfil
          </NavLink>
          <Button
            variant="secondary"
            className="logout-button"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={17} aria-hidden="true" />
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </Button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <button
            className="icon-button mobile-only"
            aria-label="Abrir navegación"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <span className="header-context">
            Un lugar para hacer avanzar tus ideas.
          </span>
          <Link to="/profile" className="account-pill">
            <span className="avatar">
              {session?.user.email?.charAt(0).toUpperCase() ?? "N"}
            </span>
            <span>Mi cuenta</span>
          </Link>
        </header>
        <main id="main-content" className="workspace">
          {error && <Notice>{error}</Notice>}
          <Outlet />
        </main>
        <footer className="app-footer">
          NexoLab · Conectamos conocimiento, impulsamos investigación.
        </footer>
      </div>
    </div>
  );
}
