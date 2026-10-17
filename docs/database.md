# Modelo de datos

| Tabla               | Responsabilidad                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| profiles            | Perfil de `auth.users`, visibilidad, etapa descriptiva, competencias, ORCID; sin contraseña ni copia del email |
| research_groups     | Propietario único, institución, visibilidad, apertura a incorporaciones                                        |
| group_memberships   | Colaboradores aceptados admin/member; pareja grupo/usuario única; excluye propietario                          |
| group_join_requests | Historial pending/approved/rejected/cancelled, decisión y actor                                                |
| research_projects   | Proyectos asociados al grupo, estado, visibilidad y necesidad de financiación                                  |
| topics              | Taxonomía canónica extensible con parent_id                                                                    |
| profile_topics      | Intereses N:M                                                                                                  |
| group_topics        | Disciplinas N:M                                                                                                |
| project_topics      | Temáticas N:M                                                                                                  |

UUID, foreign keys y restricciones impiden referencias rotas, financiación negativa, moneda incoherente, estados inválidos y duplicidad de solicitudes pendientes. Se restringen borrados que eliminarían historial. `updated_at` se mantiene desde SQL.

Índices cubren propietarios, membresías por usuario, solicitudes por grupo/estado/solicitante y relaciones por tópico. Competencias usan array consultable e índice GIN. La búsqueda y recomendaciones se calculan en SQL con límites de paginación; cada recomendación devuelve los nombres de los temas coincidentes. No se interpreta como una puntuación científica.

La migración contiene la taxonomía de referencia; `supabase/seed.sql` permanece deliberadamente sin datos de demostración. No se inventan personas, grupos, proyectos u oportunidades. Los usuarios de prueba viven únicamente en fixtures y bases locales de test. Un reset local elimina los datos locales: guardar previamente lo que se quiera conservar.

Crear futuras migraciones con `npx supabase migration new nombre_descriptivo`. No editar migraciones ya aplicadas a un entorno compartido; añadir otra migración y revisión de seguridad. Los tipos iniciales se mantienen junto al contrato y deben contrastarse con `npm run db:types` una vez disponible el stack local. Ese comando imprime los tipos y permite revisarlos antes de reemplazar el archivo.

## Necesidades y diagnóstico de incorporación

La migración `20261017010000_matching_diagnostics_feedback.sql` añade `recruitment_needs`, asociable a grupo y opcionalmente a un proyecto de ese mismo grupo. `required_skills` expresa capacidades demandadas; se normaliza para comparación por minúsculas, espacios y duplicados. Los valores existentes de `profiles.skills` se conservan y normalizan solo en la evaluación. `topics` y las relaciones `profile_topics`, `group_topics` y `project_topics` siguen siendo exclusivamente temáticas.

`recommendation_events` conserva por actor la necesidad, clave idempotente, versión `skills-coverage-v1`, contexto de entrada y evaluación calculada por SQL. `shown_at` se establece solo después de renderizar la evaluación. La cobertura es nula si no hay requisitos y nunca se deduce de los temas. `recommendation_feedback` registra solo una respuesta explícita por evaluación; no responder no representa rechazo. Las evaluaciones y feedback son privados para su autor. No existe catálogo de convocatorias ni se implementan APIs de financiación en esta entrega.


## Catálogo canónico consolidado

La migración `20261017093053_funding_catalog_judy.sql` añade `funding_details`, `judy_runs` y `judy_run_batches` después de matching/Raúl. Conserva las migraciones publicadas. Raúl y Judy comparten `opportunities`, `opportunity_sources` y `opportunity_versions`; financiación no se guarda en scholarship_details. El SQL aislado de agents/judy/sql es legado, no se aplica además del canónico.

Judy usa claim global con lease renovable, token de propietario solo en servidor, lotes idempotentes y snapshots factuales. La identidad `(source_id,external_id)` se serializa incluso si aún no existe la fila. Reintentar un request o batch con datos diferentes falla explícitamente. El hash no confía en el valor enviado por el agente y excluye cambios de comprobación/estado temporal o raw. Los metadatos íntegros viven en financiación y el raw auditado; no se pierden por límites de becas. Una ejecución expirada queda terminal, sin recollect automático bajo la misma clave.

La lectura autenticada exige fuente activa, checked_at de los últimos14días sin futuro y plazo vigente. Las oportunidades próximas llevan forthcoming, nunca open por defecto. Fuentes con fallos no refrescan información no comprobada. Ver contrato y pasos de despliegue en lovable-backend-handoff.md.
