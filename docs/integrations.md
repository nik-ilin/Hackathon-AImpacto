# Sponsors e integraciones

## Lovable

El repositorio se encontró vacío; esta aplicación es independiente. Lovable no permite importar directamente un repositorio externo como proyecto. Su integración Git crea un repositorio desde un proyecto Lovable y sincroniza su rama activa. No se ha creado otro repositorio, frontend o proyecto Lovable. Si el equipo decide usarlo después, debe revisar su flujo compatible y coordinar las ramas sin sustituir este trabajo. [Documentación oficial de sincronización](https://docs.lovable.dev/integrations/git-sync-overview).

El cliente tipado separa pantallas y backend. No hay dependencia del editor Lovable ni modificaciones de su integración Git.

## Make

Make podrá recibir eventos después del commit para notificaciones e ingesta; nunca será base de datos ni dueño de las transacciones críticas. `src/types/automations.ts` define el contrato de una cola futura, sin implementación ficticia ni webhook activo. M1 no invoca automatizaciones y registro/aprobación/creación funcionan sin Make.

Al implementar el servidor: persistir eventos en una outbox transaccional y procesarlos de forma independiente. Usar un identificador estable por evento como clave de idempotencia, guardar intentos y resultados, limitar reintentos con backoff, clasificar 4xx permanentes frente a 429/5xx recuperables y enviar a revisión los fallos definitivos. Limitar operaciones por ejecución y medir coste/latencia por escenario.

Autenticar el webhook mediante la opción API key del webhook y/o un gateway con firma HMAC, timestamp y protección de replay; no afirmar que cualquier custom webhook verifica automáticamente firmas. Nunca incluir secretos en el navegador ni enviar perfiles completos cuando bastan referencias autorizadas. Crear y verificar el escenario real antes de configurarlo. [Webhooks de Make](https://apps.make.com/gateway).

## ElevenLabs

Futuro asistente de voz para orientar onboarding, ayudar a redactar proyectos y explicar resultados ya calculados. No decide permisos ni elegibilidad y no recibe claves privadas. No se instaló su SDK ni se consumieron créditos.

Un backend autenticado podrá emitir una URL firmada de corta duración tras comprobar sesión, alcance, presupuesto y consentimiento de micrófono. Las herramientas del asistente llamarán servicios autorizados y confirmarán acciones de escritura en la interfaz. Registrar uso con minimización de datos y definir retención antes de activar voz. [Autenticación de agentes ElevenLabs](https://elevenlabs.io/docs/eleven-agents/customization/authentication).

## Firecrawl y futuras oportunidades

Solo ingesta programada del backend, preferentemente fuentes oficiales y APIs estructuradas. Sin llamadas por búsqueda, SDK o conexión activa en M1. Ver [agentes futuros](future-agents.md). Todas las credenciales futuras serán del entorno del servidor, nunca variables VITE.
