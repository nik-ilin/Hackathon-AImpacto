import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Brand } from "../../components/layout/AppLayout";
import { Button, Field, Notice } from "../../components/ui";
import {
  backend,
  configurationError,
  supabase,
} from "../../lib/supabase/client";
import { errorMessage } from "../../lib/errors/messages";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registrationSchema,
  validationMessage,
} from "../../lib/validation/schemas";
import { useAuth } from "../../app/providers/auth-context";

export function SetupPage() {
  return (
    <main id="main-content" className="setup-page">
      <Brand />
      <section className="panel">
        <span className="eyebrow">CONFIGURACIÓN DEL ENTORNO</span>
        <h1>Conecta NexoLab a Supabase</h1>
        <p>
          La interfaz está preparada. La autenticación y los datos necesitan un
          backend real para funcionar.
        </p>
        <Notice>
          {configurationError ?? "Revisa la conexión con Supabase."}
        </Notice>
        <ol>
          <li>
            Inicia Supabase local y aplica las migraciones indicadas en{" "}
            <code>README.md</code>.
          </li>
          <li>
            Copia <code>.env.example</code> como <code>.env.local</code>.
          </li>
          <li>
            Configura <code>VITE_SUPABASE_URL</code> y{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> con la URL y clave
            publicable del entorno.
          </li>
          <li>
            Reinicia el servidor con <code>npm run dev</code>.
          </li>
        </ol>
        <p className="muted">
          La clave debe ser publicable o anon. Las claves secretas y
          service_role no pertenecen al navegador.
        </p>
        <Link className="text-link" to="/">
          Volver a NexoLab <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "recover" | "reset";
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, finishRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  if (!supabase) return <SetupPage />;
  const titles = {
    login: "Tu investigación continúa aquí.",
    register: "Tu siguiente etapa empieza aquí.",
    recover: "Recupera el acceso a tu cuenta.",
    reset: "Elige una nueva contraseña.",
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const checked =
      mode === "recover"
        ? emailSchema.safeParse(email)
        : mode === "reset"
          ? passwordSchema.safeParse(password)
          : (mode === "register" ? registrationSchema : loginSchema).safeParse({
              email,
              password,
            });
    if (!checked.success) {
      setError(validationMessage(checked.error));
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: failure } = await backend().auth.signInWithPassword({
          email,
          password,
        });
        if (failure) throw failure;
        const state = location.state as { from?: string } | null;
        navigate(
          state?.from?.startsWith("/") && !state.from.startsWith("//")
            ? state.from
            : "/dashboard",
          { replace: true },
        );
      }
      if (mode === "register") {
        const { data, error: failure } = await backend().auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (failure) throw failure;
        if (data.session) navigate("/onboarding");
        else
          setSuccess(
            "Solicitud de registro recibida. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.",
          );
      }
      if (mode === "recover") {
        const { error: failure } = await backend().auth.resetPasswordForEmail(
          email,
          { redirectTo: `${window.location.origin}/reset-password` },
        );
        if (failure) throw failure;
        setSuccess(
          "Si hay una cuenta con ese correo, recibirás un enlace para recuperar la contraseña.",
        );
      }
      if (mode === "reset") {
        if (!session)
          throw new Error(
            "Abre el enlace de recuperación que recibiste por correo.",
          );
        const { error: failure } = await backend().auth.updateUser({
          password,
        });
        if (failure) throw failure;
        finishRecovery();
        setSuccess("Contraseña actualizada correctamente.");
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">CIENCIA CONECTADA</span>
          <h1>
            Las grandes ideas
            <br />
            merecen encontrar
            <br />
            <em>su equipo.</em>
          </h1>
          <p>
            Desde el primer grupo hasta el próximo proyecto. Un espacio para
            construir tu trayectoria investigadora.
          </p>
        </div>
        <span className="auth-assurance">
          <ShieldCheck size={19} /> Una cuenta universal, a tu ritmo.
        </span>
      </section>
      <main id="main-content" className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">
            {mode === "register"
              ? "BIENVENIDO A NEXOLAB"
              : "TU ESPACIO CIENTÍFICO"}
          </span>
          <h2>{titles[mode]}</h2>
          <p className="muted">
            {mode === "register"
              ? "Crea tu cuenta para encontrar, participar o liderar grupos de investigación."
              : "Conecta con personas que comparten tus preguntas."}
          </p>
          {error && <Notice>{error}</Notice>}
          {success && <Notice success>{success}</Notice>}
          {mode === "reset" && !loading && !session && (
            <Notice>
              Necesitas un enlace de recuperación válido.{" "}
              <Link to="/recover-password">Solicitar otro enlace</Link>.
            </Notice>
          )}
          <form onSubmit={(event) => void submit(event)} className="form-stack">
            {mode !== "reset" && (
              <Field label="Correo electrónico">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@universidad.edu"
                />
              </Field>
            )}
            {mode !== "recover" && (
              <Field
                label={mode === "reset" ? "Nueva contraseña" : "Contraseña"}
                hint={mode !== "login" ? "Al menos 10 caracteres." : undefined}
              >
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 10}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
            )}
            {mode === "login" && (
              <Link
                className="text-link small align-end"
                to="/recover-password"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            )}
            <Button
              disabled={busy || loading || (mode === "reset" && !session)}
              type="submit"
            >
              {busy
                ? "Procesando…"
                : {
                    login: "Iniciar sesión",
                    register: "Crear mi cuenta",
                    recover: "Enviar enlace de recuperación",
                    reset: "Actualizar contraseña",
                  }[mode]}
              <ArrowRight size={18} />
            </Button>
          </form>
          {mode === "login" ? (
            <p className="auth-switch">
              ¿Aún no tienes cuenta? <Link to="/register">Empieza aquí</Link>
            </p>
          ) : (
            <p className="auth-switch">
              <Link to={mode === "reset" && success ? "/dashboard" : "/login"}>
                {mode === "reset" && success
                  ? "Ir a mi espacio"
                  : "Volver a iniciar sesión"}
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
