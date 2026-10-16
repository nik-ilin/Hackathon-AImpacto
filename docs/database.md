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
