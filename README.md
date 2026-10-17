# NexoLab

NexoLab acompaña toda la trayectoria investigadora: desde descubrir tu primera oportunidad hasta conseguir colaboradores y financiación para proyectos científicos.

M1 implementa perfiles, grupos, solicitudes transaccionales, membresías, proyectos y descubrimiento por disciplinas. Una cuenta permite liderar varios grupos y participar en otros. No es una red social; las herramientas de becas, financiación y voz se incorporarán después.

## Arranque rápido — Windows / PowerShell

Requisitos: Git, Node.js **24.x**, npm y Docker Desktop con motor Linux iniciado para Supabase local.

```powershell
npm ci
npm run db:start
npm run db:reset
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

Completar `.env.local` con la URL local y su clave **publicable**, después abrir `http://127.0.0.1:5173`. `db:reset` elimina exclusivamente los datos del stack local. Sin backend configurado, la aplicación muestra instrucciones; no simula login ni persistencia. La guía completa, puertos, redirecciones y requisitos están en [setup](docs/setup.md).

## Verificaciones

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Con Supabase local iniciado:

```powershell
npm run test:db
npm run test:concurrency
npm run test:integration
npm run test:e2e:local
```

Los runners reales solo admiten loopback y generan fixtures locales. Vitest ejecuta el SQL real con PostgreSQL embebido y stubs de Auth: eso no sustituye Auth/REST ni concurrencia real. Consultar [evidencia y limitaciones](docs/verification.md). El workflow de PR comprueba calidad y arranca el stack Supabase; no despliega ni necesita credenciales remotas.

## Organización

| Ruta           | Responsabilidad                                                     |
| -------------- | ------------------------------------------------------------------- |
| src/app        | Rutas y proveedor de sesión                                         |
| src/components | Controles accesibles y navegación                                   |
| src/features   | Auth, perfiles, grupos, solicitudes, proyectos y discovery          |
| src/lib        | Supabase, servicios tipados, validación y errores                   |
| src/hooks      | Carga de datos con protección frente a respuestas obsoletas         |
| src/types      | Contrato SQL e interfaz de automatizaciones futuras                 |
| src/styles     | Sistema visual responsive                                           |
| supabase       | Configuración CLI, migraciones, taxonomía seed y pgTAP              |
| tests          | Unitarios, SQL embebido, integración real, concurrencia y navegador |
| docs           | Arquitectura, datos, permisos, setup, decisiones e integraciones    |

## Colaboración de los seis desarrolladores

Partir de `main` actualizado, crear ramas `feature/<alcance>` y repartir módulos con responsables claros. Revisar `git status` antes de editar y conservar cambios ajenos. Cada PR debe explicar problema, comportamiento resultante, migraciones y pruebas ejecutadas. Requiere revisión independiente y CI verde antes de merge autorizado. No hacer force-push ni reescribir ramas compartidas.

La implementación inicial está en `feature/bootstrap-infrastructure`; solo se realizó el commit mínimo inicial solicitado para `main`. Los cambios de M1 se entregan locales y sin commit, push, merge o despliegue.

Crear migraciones con `npx supabase migration new nombre`. No editar migraciones ya aplicadas por el equipo; versionar otra. Revisar constraints, RLS, grants y tipos juntos. Un estudiante puede crear grupos; nunca introducir permisos derivados de `academic_stage`.

## Arquitectura, sponsors y siguientes etapas

- [Arquitectura](docs/architecture.md), [modelo de datos](docs/database.md), [permisos](docs/permissions.md) y [decisiones](docs/decisions.md).
- [Lovable, Make, ElevenLabs y Firecrawl](docs/integrations.md): integraciones futuras documentadas, sin escenarios, webhooks, SDK o llamadas ficticias. Este repositorio independiente no se ha importado en Lovable.
- [Agentes futuros](docs/future-agents.md): ingesta programada, oportunidades normalizadas compartidas, filtros deterministas, deduplicación y medición de costes. No se ejecuta scraping ni LLM por búsqueda.
- [Importación de perfil](docs/profile-imports.md): ORCID público mediante función Edge y archivos LinkedIn locales, con vista previa y confirmación explícita.

PostgreSQL/Supabase es la única fuente de verdad. Nunca configurar secret keys/service_role en variables VITE, versionar `.env.local`, modificar producción ni desplegar sin autorización.

## Integración backend para Lovable (local, no desplegada)

La rama `integration/backend-lovable` consolida perfiles/importación, matching, Raúl y Judy sin crear otro backend. El contrato para el frontend separado está en [lovable-backend-handoff](docs/lovable-backend-handoff.md); [backend-readiness](docs/backend-readiness.md) distingue implementación, pruebas, CI y despliegue real.

```powershell
npm ci
npm ci --prefix agents/judy
npm run typecheck
npm run typecheck:judy
npm run lint
npm test
npm run test:judy
npm run build
# Con Deno 2.9.6:
npm run typecheck:edge
# Con Supabase local/Docker, solo loopback:
npm run test:db
npm run test:db:types
npm run test:catalog:integration
npm run test:catalog:concurrency
npm run test:edge:local
npm run test:e2e:local
```

La ingesta Judy exige persistencia configurada o `--dry-run` explícito. No aplicar su SQL legado aislado; las migraciones canónicas viven en `supabase/migrations`. Los workflows solo quedan preparados localmente hasta publicación autorizada; no se han configurado escenarios Make ni secretos.
