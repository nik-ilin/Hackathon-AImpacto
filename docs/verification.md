# Evidencia de verificación: diagnóstico de incorporación

## Base y rama

Base solicitada: `origin/feature/bootstrap-infrastructure` en `8d8eb8d2c67c9eba0195a5d9e41edb47af6d221a`. Se ejecutó `git fetch origin`; la referencia local remota coincide con ese commit y `git log 8d8eb8d..origin/feature/bootstrap-infrastructure` no mostró commits posteriores. La consulta adicional a GitHub no pudo resolver `github.com` por DNS.

La rama `codex/matching-diagnostics-feedback` se creó desde esa base en `/private/tmp/nexolab-matching`. El sandbox permite escribir en la carpeta del proyecto, pero deniega crear `.git/index.lock` en su `.git` (solo lectura); por ello no se pudo colocar la rama en el checkout original. En el momento de esta verificación, los cambios estaban sin commit. La solicitud posterior autorizó publicar la rama; no se ha fusionado ni desplegado.

## Verificaciones ejecutadas en esta revisión

- `npm run typecheck`: **superado**, código 0.
- `npm run lint`: **superado**, código 0, sin warnings.
- `npm test`: **71/71 pruebas en 6 archivos**, código 0. Incluye migraciones SQL reales aplicadas en PGlite, privacidad/RLS, propietario y admin, asociación proyecto/grupo, normalización de capacidades, separación temática, snapshots, idempotencia de impresiones, marcado de visualización, feedback explícito y la regresión del borrador ante renovación de sesión.
- `npm run build`: **superado**, código 0. Vite avisa de un chunk de **638.19 kB**; queda optimizar carga por rutas.
- La prueba E2E de colaboración existente se amplió para cubrir creación de necesidad en proyecto, perfil del candidato, diagnóstico y feedback por dos cuentas. `npm run test:e2e` se intentó, pero el sandbox denegó al servidor Vite escuchar en `127.0.0.1:5173` (`EPERM`); el flujo con backend real queda pendiente.
- `tests/database/concurrency.mjs` incluye ahora dos sesiones PostgreSQL que fuerzan concurrencia sobre la misma clave de impresión y verifican una fila de evaluación, marcado y feedback. El runner **no se ejecutó con éxito** al no haber PostgreSQL local.

## Pendiente por falta del stack local

- Docker/Podman no están disponibles en PATH. La integración Supabase se intentó y se detuvo antes de crear usuarios: Supabase local no disponible. Concurrencia se intentó y el sandbox denegó conectar a `127.0.0.1:54322` (`EPERM`). `npm run db:start`, `npm run db:reset` y pgTAP no se ejecutaron porque no hay runtime de contenedores.
- La CLI oficial no pudo crear la migración: el sandbox denegó la creación de `~/.supabase` incluso con `XDG_CONFIG_HOME` en `/private/tmp`. La migración aditiva se escribió en un archivo versionado; la migración M1 original no se modificó. Aplicación y generación de tipos mediante CLI siguen pendientes.
- La consulta de GitHub quedó limitada por DNS; los commits posteriores a la base se comprobaron contra las referencias obtenidas por `git fetch`.

No se usaron servicios ni credenciales remotas. Los runners de integración que escriben fixtures exigen loopback. El diagnóstico es personal y no expone perfiles privados a gestores; no implementa convocatorias ni APIs de financiación. La cobertura de capacidades es independiente del ranking temático existente.
