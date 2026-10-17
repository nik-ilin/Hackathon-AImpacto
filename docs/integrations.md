# Integraciones: estado de la consolidación backend

La integración local actual de Lovable, Make, Raúl y Judy se describe en [lovable-backend-handoff.md](lovable-backend-handoff.md), con evidencia y límites en [backend-readiness.md](backend-readiness.md). Supabase existente es la única persistencia y Auth. No se ha creado otro proyecto, conectado el frontend Lovable, desplegado funciones ni creado escenarios Make externos.

Judy se ejecuta preferentemente con GitHub Actions y persistencia durable; Make dispara/consulta Actions con token GitHub limitado. Raúl expone Edge con token privado de trigger. Lovable solo usa clave pública y JWT de usuario. Firecrawl y ORCID guardan credenciales en servidores. No ejecutar el SQL aislado de Judy además de las migraciones canónicas.

ElevenLabs y otras integraciones futuras siguen sin implementarse. No existe ningún webhook o escenario externo ficticio con resultado simulado.
