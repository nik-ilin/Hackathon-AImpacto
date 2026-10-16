import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Network,
  FlaskConical,
  Compass,
  Orbit,
  Check,
  Sparkles,
} from "lucide-react";
import { Brand } from "../../components/layout/AppLayout";
import { useAuth } from "../../app/providers/auth-context";

export function LandingPage() {
  const { session } = useAuth();
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav aria-label="Navegación">
          <a href="#como-funciona">Cómo funciona</a>
          <Link to={session ? "/dashboard" : "/login"}>
            {session ? "Mi espacio" : "Iniciar sesión"}
          </Link>
          <Link
            className="button button-primary"
            to={session ? "/explore" : "/register"}
          >
            {session ? "Explorar grupos" : "Comenzar"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span /> CONOCIMIENTO SIN FRONTERAS
            </span>
            <h1>
              Tu próximo avance
              <br />
              empieza con una
              <br />
              <em>conexión.</em>
            </h1>
            <p>
              NexoLab acompaña toda la trayectoria investigadora: desde
              descubrir tu primera oportunidad hasta conseguir colaboradores y
              financiación para proyectos científicos.
            </p>
            <div className="hero-actions">
              <Link
                to={session ? "/explore" : "/register"}
                className="button button-primary"
              >
                Encuentra tu lugar en la ciencia{" "}
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <a href="#como-funciona" className="text-link">
                Descubre NexoLab <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="hero-footnote">
              <Check size={17} aria-hidden="true" />
              Una cuenta. Todas las etapas de tu investigación.
            </div>
          </div>
          <div className="science-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="science-center">
              <Orbit size={78} strokeWidth={1} />
              <span>
                Ideas que
                <br />
                encuentran su equipo.
              </span>
            </div>
            <div className="science-tag tag-one">
              <FlaskConical size={20} /> Grupos de investigación
            </div>
            <div className="science-tag tag-two">
              <Network size={20} /> Colaboración científica
            </div>
            <div className="science-tag tag-three">
              <Sparkles size={20} /> Nuevas posibilidades
            </div>
            <span className="orbit-dot dot-one" />
            <span className="orbit-dot dot-two" />
            <span className="orbit-dot dot-three" />
          </div>
        </section>
        <section className="landing-strip">
          <span>Para quienes empiezan.</span>
          <span>Para quienes investigan.</span>
          <span>Para quienes abren caminos.</span>
        </section>
        <section className="journey-section" id="como-funciona">
          <div className="section-heading">
            <span className="eyebrow">
              UNA TRAYECTORIA, MUCHAS POSIBILIDADES
            </span>
            <h2>
              La ciencia necesita ideas.
              <br />Y personas que las hagan posibles.
            </h2>
            <p>
              Encuentra afinidad científica y convierte intereses compartidos en
              investigación.
            </p>
          </div>
          <div className="journey-grid">
            <article>
              <span className="feature-number">01</span>
              <Compass size={28} />
              <h3>Encuentra tu equipo</h3>
              <p>
                Descubre grupos por disciplina e intereses y conoce cuáles
                aceptan nuevas incorporaciones.
              </p>
              <Link
                to={session ? "/explore" : "/register"}
                className="text-link"
              >
                Explorar posibilidades <ArrowUpRight size={16} />
              </Link>
            </article>
            <article>
              <span className="feature-number">02</span>
              <Network size={28} />
              <h3>Construye algo juntos</h3>
              <p>
                Crea un grupo, reúne colaboradores y da un espacio propio a tus
                proyectos científicos.
              </p>
              <Link
                to={session ? "/groups/new" : "/register"}
                className="text-link"
              >
                Empezar un grupo <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="future-feature">
              <span className="badge">Próximamente</span>
              <Sparkles size={28} />
              <h3>Abre nuevas oportunidades</h3>
              <p>
                Becas y financiación conectadas con tu trayectoria y con las
                necesidades de tus proyectos.
              </p>
              <span className="muted small">
                En preparación para una próxima etapa.
              </span>
            </article>
          </div>
        </section>
        <section className="landing-cta">
          <div>
            <span className="eyebrow">
              EL CONOCIMIENTO CRECE CUANDO SE COMPARTE
            </span>
            <h2>Haz espacio a tu próxima idea.</h2>
          </div>
          <Link
            className="button button-light"
            to={session ? "/dashboard" : "/register"}
          >
            Empieza en NexoLab <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Ciencia conectada. Posibilidades compartidas.</span>
        <span>© {new Date().getFullYear()} NexoLab</span>
      </footer>
    </div>
  );
}
