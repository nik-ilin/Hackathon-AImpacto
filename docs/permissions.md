# Permisos e invariantes

| Recurso/operación      | Público                  | Usuario propio                           | Propietario del grupo      | Admin del grupo        | Miembro            |
| ---------------------- | ------------------------ | ---------------------------------------- | -------------------------- | ---------------------- | ------------------ |
| Leer perfil            | Solo perfil público      | Sí                                       | Sin excepción a privacidad | Sin excepción          | Sin excepción      |
| Editar perfil          | No                       | Sí                                       | Solo propio                | Solo propio            | Solo propio        |
| Leer grupo             | Solo grupo público       | Según relación                           | Sí                         | Sí                     | Sí                 |
| Editar grupo           | No                       | Si es propietario                        | Sí                         | No                     | No                 |
| Solicitar entrada      | No                       | A grupo público abierto, si no pertenece | No a su grupo              | No si ya pertenece     | No si ya pertenece |
| Ver solicitud          | No                       | Propia                                   | Sí en su grupo             | Sí en su grupo         | Solo propia        |
| Aprobar/rechazar       | No                       | Nunca autoaprobar                        | Sí en su grupo             | Sí en su grupo         | No                 |
| Cancelar solicitud     | No                       | Propia pendiente                         | Solo si es solicitante     | Solo si es solicitante | Propia pendiente   |
| Leer proyectos         | Público de grupo público | Según relación                           | Sí                         | Sí                     | Sí                 |
| Crear/editar proyectos | No                       | Según relación                           | Sí                         | Sí                     | No                 |

RLS protege también las relaciones de temas, evitando filtrar proyectos o perfiles privados indirectamente. Grants y policies se definen juntos; ningún rol cliente puede escribir directamente el historial de solicitudes o fabricarse una membresía. El propietario no se duplica como miembro y `owner_id` no se cambia mediante edición.

Las RPC verifican identidad real mediante `auth.uid()`, relación con el grupo y estado actual. Las operaciones transaccionales bloquean filas en orden consistente. Solo una solicitud pendiente puede existir por pareja; aprobar de nuevo no duplica miembros. Rechazo/cancelación son terminales y preservan historial.

Funciones privilegiadas se mantienen en esquema privado con `search_path` seguro y referencias cualificadas. Los endpoints públicos usan wrappers con invoker y EXECUTE restringido. Helpers de autorización consultan las tablas reales y evitan recursión RLS; no aceptan metadatos editables como permisos.

M1 no ofrece transferencia de propiedad, borrado de historial, elevación libre de roles ni administración global. Añadir esas capacidades exige diseño y pruebas de permisos específicos.

Pruebas: Vitest ejecuta migraciones reales sobre PostgreSQL embebido con roles/identidad controlados; pgTAP y pruebas Auth/REST/concurrencia se ejecutan con Supabase local. Los stubs de identidad del entorno embebido no prueban Supabase Auth.

## Necesidades y diagnósticos personales

| Recurso/operación | Usuario autenticado sin relación | Propietario | Admin | Miembro | Autor del diagnóstico |
| --- | --- | --- | --- | --- | --- |
| Leer necesidad | Si grupo y proyecto asociado son públicos | Sí | Sí | Si puede leer el grupo y proyecto | Sí, si puede leer la necesidad |
| Crear/editar necesidad | No | Sí | Sí | No | No |
| Diagnosticar capacidades propias | No | Sobre perfil propio | Sobre perfil propio | Sobre perfil propio | Sí |
| Leer evaluación o feedback | No | No por gestionar el grupo | No por gestionar el grupo | No por ser miembro | Sí |
| Registrar feedback | No | No | No | No | Solo en evaluación mostrada propia |

No se consultan perfiles privados de terceros ni se recomiendan candidatos. Abrir futuras recomendaciones de personas requeriría autorización de visibilidad y preferencia explícita de participación. Una necesidad asociada a proyecto privado permanece invisible a quien no puede leer ese proyecto, aunque el grupo sea público.
