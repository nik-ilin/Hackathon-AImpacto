# Evidencia de verificación M1

Entorno Windows/PowerShell, Node 24.14.1, npm 11.11.0. Fecha local: 17 de octubre de 2026. Repositorio inicialmente vacío; el único commit realizado es `e138871` para inicializar `main`, autorizado por la solicitud. La implementación permanece sin commit en `feature/bootstrap-infrastructure`.

## Ejecutado

- Instalación npm con dependencias fijadas y lockfile: correcta; auditoría npm, **0 vulnerabilidades**.
- Vitest final: **45/45 pruebas superadas en 3/3 archivos**, código de salida 0, duración 19,59 s. Incluye **16 SQL/PGlite**, **23 validaciones** y **6 componentes/hooks**. El SQL ejecuta la migración real con roles anon/authenticated y `auth.uid()` de prueba; el reviewer también ejecutó esta suite.
- TypeScript: `npm run typecheck`, **código de salida 0**.
- Chromium público: **2 pruebas superadas, 1 omitida**. Verifica landing, navegación, viewport móvil sin desbordamiento horizontal, ausencia de errores JavaScript e instrucciones reales cuando falta backend. Se inspeccionaron visualmente capturas de escritorio y móvil.
- ESLint: `npm run lint`, **código de salida 0, sin warnings**; no se desactivaron reglas para ocultar fallos.
- Build de producción: `npm run build`, **código de salida 0**, duración 5,14 s. Aviso de Vite por chunk JavaScript de **622,25 kB** (179,38 kB gzip); optimización futura mediante carga por rutas. No se elevó el límite del aviso.
- La sintaxis de los runners de integración y concurrencia se comprobó con Node; `git diff --check` terminó con código de salida 0.

Las pruebas unitarias de componentes/hooks comprueban controles etiquetados, paginación, mensajes, explicaciones SQL y protección ante respuestas obsoletas; no se presentan como evidencia de persistencia remota.

## Comprobaciones preparadas, sin resultado de éxito

| Comprobación                                         | Estado observado                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run db:start`                                   | No puede iniciar: `DockerLifecycleInspectError`, Docker/Podman no disponible en PATH            |
| pgTAP, 21 aserciones                                 | `DbConnectError` / `ECONNREFUSED 127.0.0.1:54322`; no hay PostgreSQL local iniciado             |
| Concurrencia multiconexión                           | `ECONNREFUSED 127.0.0.1:54322`; script listo con tres conexiones y espera explícita de bloqueos |
| Integración Auth + REST + RPC                        | Runner falla antes de crear usuarios: Supabase local no disponible                              |
| Colaboración completa en Chromium                    | Omitida en modo sin backend; preparada mediante `npm run test:e2e:local`                        |
| CLI lint/advisors, tipos generados y workflow GitHub | Requieren stack local/runner; configuración no equivale a ejecución superada                    |

No se utilizaron credenciales ni servicios remotos. Los runners que escriben fixtures rechazan hosts fuera de loopback. No se han modificado datos de producción, aplicado migraciones remotas, hecho push/merge ni desplegado.

## Cobertura del flujo

La suite SQL cubre creación de grupo, descubrimiento por disciplina, solicitud, recepción, aprobación repetida, membresía única, consulta de grupos propios, denegación de gestión/decisión a terceros, rechazo de autoentrada, acceso privado a proyectos, asociación de proyectos, administradores por relación, historial de rechazo/cancelación, rollback por taxonomía inválida y constraints. Incluye campos opcionales nulos enviados por la interfaz, bloqueo de propiedad/timestamps forjados, financiación inválida y competencias incoherentes.

El registro real en Supabase Auth y la concurrencia entre conexiones independientes **no están demostrados por PGlite**. La definición de done completa necesita ejecutar la segunda batería con Docker y resolver cualquier hallazgo que aparezca.

## Revisión independiente

El reviewer inspeccionó archivos nuevos reales, migración, políticas/grants, funciones, contratos, frontend, pgTAP, runners, CI y documentación. Ejecutó independientemente **45/45 tests**, TypeScript y ESLint con código de salida 0. Revisión global: **sin hallazgos BLOQUEANTES o IMPORTANTES**. Se corrigieron los cuatro literales UTF-8 señalados como hallazgo menor.

El reviewer volvió a comprobar los literales UTF-8 y el reinicio de estado al cambiar de grupo: **ningún hallazgo BLOQUEANTE, IMPORTANTE o MENOR permanece abierto**.

Se detectó una edición simultánea de `.env.example` con configuración pública remota. Se preservó íntegra en `.local/env-example.bc09dc88-a917-4aa3-a74b-da9906d16f85.bak` (ignorado por Git y verificado por hash) antes de restaurar la plantilla local genérica, conforme a la elección posterior del usuario; no se usaron sus valores.
