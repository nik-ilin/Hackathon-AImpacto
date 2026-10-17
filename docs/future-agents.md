# Becas y financiación después de M1

Los dos agentes compartirán una base normalizada de oportunidades. El agente de oportunidades atiende estudiantes y nuevos investigadores; el de financiación compara convocatorias con proyectos y grupos, sus temas, institución, país, fase e importe requerido.

Flujo previsto: fuentes oficiales/APIs → ingesta programada → normalización/deduplicación → PostgreSQL → filtros duros de elegibilidad → matching semántico cuando aporte valor → explicación opcional por LLM. La búsqueda de usuarios solo lee datos persistidos.

Futuras entidades, aún no creadas: `sources`, `source_versions`, `ingestion_runs`, `opportunities`, `eligibility_rules`, `opportunity_topics`, `project_matches`. Guardar URL oficial, origen, identificador externo, contenido normalizado, hash, idioma, fecha de publicación, plazo, moneda, país/institución, última verificación y siguiente actualización.

Preferir API estructurada. Firecrawl será un adaptador del proceso de ingesta para fuentes que requieran scraping; respetar condiciones de acceso y no prometer fuentes disponibles sin verificar. Deduplicar por identificador de fuente y hash de contenido, conservar versiones y no reprocesar documentos idénticos. No introducir ahora su SDK ni consumir créditos.

Elegibilidad determinista antes de cualquier modelo: país, etapa académica, institución, fechas, disciplina, tipo de beneficiario e importes. Distinguir incompatibilidad de información desconocida. Registrar versión de reglas y explicación de exclusión. No usar etapa académica como autorización.

Instrumentación futura por ejecución: fuente, versión/hash, inicio/fin, estado, latencia, documentos nuevos/cambiados/omitidos, llamadas externas, modelo, tokens, coste monetario y presupuesto. Establecer límites por fuente, reintentos con backoff, actualización según caducidad y alertas de frescura. Crear embeddings solo para contenido nuevo que los necesite, con versión de modelo; evitar recalcularlos por consulta.

Las recomendaciones M1 ya usan relaciones canónicas de temas. El futuro matching puede consumirlas sin reemplazar grupos, proyectos, identidades o permisos.
