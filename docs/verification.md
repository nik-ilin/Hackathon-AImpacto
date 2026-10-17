# Evidencia de verificación: Raúl y base de integración

Fecha de trabajo: 17 de octubre de 2026. Cambios **locales y sin commit** en la rama `codex/raul-scholarships`, checkout `/private/tmp/nexolab-raul`. No se han aplicado migraciones a una base compartida, desplegado Edge Functions ni activado Make.

## Git y base

Se leyó `AGENTS.md`, se inspeccionó Git y se ejecutó `git fetch origin --prune`. `origin/feature/bootstrap-infrastructure` sigue en `8d8eb8d`; `origin/fix/m1-review-findings` está en `9720384` y contiene correcciones posteriores; `origin/codex/matching-diagnostics-feedback` está en `69f5613`. `origin/feature/judy-recopilador` (`6f80877`) parte de `main` y no integra esas ramas. El checkout Raúl parte de `fix/m1-review-findings` y porta el diff de matching, resolviendo los conflictos de proyecto y E2E. La carpeta original tiene `.git` de solo lectura en este entorno; por eso se usa un checkout local aislado. No se ha hecho merge, commit ni push.

Judy se revisó como código en desarrollo: contiene adaptadores y un tipo `FundingOpportunity`, pero invoca RPC no presentes (`judy_upsert_opportunities`, `judy_record_run`) y su script de servidor no tiene el archivo de entrada esperado. Raúl comparte las columnas generales de `opportunities`; `scholarship_details` conserva los requisitos específicos de estudiante. No se afirma que Judy funcione por esta integración.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `npm ci --offline --no-audit --no-fund` | 279 paquetes instalados desde caché; código 0. |
| `npm run typecheck` | Código 0. |
| `npm run lint` | Código 0, sin avisos. |
| `npm test` | **105/105 pruebas en 11 archivos**, código 0. Incluye migraciones reales en PGlite, M1/matching, extracción Raúl, fechas, requisitos desconocidos, secreto ausente, tres fixtures oficiales, RLS, deduplicación, cambio de plazo, versión e idempotencia de RPC. |
| `npm run build` | Código 0. Vite produjo un chunk de 651.14 kB y avisó por superar 500 kB. |
| `git diff --check` | Código 0. |

La revisión independiente detectó y se corrigieron: IDs de seed distintos de la ingesta, plazo fijo que impedía actualizaciones, fecha sin hora con offset incorrecto, perfil `student` marcado compatible con Grado/Máster, ficha visible tras fallo de extracción y auditoría separada del upsert. El RPC ahora registra catálogo, versión y resultado por fuente en una transacción. El contenido de origen se representa por hash; los cambios de la página quedan en la versión del catálogo sin copiar el texto íntegro.

## Fuentes y demo

Las tres fichas de `supabase/seed.sql` son **fixtures locales**, no ingestas reales. Enlaces y plazos se comprobaron el 17 de octubre de 2026 en páginas oficiales: [IMDEA Energía](https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/) (7 de noviembre), [UPM](https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura) (26 de octubre, 14:00 Madrid) y [RTVE](https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml) (16 de diciembre). Las tres fechas eran posteriores al día de revisión. `tests/database/raul.test.ts` aplica la migración y seed en PGlite y exige tres fixtures con HTTPS y plazo posterior al 17 de octubre. Las APIs de BOE y BDNS están registradas con estado `planned`; no se ingieren aún.

## Pendiente para validación completa

- Docker, Podman, Supabase CLI y Deno no están disponibles en PATH en este entorno. **No se ejecutaron** `supabase start`, `supabase db reset`, pgTAP, integración Auth/PostgREST, concurrencia con conexiones independientes ni E2E sobre el stack local. PGlite verifica SQL pero no sustituye esas pruebas.
- No se configuraron ni leyeron secretos de Firecrawl, Supabase remoto o `RAUL_TRIGGER_TOKEN`; **no se ejecutó una ingesta manual real** ni una petición HTTP al Edge Function. La prueba de secreto cubre la comparación usada por el handler, no un servidor desplegado.
- La migración nueva y la función necesitan revisión y autorización antes de aplicarse/desplegarse en la base compartida. Después se debe ejecutar una ingesta manual con credenciales backend, comprobar el resumen y enlaces, y solo entonces programar Make. Ver [guía Raúl](raul.md).

La comprobación de plazos es puntual. UPM vence pronto y las fichas deben volver a verificarse tras activar el recolector. Una extracción fallida pasa a revisión; la ausencia de una oportunidad en un lote no la cierra.
