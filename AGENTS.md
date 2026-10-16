# NexoLab — instrucciones del proyecto

## Producto y arquitectura

M1 conecta perfiles, grupos, solicitudes y proyectos. Una cuenta universal puede liderar varios grupos y pertenecer a otros. `academic_stage` describe a la persona, nunca concede permisos. `research_groups.owner_id` es la única fuente de propiedad; el propietario no se duplica en membresías.

Una aplicación React + TypeScript estricto + Vite + Tailwind + React Router. Supabase Auth y PostgreSQL son la única persistencia. Organizar servicios y pantallas por feature. No simular persistencia ni éxito de integraciones ausentes. Toda autorización e integridad crítica se aplica en SQL, además de las validaciones de formularios.

## Trabajo en equipo

Para desarrollo no trivial, el hilo principal coordina auditoría de solo lectura, plan verificable, implementación delimitada y revisión independiente del código y las pruebas. Delegar a `auditor`, `implementer` y `reviewer`, evitando escrituras simultáneas en un mismo archivo. No aceptar resúmenes sin contrastar la evidencia. Corregir hallazgos importantes y volver a revisar, con máximo tres ciclos razonables antes de escalar un bloqueo persistente.

Comprobar Git antes de editar; preservar cambios existentes. Trabajar en ramas feature y no hacer commits, push, merge ni deploy sin autorización explícita. La solicitud inicial autoriza únicamente el commit mínimo para inicializar `main` vacío. Los cambios de M1 permanecen locales y revisables.

## Convenciones y seguridad

- Código modular, nombres explícitos, interfaz en español y controles HTML accesibles.
- Cliente Supabase tipado desde `src/types/database.ts`; revisar/regenerar tipos al cambiar SQL.
- Migraciones versionadas creadas con la CLI oficial. RLS y grants mínimos en todas las tablas expuestas.
- RPC transaccionales para cambios de solicitudes y escrituras con taxonomía. Bloqueos consistentes, unicidad de pendientes/membresías y estado terminal inmutable.
- `SECURITY DEFINER` solo para operaciones que lo necesitan: esquema privado, identidad y autorización comprobadas, referencias cualificadas, `search_path` seguro y EXECUTE restringido. Wrappers públicos con invoker.
- No usar `user_metadata` para permisos. No buscar, copiar, mostrar o modificar secretos; nunca editar `auth.json` ni configurar API keys por iniciativa propia.
- Variables VITE solo públicas. Nunca secret keys, contraseñas, service_role ni credenciales remotas en frontend, Git o logs.
- Sin borrados destructivos de historial científico; sin cambios remotos, migraciones de producción ni infraestructura remota.
- Sin scraping/LLM por búsqueda, Redis, microservicios ni agentes futuros en M1.

## Calidad y entrega

Ejecutar `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Con Docker: iniciar Supabase, aplicar migraciones locales, ejecutar pgTAP, integración Auth/REST, concurrencia con conexiones independientes y E2E. No declarar superada una prueba no ejecutada. PostgreSQL embebido no sustituye la prueba del stack Auth/PostgREST ni la concurrencia real.

Documentar cambios, archivos, resultado exacto de pruebas, revisión independiente, riesgos, limitaciones y acciones pendientes. Sin Docker, completar todo lo independiente y dejar CI/pruebas locales reproducibles.

## Autonomía y escalado

Clasificar antes de escalar: `CONTINUE_AUTONOMOUSLY` para investigación, bugs, tests, lint, tipos, build y decisiones conservadoras reversibles; resolverlos sin interrumpir. `NEEDS_USER_DECISION` solo cuando no exista alternativa segura y reversible y la decisión afecte materialmente producto, arquitectura, compatibilidad, datos, permisos, seguridad, costes, infraestructura o una acción irreversible. No solicitar otra vez una autorización ya dada.

Para una decisión humana bloqueante, explicar alternativas/recomendación, usar una sola vez la skill `telegram-escalation` sin secretos y esperar aprobación en Codex; Telegram solo avisa. Continuar el trabajo independiente. Informar fases con Comprendiendo, Auditando, Planificando, Implementando, Ejecutando pruebas, Revisando, Corrigiendo, Terminado o Bloqueado.
