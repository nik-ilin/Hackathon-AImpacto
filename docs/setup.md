# Puesta en marcha en Windows / PowerShell

## Requisitos

- Git, Node.js 24.x y npm (se verificó Node 24.14.1 / npm 11.11.0).
- Docker Desktop con motor Linux iniciado para el stack Supabase oficial. La CLI está fijada como dependencia de desarrollo; no requiere instalación global.
- Puertos libres: frontend 5173, API 54321, PostgreSQL 54322 y Studio 54323. La configuración generada por CLI está en `supabase/config.toml`.

## Instalar y ejecutar

Desde el directorio del repositorio:

```powershell
npm ci
npm run db:start
npm run db:reset
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

`db:reset` usa **solo el stack local** y elimina sus datos antes de aplicar todas las migraciones y seed. No ejecutarlo si se necesitan conservar datos locales sin exportarlos antes. No hay comandos de producción en este flujo.

En `.env.local`, configurar `VITE_SUPABASE_URL=http://127.0.0.1:54321` y la clave pública del stack local. La salida de `db:start` identifica las claves públicas; usar publishable (o anon compatible), nunca secret ni service_role. No pegar claves en Git, chat o logs. Reiniciar Vite después de cambiar variables.

Abrir `http://127.0.0.1:5173`. Sin configuración se muestra una guía; no existe persistencia simulada. Studio local está en `http://127.0.0.1:54323`. El stack local de desarrollo permite registro sin confirmación de email para pruebas; un backend remoto debe conservar confirmación, configurar SMTP y añadir sus propias URLs de redirección antes de usarse.

## Validar

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` incluye PostgreSQL embebido con las migraciones reales y stubs de Auth, además de pruebas de validación/frontend. No necesita Docker. `test:e2e` valida landing/configuración ausente; la colaboración con backend real se ejecuta con el siguiente comando.

Con Supabase local iniciado:

```powershell
npm run test:db
npx supabase db lint --local --level warning --fail-on warning
npx supabase db advisors --local --type security --level warn --fail-on error
npm run test:concurrency
npm run test:integration
npm run test:e2e:local
```

`test:integration` registra usuarios reales en Auth local y recorre REST/RPC; `test:concurrency` prueba conexiones PostgreSQL independientes y bloqueo real. E2E local recorre el flujo desde el navegador con dos cuentas. Los runners solo admiten loopback y no utilizan service_role. Crean fixtures locales, que se eliminan mediante el próximo reset del stack local. Nunca apuntarlos a producción.

Para parar conservando datos locales:

```powershell
npx supabase stop
```

Para una migración nueva y para inspeccionar tipos generados:

```powershell
npx supabase migration new nombre_descriptivo
npm run db:types
```

Los tipos iniciales están mantenidos manualmente junto al esquema; una vez disponible Docker, contrastar la generación de CLI y revisar el diff antes de sustituirlos. No generar tipos desde una base remota por iniciativa propia.

## Sin Docker

Se puede ejecutar frontend, typecheck, lint, build, Vitest y E2E público. No se puede verificar el stack Auth/PostgREST completo ni la concurrencia multiconexión. El entorno de implementación no tenía Docker/psql disponibles; consultar `docs/verification.md` para resultados realmente ejecutados. CI está preparado para ejecutarlos en un runner con Docker; configurar el workflow no significa que ya haya pasado.
