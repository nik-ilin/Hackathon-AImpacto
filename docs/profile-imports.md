# Importación de perfil

La sección «Importar perfil» está disponible en `/onboarding` y `/profile` dentro del mismo formulario. ORCID consulta datos públicos; LinkedIn usa exclusivamente archivos ZIP/CSV que la persona descargó de su cuenta. Ambos muestran una vista previa editable. Ningún dato importado llega a Supabase hasta que la persona selecciona campos, pulsa «Aplicar selección al formulario» y guarda el perfil. La visibilidad sigue siendo privada al crear un perfil.

## ORCID

La función `profile-orcid` de Supabase Edge recibe un iD o URL ORCID, comprueba formato y checksum ISO 7064 MOD 11-2, valida la sesión del usuario y solicita un token `/read-public` con credenciales alojadas **solo en la función**. Usa la [API pública v3.0 de ORCID](https://info.orcid.org/documentation/api-tutorials/api-tutorial-searching-the-orcid-registry/) y procesa únicamente los campos públicos. No hay OAuth de usuario ni verificación de titularidad: un iD introducido manualmente es una referencia, no una identidad verificada.

El esquema actual permite proponer nombre, institución, país, biografía y ORCID. Las afiliaciones, la formación, los empleos y un resumen de publicaciones se muestran solo como contexto cuando existen; no se concatenan a la biografía. Las palabras clave solo sugieren disciplinas existentes si coinciden exactamente con una disciplina canónica. No se inventan competencias a partir de palabras clave.

Para probar la función localmente, inicia Supabase y copia `supabase/functions/.env.example` a `supabase/functions/.env` sin versionar. Introduce allí `ORCID_CLIENT_ID` y `ORCID_CLIENT_SECRET` de la [API pública de ORCID](https://info.orcid.org/documentation/api-tutorials/api-tutorial-obtaining-credentials-and-an-access-token/), y ejecuta `npx supabase functions serve profile-orcid --env-file supabase/functions/.env`. En un entorno alojado, configura esos mismos secretos directamente en Supabase; este repositorio no los contiene. Sin credenciales, la consulta muestra un error explícito; las pruebas con mocks siguen verificando normalización y fallos de red/API, pero no demuestran una llamada real a ORCID.

## LinkedIn

LinkedIn indica la ruta **Configuración y privacidad > Privacidad de datos > Descargar tus datos** en su [ayuda de exportación](https://www.linkedin.com/help/linkedin/answer/a1339364/auf-ihre-kontodaten-zugreifen). El navegador analiza localmente archivos reconocidos, con límites de tamaño y estructura; no envía ni conserva el archivo original. Solo se proponen campos presentes con un mapeo fiable. Empleos y estudios pueden aparecer como contexto, pero el esquema no dispone de tablas/campos para guardarlos. No se crea una conexión automática a LinkedIn.

[Sign In with LinkedIn mediante OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) da acceso al perfil básico, no a la experiencia, la formación o las competencias. La [API de portabilidad para miembros europeos](https://www.linkedin.com/help/linkedin/answer/a6214075) sería una integración distinta, sujeta a la habilitación correspondiente. Esta funcionalidad no usa scraping, cookies de LinkedIn ni credenciales de acceso del usuario.

## Comprobaciones

`npm run typecheck`, `npm run lint`, `npm test` y `npm run build` validan el cliente y los normalizadores con datos controlados. Con Docker, el job `supabase` de GitHub Actions inicia el stack local y ejecuta las comprobaciones de Auth/PostgREST/E2E existentes. Las pruebas de la función Edge usan un usuario real del Auth local para verificar rechazo de sesión e identificadores inválidos; las respuestas de ORCID se prueban mediante mocks y no requieren credenciales ni API remota.
