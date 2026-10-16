# Polifroni · App de procesos — guía para Claude

React + Vite + TypeScript en `src/`, funciones serverless de Vercel en `api/`, datos en Monday,
automatizaciones en Make, base Neon (`db/`). El detalle funcional está en `README.md`: leerlo sólo
la sección que haga falta, no entero.

## Grafo del código (graphify) — usarlo ANTES de leer archivos

Hay un grafo del código en `graphify-out/graph.json` (local, no se commitea). Responde dónde está
cada cosa y qué la usa sin abrir archivos. El CLI está en `C:\Users\tomas\.local\bin\graphify.exe`
(si `graphify` no aparece en el PATH, usar esa ruta).

1. **Ubicar algo:** `graphify explain "NombreDelSimbolo"` → archivo, línea y cada conexión con su
   línea. Después leer SÓLO ese rango (`Read` con `offset`/`limit`), no el archivo entero.
2. **Antes de cambiar lógica:** `graphify affected "NombreDelSimbolo"` → qué se rompe si cambia.
3. **Cómo se conectan dos cosas:** `graphify path "A" "B"`. Entre `src/` y `api/` no hay arista
   (se hablan por `fetch`): ahí buscar el endpoint por su ruta (`/api/...`).
   Si un nombre existe en dos archivos (p. ej. `iniciarEnrolamiento` en `api/` y en `src/`), el
   CLI lista los candidatos: repetir con `"api/_mfa.ts::iniciarEnrolamiento()"`.
4. **Pregunta abierta:** `graphify query "<nombres de funciones o archivos>" --budget 1500`. Con
   nombres de símbolos es precisa; con frases en castellano trae ruido.
5. `graphify-out/GRAPH_REPORT.md` sólo para una vista general de la arquitectura.
6. Grep o lectura directa sólo para lo que el grafo no cubre: CSS (no se indexa), textos, o
   cuando el grafo no encuentra el símbolo.
7. **Mantenerlo al día:** el commit con que se armó figura en `GRAPH_REPORT.md` («Built from
   commit»). Si no es el `HEAD`, o después de un `git pull` o de cambiar código, correr
   `graphify update .` (sólo AST, sin costo de API, segundos).

## Ahorro de tokens en general

- No releer lo que ya está en la conversación ni lo que se acaba de editar.
- Para búsquedas amplias en muchos archivos, delegar en un subagente y quedarse con la conclusión.
- Comandos con salida larga (build, tests, git log): filtrar con `tail`/`head`/`grep`.
- No pegar archivos enteros en las respuestas; citar `archivo:línea`.

## Mapa rápido

- `src/features/<proceso>/` — una carpeta por proceso: `obras`, `op`, `envio`, `editar`,
  `presupuesto`, `facturacion`, `agenda`, `vidrios`, `listado`, `inicio`; `shared/` (encabezado
  `PasoHeader`, selectores).
- `src/state/` — estado global (`appState.ts`, hooks `useApp`/`useDispatch`).
- `src/services/monday/` — lecturas y escrituras a Monday (`sdk.ts` → `mondayApi`).
- `src/lib/` — lógica pura de cada proceso (se testea en `tests/`).
- `api/` — endpoints; `api/_*.ts` son módulos compartidos. Seguridad: `middleware.ts` (Referer),
  `api/_guard.ts` (sesión de Monday), `api/_whitelist.ts` (lista blanca), `api/_mfa.ts` (2FA).
- `src/styles/` — CSS por área (sistema de diseño de La Batea).
- `formularios/`, `prompts/` — código de módulos de Make y prompts de la IA.

## Reglas del repo

- Se trabaja SIEMPRE en `dev`: los commits y los push van sólo a `dev`. A `main` se sube
  únicamente cuando alguien con acceso al repositorio lo pide explícitamente, con `git push origin dev:main` (no se hace
  checkout de `main`). El grafo es uno solo y refleja `dev`.
- No commitear: `.agents/`, `.claude/`, `skills-lock.json`, `pdfco-api-logs.csv`, `*.mp4`,
  `llamada.txt`, `graphify-out/`.
- No correr prettier: reformatea archivos enteros.
- Verificar con `npm run typecheck` y el test del área (`npm run test:<area>`;
  `npm run test:seguridad` para las capas de acceso).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
