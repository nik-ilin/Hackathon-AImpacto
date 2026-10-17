# Regresiones de M1 y diagnóstico E2E

## Correcciones funcionales

- Los editores de proyecto y grupo conservan borradores ante `TOKEN_REFRESHED`
  y se invalidan al cambiar de identidad. Un contador de cambios en AuthProvider
  también cubre A→B→A en un mismo batch; no incrementa por renovar el token.
- Crear grupos y solicitar incorporaciones requiere perfil confirmado, con carga,
  error recuperable y redirección a onboarding conservando un destino interno.
  Las mutaciones vuelven a comprobar usuario y, cuando corresponde, perfil.
- Las RPC capturan el token de la identidad comprobada por petición. Un guardado
  ya enviado puede terminar bajo su cuenta original; su resultado se ignora
  cuando el editor deja de estar activo y nunca se atribuye a la cuenta nueva.
- Explorar sincroniza el borrador cuando cambia `q`, conservando la edición
  pendiente al cambiar otros filtros. Recomendaciones y explicaciones se
  invalidan con la identidad; las respuestas antiguas no reemplazan las nuevas.
- Un proyecto público en grupo privado representa su valor persistido y explica
  la limitación de descubrimiento. Solo cambia visibilidad al elegir y guardar.

SQL, RLS, constraints, tipos de base, dependencias y `.env.example` no cambian.

## Archivos de esta corrección

Aplicación:

- `src/app/providers/AuthProvider.tsx`
- `src/app/providers/auth-context.ts`
- `src/app/routes/index.tsx`
- `src/features/discovery/DiscoveryPages.tsx`
- `src/features/groups/GroupPages.tsx`
- `src/features/memberships/RequestsPage.tsx`
- `src/features/profiles/ProfilePage.tsx`
- `src/features/profiles/RequiredProfile.tsx` (nuevo)
- `src/features/projects/ProjectPages.tsx`
- `src/hooks/useMutationIdentity.ts` (nuevo)
- `src/lib/supabase/api.ts`
- `src/lib/supabase/identity.ts` (nuevo)

Pruebas, CI y evidencia:

- `tests/frontend/m1-regressions.test.tsx` (nuevo)
- `tests/frontend/identity-api.test.ts` (nuevo)
- `tests/e2e/collaboration.spec.ts`
- `tests/e2e/field-select.spec.ts` (nuevo)
- `tests/integration/run-e2e.mjs`
- `playwright.config.ts`
- `.github/workflows/ci.yml`
- `docs/m1-review-findings.md` (nuevo)

## Validación final local

El 17 de octubre de 2026, sobre `fix/m1-review-findings`, HEAD sin modificar
`8d8eb8d2c67c9eba0195a5d9e41edb47af6d221a`:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0, sin warnings |
| `npm test` | Salida 0; 69/69 tests, 5 archivos, 8,56 s |
| Regresiones frontend/API dirigidas | Salida 0; 24/24 tests, 2 archivos, 4,54 s |
| `npm run build` | Salida 0; aviso Vite por chunk JS de 625,34 kB (180,34 kB gzip), superior a 500 kB |
| Chromium público + selector Field | 3/3 tests, 25,6 s |
| `git diff --check` | Salida 0 |

Las pruebas SQL embebidas incluidas en Vitest no sustituyen Auth/PostgREST,
pgTAP del stack local ni concurrencia entre conexiones independientes.

El reviewer independiente contrastó el diff, los archivos nuevos, los tests,
las rutas, el SQL existente y el SDK instalado: sin hallazgos BLOQUEANTES,
IMPORTANTES ni otros defectos concretos. Los resultados generales anteriores
los ejecutó el coordinador; el reviewer también ejecutó `git diff --check`.
El archivo untracked `tructure...` se conserva. No se hizo commit, push, merge
ni deploy. No hay acciones pendientes de autorización dentro del alcance local;
queda ejecutar el stack real cuando Docker esté disponible.

## Evidencia del CI anterior

En el [run 38977702824](https://github.com/nik-ilin/Hackathon-AImpacto/actions/runs/38977702824)
el job `quality` terminó correctamente. El job Supabase superó pgTAP, lint SQL,
advisors, concurrencia e integración Auth/REST, pero `test:e2e:local` agotó los
120 segundos del test de colaboración en dos intentos. El error de cierre de
`BrowserContext` en el `finally` ocultó la acción original. No hay un artifact
remoto recuperable que permita asegurar cuál fue la acción bloqueada histórica.

Existe una causa concreta reproducible en el código de esa revisión:
`getByLabel("Disciplina", { exact: true })` no encuentra el `<select>` renderizado
por `Field`. El `<label>` envolvente incluye el texto de las opciones.
En Chromium, con ese markup, el locator encuentra **0** elementos;
`getByRole("combobox", { name: "Disciplina", exact: true })` encuentra **1**.
El paso afectado es la selección de disciplina de la colaboradora, después de
crear el grupo y completar ambos registros. Es consistente con el log anterior,
pero la falta del error original impide atribuirle con certeza ambos timeouts.

Se corrige ese locator y se añade `tests/e2e/field-select.spec.ts`, que renderiza
el componente `Field` real con opciones y comprueba selección en Chromium. Esta
regresión aislada comprueba el selector; no sustituye al E2E con Supabase real.

## Diagnóstico del siguiente fallo

El E2E de colaboración conserva el límite total de 120 segundos. Las acciones
tienen límite de 15 segundos, las navegaciones de 20 y las aserciones de 10.
Cada fase aparece como `test.step`. Los cierres de ambos contextos se intentan
con `Promise.allSettled`; si una acción ya falló, ese error original se conserva.

Ante un fallo se escribe `test-results/**/safe-diagnostics.json` con fases
iniciadas/completadas/fallidas, rutas actuales, conteos de los controles de
disciplina y eventos de error de página/red (método, ruta y estado HTTP).
GitHub Actions sube exclusivamente ese JSON, durante siete días. No se guardan
trazas, vídeos ni capturas automáticas de las sesiones Auth; el JSON no incluye
valores de inputs, query strings, fragmentos, mensajes brutos, headers ni bodies.
Las capturas explícitas de la landing pública tampoco se suben en ese artifact.

## Comprobaciones reproducibles

Sin backend (Chromium instalado):

```sh
npx playwright test tests/e2e/field-select.spec.ts tests/e2e/public.spec.ts --workers=1 --retries=0
```

Resultado local: **3 passed (25.6s)**; se ejecutaron la regresión de disciplina,
la landing responsive y la explicación de configuración ausente.

Con Docker y Supabase local real:

```sh
npm run db:start
npm run db:reset
npm run test:db
npm run test:concurrency
npm run test:integration
npm run test:e2e:local -- --grep collaboration --workers=1 --retries=0
npm run test:e2e:local
```

El runner pasa los argumentos adicionales a Playwright y admite únicamente un
backend en loopback. El test registra dos cuentas reales, completa perfiles,
crea el grupo, busca por texto/disciplina, solicita y aprueba la incorporación,
verifica permisos y comparte un proyecto privado. No usa mocks de Supabase.

En el entorno de esta corrección no hay Docker/Supabase local disponible:
`test:integration` y `test:e2e:local` terminan con código **1** indicando
«Supabase local no disponible»; `test:db` y `test:concurrency` terminan con código
**1**, `ECONNREFUSED 127.0.0.1:54322`. Esas suites con backend no se han ejecutado
y el flujo completo debe verificarse con los comandos anteriores o en CI.
Los cambios de aplicación se verifican además con regresiones de frontend,
`npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
