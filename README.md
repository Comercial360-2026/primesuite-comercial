# PrimeSuite Comercial — v1

App móvil de venta consultiva para Primion/PrimeSuite. Ver la documentación completa del proyecto (principios funcionales, modelo de datos, Design System, arquitectura técnica) en los ficheros `01`–`09` entregados junto a este repositorio.

## Arranque local

```bash
npm install
cp .env.example .env.local   # rellenar con las credenciales del proyecto Supabase de desarrollo
npm run dev
```

## Variables de entorno

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nunca la `service_role` key en el frontend — solo se usa en Edge Functions de exportación (ver `02_auth_rls.sql` §6).

## Generar tipos desde Supabase

```bash
export SUPABASE_PROJECT_ID=xxxx
npm run gen:types
```

## Estado del proyecto

Andamiaje inicial: estructura de carpetas, routing, shell de navegación, cliente Supabase, tokens del Design System y esqueleto de la cola offline ya en su sitio. Las 11 pantallas V1 son stubs pendientes de construcción — se implementan en el orden fijado en `09_arquitectura_tecnica.md` §6 (Plan de implementación), empezando por el flujo crítico de visita.

## Despliegue

Netlify, configurado vía `netlify.toml`. Variables de entorno de producción y staging se configuran en la UI de Netlify (Site settings → Environment variables), no en el fichero versionado.
