# Decisiones M1

1. **Monolito de frontend con backend Supabase.** El repositorio estaba vacío y no tenía código Lovable. Se eligió React/Vite sin crear una segunda aplicación ni infraestructura adicional.
2. **Node 24 y versiones fijadas.** Se comprobaron versiones actuales y requisitos de Node en npm antes de instalar; package-lock permite instalación reproducible. Vite 8, React 19, Router 7, Tailwind 4 y Supabase JS 2 son compatibles con el Node disponible.
3. **Una cuenta universal.** `academic_stage` es descriptivo. La relación por grupo determina permisos y un estudiante puede ser propietario.
4. **Propiedad sin duplicación.** `owner_id` es único origen de propiedad. Membresías excluyen al propietario.
5. **RPC compuestas y transaccionales.** Evitan escritura parcial de taxonomía y aprobación no atómica. Estado terminal e índices únicos refuerzan idempotencia.
6. **Taxonomía N:M.** Identificadores canónicos sirven para filtros, recomendaciones explicables y matching futuro.
7. **Privacidad conservadora.** Perfiles privados por defecto; proyectos privados de grupos privados no se exponen mediante enlaces de temas. No se implementan transferencias ni borrados de historial.
8. **Sin agentes ni SDK de sponsors en M1.** Solo puntos de integración donde hay una responsabilidad real; ninguna llamada a modelos, scraping, Make o ElevenLabs.
9. **Verificación en dos niveles.** Sin Docker/psql disponibles, se prueba SQL real con PGlite; Supabase completo, Auth/REST y concurrencia multiconexión se preparan para Docker/CI. No se confunden ambas evidencias.
10. **Git local.** Se creó el commit mínimo inicial de `main` solicitado expresamente, y la implementación se desarrolla en `feature/bootstrap-infrastructure` sin push, merge o despliegue.

Consulta técnica: [Vite](https://vite.dev/guide/), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [CLI](https://supabase.com/docs/reference/cli/introduction). El changelog se revisó antes de implementar; los avisos recientes sobre TLS y extensiones PostgreSQL no requieren nuevas integraciones para este dominio.
