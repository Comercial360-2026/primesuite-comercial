# PrimeSuite Comercial — reglas de trabajo

Proyecto: `primesuite-comercial` (Vite + React + TypeScript + Supabase, desplegado en Netlify).
Repositorio: https://github.com/Comercial360-2026/primesuite-comercial

**Objetivo de estas reglas: evitar despliegues innecesarios en Netlify.**
Todo cambio se valida en un Deploy Preview de un Pull Request; producción solo se toca
con autorización explícita del usuario.

## Flujo de trabajo obligatorio

Estas reglas son de cumplimiento estricto y prevalecen sobre cualquier otra pauta por defecto.

1. **Nunca trabajar directamente sobre `main`.** Ni editar, ni commitear, ni pushear a `main`.
   Si al empezar una tarea la rama activa es `main`, lo primero es crear una rama `feature/*`.
2. **Crear siempre una rama `feature/*` para cualquier cambio**, por pequeño que sea
   (código, documentación, configuración, dependencias).
   Nombre descriptivo en kebab-case: `feature/agenda-cabeceras-dia`, `feature/fix-login-mobile`.
   ```bash
   git checkout main && git pull origin main
   git checkout -b feature/<descripcion-corta>
   ```
3. **Commit y push en la rama `feature/*`**, nunca en `main`.
   ```bash
   git add -A
   git commit -m "<mensaje descriptivo>"
   git push -u origin feature/<descripcion-corta>
   ```
4. **Crear siempre un Pull Request contra `main`** una vez subida la rama.
   ```bash
   gh pr create --base main --head feature/<descripcion-corta> --title "..." --body "..."
   ```
5. **Usar el Deploy Preview siempre que sea posible.** Netlify genera uno automáticamente
   en cada PR contra `main`; esa es la única vía de validación admitida. No dar una tarea
   por terminada sin él: incluir la URL del Deploy Preview en el resumen entregado al usuario.
6. **No hacer merge a `main` sin autorización explícita.** Nada de `git merge` hacia `main`,
   `gh pr merge` ni push directo a `main` por iniciativa propia.
7. **No ejecutar nunca `netlify deploy --prod`** (ni `netlify deploy` con `--prod`,
   ni "Publish deploy" desde la UI de Netlify, ni ningún otro atajo a producción).
8. **No publicar en producción bajo ninguna circunstancia**, salvo que el usuario escriba
   exactamente:

   > HAZ DEPLOY A PRODUCCIÓN

   Sin ese texto literal no hay autorización. Un "ya está bien", "adelante", "mergea",
   "súbelo" o similar **no** cuenta.

## Despliegue (Netlify)

| Concepto                  | Valor                                                     |
| ------------------------- | --------------------------------------------------------- |
| **Sitio de Netlify**      | **`rococo-gumption-efb70a`**                               |
| URL de producción         | https://rococo-gumption-efb70a.netlify.app                 |
| Panel del sitio           | https://app.netlify.com/projects/rococo-gumption-efb70a    |
| Equipo / propietario      | `cesar-norrego-alvarez` — Comercial360                     |
| Repositorio enlazado      | `github.com/Comercial360-2026/primesuite-comercial`        |
| Configuración             | `netlify.toml` (versionado)                                |
| Comando de build          | `npm run build` (= `tsc -b && vite build`)                 |
| Directorio de publicación | `dist`                                                     |
| Base directory            | `/`                                                        |
| Rama de producción        | `main`                                                     |
| Branch deploys            | solo la rama de producción                                 |
| Deploy Previews           | automáticos en cada PR contra `main`                       |
| Node.js del build         | 24.x                                                       |
| SPA redirect              | `/*` → `/index.html` (200)                                 |

Variables de entorno (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) se configuran
**exclusivamente** en la UI de Netlify, por contexto (production / deploy preview).
No declararlas en `netlify.toml`: un bloque `[context.X.environment]` es
configuración real que pisa lo de la UI y provoca errores como `Invalid supabaseUrl`.

## Comprobaciones antes de abrir el PR

```bash
npm run typecheck
npm run lint
npm run build
```

## graphify

El repositorio tiene un grafo de conocimiento en `graphify-out/` (no versionado).
- Para preguntas sobre el código: `graphify query "<pregunta>"` antes de hacer grep.
- Tras modificar código: `graphify update .`
