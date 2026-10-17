# Raúl: becas y prácticas de investigación

## Alcance y contrato con Judy

El catálogo compartido `opportunities` usa `(source_id, external_id)` como identidad estable y guarda tipo, título, entidad, resumen breve, URL oficial, solicitud, bases, apertura, plazos, estado, fecha de comprobación, hash, versión y procedencia. Judy podrá escribir oportunidades generales cuando su pipeline y sus RPC estén terminados y revisados. La rama `feature/judy-recopilador` no es una dependencia ejecutable de Raúl. Los requisitos de estudiantes viven en `scholarship_details`; no se fuerzan en `FundingOpportunity` de Judy.

La vista `/scholarships` lee Supabase con el usuario autenticado. RLS publica solo fichas abiertas con plazo vigente y oculta extracciones pendientes de revisión. La comparación usa únicamente el perfil propio. `student` en `profiles.academic_stage` no acredita Grado ni Máster; esos casos quedan **desconocidos**. Tampoco se deduce residencia, matrícula ni titulación a partir de una capacidad o tema declarado.

## Fuentes y límites

| Fuente | Método | Frecuencia | Estado inicial | Condiciones |
| --- | --- | --- | --- | --- |
| [IMDEA Energía 2027](https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/) | Firecrawl, página oficial | 24 h | Activa | [Aviso legal](https://energia.imdea.org/en/legal-notice-and-terms-of-use/) |
| [UPM, metrología](https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura) | Firecrawl, página oficial | 12 h | Activa | [Aviso legal](https://www.upm.es/upm/webupm/avisolegal) |
| [RTVE, TFM 2026](https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml) | Firecrawl, página oficial | 24 h | Activa | [Aviso legal](https://www.rtve.es/comunes/aviso_legal.html) |
| [BOE sumario](https://www.boe.es/datosabiertos/api/api.php?lang=es) | API estructurada | 24 h | Planificada, sin ingesta | [Reutilización](https://www.boe.es/informacion/aviso_legal/index.php) |
| [BDNS](https://www.infosubvenciones.es/bdnstrans/doc/swagger) | API estructurada | 24 h | Planificada, sin ingesta | [Reutilización](https://www.pap.hacienda.gob.es/bdnstrans/L120846/es/avisolegal) |

Las tres páginas activas se usan porque no se halló una API adecuada para esas convocatorias concretas. El proceso guarda hechos breves, URLs, patrones de evidencia y hash del contenido normalizado, sin copiar bases o páginas completas. BOE y BDNS están registrados para integración futura; su estado `planned` impide que el disparador los procese o que se afirme que ya funcionan. Los plazos de las tres fichas de la demo se comprobaron en las páginas oficiales el 17 de octubre de 2026: IMDEA 7 de noviembre, UPM 26 de octubre a las 14:00 (Madrid), RTVE 16 de diciembre. La semilla local está marcada `seed_fixture`; no equivale a una ingesta en producción.

Una ejecución acepta `max_sources` de 1 a 5, pero solo hay tres fuentes activas y el límite interno es **tres páginas y tres créditos estimados**. Firecrawl se invoca con proxy `basic` (un crédito por página según [su documentación](https://docs.firecrawl.dev/features/stealth-mode)); no se usa `auto`, que puede escalar a cinco. Cada llamada vence a los 12 s. El lote síncrono cabe en el límite de petición de [Supabase Edge Functions](https://supabase.com/docs/guides/functions/limits) con este tope. Se registra crédito estimado; `credits_measured` queda nulo mientras Firecrawl no lo reporte de forma fiable.

## Identidad, cambios y fallos

Se usa el identificador externo oficial cuando consta. Si no existe, el ID es `url:` más la URL HTTPS oficial canónica: host en minúscula, sin fragmento ni parámetros de seguimiento, con parámetros sustantivos conservados y ordenados, sin barra final. La unicidad SQL `(source_id, external_id)` evita duplicados. El RPC hace upsert, versionado y registro de resultado de fuente en una transacción. Un cambio en hechos o en el hash normalizado de la página incrementa `content_version` y conserva `opportunity_versions`; una comprobación idéntica solo actualiza `checked_at`.

La ausencia de una ficha en un lote no la cierra. Una página que falla la extracción o escritura deja la fuente y sus fichas en `pending_review` y registra un código de error, sin inferir requisitos. Un plazo vencido se descarta para ese lote sin convertirlo en cierre definitivo; la vista lo excluye por fecha. Una fuente pausada aparece como descartada. Las ejecuciones se guardan en `raul_runs`, con contadores, duración y coste. Solo se permite un lote activo globalmente, que impide solapes de fuentes. La misma clave de petición devuelve el mismo `run_id`; si sigue activo responde `202`. Una ejecución caducada se informa como fallida en la consulta de estado; para reintentar el trabajo después de una falla se usa una clave nueva.

## Despliegue pendiente de autorización

1. Revisar la migración nueva `20261017020000_raul_opportunities.sql` y el diff completo. Aplicarla a la base compartida **solo tras autorización**. No se modifica la migración M1.
2. Configurar **solo en secretos de Edge Functions** `RAUL_TRIGGER_TOKEN` (exclusivo de este endpoint), `FIRECRAWL_API_KEY` y la credencial backend `SUPABASE_SERVICE_ROLE_KEY`. Las variables `VITE_` son públicas y jamás contienen esas claves. Supabase provee `SUPABASE_URL` a la función. No copiar valores a documentación o Make, salvo el token de disparo en el header privado del escenario.
3. Desplegar `raul-trigger` con `verify_jwt=false` de `supabase/config.toml`. El handler valida siempre `x-raul-trigger-key`; JWT desactivado permite llamadas desde Make sin sesión Supabase. No añadir parser ni credenciales de Supabase/Firecrawl a Make.
4. Ejecutar una ingesta manual con una clave de petición nueva; consultar el `run_id` y revisar contadores, fuentes en `pending_review`, versiones y enlaces oficiales antes de activar programación.

No hay referencia del proyecto remoto en este checkout. La URL se determina sustituyendo el `PROJECT_REF` real en la ruta exacta de Supabase: `https://<PROJECT_REF>.supabase.co/functions/v1/raul-trigger`. La URL local, cuando Supabase esté iniciado, es `http://127.0.0.1:54321/functions/v1/raul-trigger`.

## Los cuatro datos para Make

| Dato | Valor |
| --- | --- |
| URL | `https://<PROJECT_REF>.supabase.co/functions/v1/raul-trigger` (sustituir la referencia real del proyecto) |
| Método y header | `POST`; `x-raul-trigger-key: <RAUL_TRIGGER_TOKEN>`; `Content-Type: application/json` |
| Body | `{"mode":"incremental","max_sources":5,"request_id":"raul-2026-10-17-01"}`. `request_id` es opcional, pero Make debe repetir el mismo valor en reintentos del mismo disparo. Sin él se usa una clave diaria UTC. |
| Respuesta esperada | `200` con `{"run_id":"<uuid>","status":"completed","summary":{"sources_reviewed":3,"created":0,"updated":0,"unchanged":3,"discarded":0,"errors":0,"duration_ms":...,"credits_estimated":3,"credits_measured":null}}`; `207` si el lote es parcial. Los contadores ilustrativos no son un resultado ejecutado. |

Consultar `GET https://<PROJECT_REF>.supabase.co/functions/v1/raul-trigger?run_id=<uuid>` con el mismo header para ver el estado persistido. `401` significa header ausente o token incorrecto; `429` significa lote simultáneo, reintentar más tarde con la **misma** clave de petición; `5xx` indica fallo backend o del registro de ejecución. Ante `5xx`, consultar el `run_id` si existe antes de iniciar un nuevo lote. `202` indica reintento de un lote aún en curso, no éxito final. El resumen de un reintento completado se lee de la fila persistida.
