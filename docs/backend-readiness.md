# NexoLab: evidencia de preparación backend

Fecha: 17-10-2026. Rama local `integration/backend-lovable`, HEAD base `158de828713078141606987b6d5b3f7fd11d8473`. Worktree independiente `C:/Users/User/Desktop/Hackathon-AImpacto/NexoLab-backend-lovable`. La carpeta original permanece en feature/profile-imports y conserva sus tres archivos untracked. Sin commit, push, merge compartido, deploy ni cambios remotos.

## Procedencia y consolidación

- Fetch completo realizado antes de decidir integración.
- Base profile-imports `158de82`, con fix M1 `9720384` e infraestructura M1 heredados.
- Raúl `40e4204`, delta desde fix M1 aplicado localmente sin commit. Matching de `69f5613` ya venía incorporado por copia; no se duplicó su migración ni se pretendió ascendencia inexistente.
- Judy `5379e0e`, archivos incorporados y adaptados sin modificar la rama del compañero.
- Migraciones importadas intactas: `20261017010000_matching_diagnostics_feedback.sql`, `20261017020000_raul_opportunities.sql`.
- Migración nueva creada con CLI: `20261017093053_funding_catalog_judy.sql`. Conserva campos financiación, catálogo/historial compartidos y funciones privadas/RLS; no se aplica SQL legado Judy.

## Matriz por subsistema

"CI histórico" no demuestra el parche local actual. "Desplegado" exige inspección/recorrido real del proyecto alojado, no solo archivos preparados.

| Subsistema | Implementado | Probado localmente | Probado en CI | Desplegado remoto | Pendiente |
| --- | --- | --- | --- | --- | --- |
| Auth, perfil, grupos/proyectos/solicitudes M1 | sí, heredado | unitarias/SQL embebido; UI pública | M1 histórico en PR3; parche consolidado no | no | Auth/RLS real + frontend definitivo |
| Sesión/refresh/A->B->A, matching/feedback | sí, guardias JWT ampliadas | unitarias frontend/API/SQL | preparado, no ejecutado para este parche | no | Auth/REST/E2E real consolidado |
| ORCID | sí, shared Deno autocontenido + cache token | unitarias y Deno check entrypoints | PR3 falló 503; nuevo runner pendiente | no | runtime Edge real y credenciales /read-public/API real |
| LinkedIn export local | sí, conservado | unitarias CSV/ZIP/selección | quality histórico; consolidado pendiente | n/a cliente | conectar UI Lovable |
| Catálogo becas y financiación | sí | migraciones completas PGlite, API unitaria | preparado, no ejecutado | no | pgTAP/Auth/REST/concurrencia reales |
| Raúl trigger/estado | sí, handler inyectable y RPC durables | HTTP con mocks + SQL + Deno check | runner Edge real preparado | no | trigger real + proveedor habilitado con presupuesto |
| Judy adaptador/ejecutor | sí, persistencia requerida + dry-run explícito | tests de store/runner/servidor/migraciones | workflow/tests preparados | no | persistencia REST y dos agentes reales |
| Fuentes Judy | sí, identidad/plazos/evidencia conservadores | fixtures de fuentes, sin ingesta remota | preparado | no | validar fuentes actuales/condiciones y habilitar opcionales |
| Tipos del esquema | contrato curado + generador/checker | typecheck; checker autoconsistencia compilado | generación oficial desde DB local preparada | no | ejecutar comparación contra tipos oficiales en CI |
| Make | blueprint HTTP y correlación documentados | contratos servidor en tests | sin escenario externo | no | crear conexiones/escenarios con tokens limitados |
| Lovable | guía/servicios/tipos | referencia React compila | sin frontend Lovable probado | no | seleccionar proyecto existente y configurar Auth URLs |

## Evidencia ejecutada en este worktree

- `npm ci`: exit0, 279 paquetes, auditoría0 vulnerabilidades en esa ejecución.
- `npm run typecheck`: exit0.
- `npm run typecheck:judy`: exit0.
- `npm run lint`: exit0 tras corregir variables no usadas de Judy, sin relajar reglas.
- `npm test -- --maxWorkers=2`: **18 archivos /176 tests aprobados**, incluidas las correcciones finales. Una ejecución paralela anterior falló al arrancar6 workers (12 archivos/136 tests pasaron); al ejecutarla con dos workers pasaron los18 archivos sin cambiar aserciones ni timeouts.
- `npm run test:judy`: **5 archivos /41 tests aprobados**, incluida la regresión Alpha/Beta de evidencia privada.
- `npm run build`: exit0; aviso de bundle JS >500kB (668.16kB en esa ejecución).
- `npx --yes deno@2.9.6 check supabase/functions/profile-orcid/index.ts supabase/functions/raul-trigger/index.ts`: exit0 (comprobación real del grafo Deno, no mock de imports).
- `npm run test:e2e`: **3 aprobados /1 omitido**, exit0. El omitido es colaboración autenticada, que exige Supabase local.
- `git diff --check`: exit0 (warnings de conversión CRLF no son errores de diff).

No se ejecutaron pgTAP, reset/stack Supabase, integración Auth/REST, concurrencia PostgreSQL ni Edge real: Docker no está disponible. Intentar los runners produjo salida1 "Supabase local no disponible" o ECONNREFUSED a127.0.0.1:54322 antes de assertions; no cuentan como pruebas aprobadas. No se consultaron APIs reales ORCID/Firecrawl para fingir éxito, ni se ejecutaron ingestas contra el proyecto remoto.

## CI histórico y fallo ORCID

[PR3 run39019608648](https://github.com/nik-ilin/Hackathon-AImpacto/actions/runs/39019608648): quality verde; Supabase arrancó/reset/pgTAP/lint/advisors/concurrencia/integración pasaron. Paso12 `test:profile-import-edge` recibió 503 sin JWT, cuando esperaba401/403. Chromium/E2E quedaron omitidos. Los logs no guardaron cuerpo ni logs worker, así que la causa histórica exacta no está demostrada.

Se corrigió un defecto concreto del grafo Deno: import relativo sin extensión, trasladando normalización a functions/_shared con imports.ts explícitos. El chequeo Deno pasa ahora. El nuevo runner captura diagnóstico acotado de arranque y mantiene401/403 obligatorio;503 nunca se acepta como autenticación. Sirve ambas funciones con configuración sintética temporal, sin APIs pagadas, y fuerza la ejecución E2E incluso si falla un paso previo. Debe publicarse el parche con autorización antes de que Actions pueda verificarlo; no se puede ejecutar en CI un árbol local sin publicar.

## Inspección remota de solo lectura

Proyecto existente `Hackathon-AImpacto`, ref `mcwoxcwpewghtmqlqtyb`, región eu-west-1, estado ACTIVE_HEALTHY. Consulta de metadatos: tablas públicas de aplicación[], migraciones registradas[], Edge Functions[]. Por ello ninguna integración de esta rama está desplegada ni validada en el alojado.

`public.rls_auto_enable()` tiene retorno event_trigger, propietario postgres, SECURITY DEFINER, search_path pg_catalog, ACL null y EXECUTE anon/authenticated true; trigger ensure_rls habilitado. Se documentó revocación segura sin borrar el trigger y la migración local la condiciona al tipo/firma. No se ejecutó ningún DDL remoto ni se ha demostrado explotación de la función event_trigger como RPC ordinaria.

## Revisión independiente

Se revisaron diff, fuentes, SQL, contratos y aserciones reales. Se cerraron dos hallazgos importantes: finalización Raúl ahora adquiere el lock en una sentencia previa a los agregados, con regresiones de ambos órdenes de concurrencia; private_web no promueve hechos LLM de otra convocatoria (solo título+URL verificables, resto unverified/unknown). El reviewer independiente confirmó ambas correcciones sin nuevos hallazgos bloqueantes/importantes. Las pruebas reales de concurrencia siguen pendientes de PostgreSQL/Supabase local; no se confunde revisión de código con ejecución experimental.

## Riesgos y pasos manuales

- **Bloqueo operativo:** proyecto alojado sin esquema/funciones; requiere despliegue autorizado y aceptación real. No listo para producción.
- **Importante de validación:** el parche actual no se ha ejecutado en CI/Supabase real ni con fuentes/proveedores reales. Mantener esta limitación hasta disponer de evidencia.
- **Configuración pendiente:** secretos privados en sus servicios, API ORCID, fuentes privadas explícitas, Auth Site URL/redirect URLs, conexión Lovable, workflow Judy en rama por defecto y escenarios Make.
- **Menor:** bundle de referencia grande; no se rediseñó el frontend separado.

Orden de comprobación con Docker: npm ci raíz y agents/judy -> typecheck/lint/tests/build/Deno -> db:start/reset local -> pgTAP/db:types/advisors -> concurrencia M1 -> integración M1 -> integración catálogo -> concurrencia catálogo -> test:edge:local -> test:e2e:local. Ejecutar catálogo integración y concurrencia en serie; modifican/restauran fuentes locales. Los runners rechazan destinos remotos. No ejecutar seed demo en producción.

Ver [lovable-backend-handoff.md](lovable-backend-handoff.md) para contrato de entrada/salida, variables, blueprint Make y guía manual de publicación/rollback aditivo. No hay acciones externas autorizadas ejecutadas ni credenciales entregadas al compañero.

## Inventario de archivos de la integración

Incluye archivos incorporados desde ramas y archivos corregidos/nuevos; excluye artefactos ignorados.

- `.github/workflows/ci.yml`
- `.github/workflows/judy.yml`
- `README.md`
- `agents/judy/.env.example`
- `agents/judy/.gitignore`
- `agents/judy/README.md`
- `agents/judy/config/private-sources.json`
- `agents/judy/package-lock.json`
- `agents/judy/package.json`
- `agents/judy/sql/001_judy_funding_sources.sql`
- `agents/judy/src/cli.ts`
- `agents/judy/src/pipeline.ts`
- `agents/judy/src/runner.ts`
- `agents/judy/src/server.ts`
- `agents/judy/src/sources/bdns.ts`
- `agents/judy/src/sources/euFundingTenders.ts`
- `agents/judy/src/sources/privateWeb.ts`
- `agents/judy/src/sources/ucmOtri.ts`
- `agents/judy/src/store/supabase.ts`
- `agents/judy/src/types.ts`
- `agents/judy/src/util/http.ts`
- `agents/judy/src/util/text.ts`
- `agents/judy/tests/database.test.ts`
- `agents/judy/tests/fixtures/bdns-detail-933468.json`
- `agents/judy/tests/fixtures/bdns-detail-933859.json`
- `agents/judy/tests/fixtures/bdns-detail-935984.json`
- `agents/judy/tests/fixtures/bdns-search.json`
- `agents/judy/tests/fixtures/eu-search.json`
- `agents/judy/tests/fixtures/ucm-otri.html`
- `agents/judy/tests/persistence.test.ts`
- `agents/judy/tests/server.test.ts`
- `agents/judy/tests/sources.test.ts`
- `agents/judy/tests/util.test.ts`
- `agents/judy/tsconfig.json`
- `docs/backend-readiness.md`
- `docs/database.md`
- `docs/integrations.md`
- `docs/lovable-backend-handoff.md`
- `docs/permissions.md`
- `docs/raul.md`
- `docs/verification.md`
- `package.json`
- `src/app/routes/index.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/features/groups/GroupPages.tsx`
- `src/features/matching/MatchingPages.tsx`
- `src/features/matching/service.ts`
- `src/features/profiles/import/orcid-id.ts`
- `src/features/profiles/import/orcid.ts`
- `src/features/projects/ProjectPages.tsx`
- `src/features/scholarships/ScholarshipsPage.tsx`
- `src/features/scholarships/assessment.ts`
- `src/features/scholarships/service.ts`
- `src/lib/supabase/catalog.ts`
- `src/styles/index.css`
- `src/types/database.ts`
- `supabase/config.toml`
- `supabase/functions/_shared/orcid-id.ts`
- `supabase/functions/_shared/orcid.ts`
- `supabase/functions/profile-orcid/handler.ts`
- `supabase/functions/profile-orcid/index.ts`
- `supabase/functions/raul-trigger/catalog.ts`
- `supabase/functions/raul-trigger/handler.ts`
- `supabase/functions/raul-trigger/index.ts`
- `supabase/functions/raul-trigger/security.ts`
- `supabase/migrations/20261017010000_matching_diagnostics_feedback.sql`
- `supabase/migrations/20261017020000_raul_opportunities.sql`
- `supabase/migrations/20261017093053_funding_catalog_judy.sql`
- `supabase/seed.sql`
- `supabase/tests/001_collaboration.test.sql`
- `supabase/tests/002_raul.test.sql`
- `supabase/tests/003_funding.test.sql`
- `tests/database/catalog-concurrency.mjs`
- `tests/database/concurrency.mjs`
- `tests/database/funding.test.ts`
- `tests/database/matching.test.ts`
- `tests/database/raul.test.ts`
- `tests/database/schema.test.ts`
- `tests/e2e/collaboration.spec.ts`
- `tests/frontend/catalog.test.ts`
- `tests/frontend/matching-identity.test.ts`
- `tests/frontend/matching.test.tsx`
- `tests/frontend/orcid-import.test.ts`
- `tests/frontend/project-draft.test.tsx`
- `tests/frontend/raul-collector.test.ts`
- `tests/frontend/raul-http.test.ts`
- `tests/frontend/scholarships.test.tsx`
- `tests/integration/backend-catalog.mjs`
- `tests/integration/check-generated-types.mjs`
- `tests/integration/collaboration.mjs`
- `tests/integration/edge-diagnostics.mjs`
- `tests/integration/local-service-config.mjs`
- `tests/integration/profile-import-edge.mjs`
- `tests/integration/raul-edge.mjs`
- `tests/integration/run-edge.mjs`
