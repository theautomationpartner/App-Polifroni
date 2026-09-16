# Polifroni · App de procesos — 🪟 Obras

Aplicación para el proceso de **Orden de Producción** de obras. Lee y escribe únicamente el
tablero **🪟 Obras (9617181553)** de Monday y dispara los escenarios de Make que ya están
desarrollados.

El sistema de diseño (colores, tipografía, márgenes, botones, dropdowns, stepper, cards) es el mismo
de la app **La Batea**: `src/styles/base.css`, `layout.css` y `components.css` se tomaron tal cual de
ese repositorio, y `obras.css` sigue sus mismos patrones para lo propio de este proceso.

---

## Cómo levantarla (local)

```bash
npm install
npm run dev
```

Abrir <http://localhost:5191>.

Todavía **no hay autenticación**: se entra directo a la pantalla de selección de procesos.

## Ramas

| Rama | Para qué | Dónde se ve |
| --- | --- | --- |
| `main` | Lo que está en producción. Sólo llega acá lo ya probado. | Deploy de producción |
| `dev` | Donde se trabaja y se prueba. | Deploy de *preview* que Vercel arma solo |

El trabajo del día a día va a `dev`; a `main` se pasa cuando lo probado convence. Para que los
deploys de preview funcionen, las variables de entorno tienen que estar también en el entorno
**Preview**, no sólo en Production.

> **El autor del commit importa.** Vercel no despliega un commit cuyo autor no pueda atribuir a una
> cuenta con acceso al proyecto: lo bloquea ANTES de construir (*"Git author … must have access to
> the project"*), así que en los logs no aparece ningún error de build, porque nunca hubo build.
>
> Los commits de este repositorio van firmados con `tomas@theautomationpartner.com`, que en GitHub
> es la cuenta `TheAutomationPartner785`. Para que Vercel la acepte, esa cuenta tiene que estar
> invitada al equipo del proyecto (botón *Invite to Team* en el deployment bloqueado). Si algún día
> se firma con otro correo, el bloqueo vuelve: se resuelve invitando a esa cuenta, no cambiando el
> código.

## Configuración en Vercel (producción)

En **Settings → Environment Variables** van estas cuatro, **ninguna con prefijo `VITE_`**:

| Variable | Valor |
| --- | --- |
| `MONDAY_TOKEN` | El token de Monday de Polifroni |
| `MAKE_WEBHOOK_LEER_DOC` | `https://hook.us1.make.com/9chqbwa4...` |
| `MAKE_WEBHOOK_ENVIAR_OP` | `https://hook.us1.make.com/p0q6e8ga...` |
| `MAKE_WEBHOOK_TALLER` | (pendiente) |

Las lee el código de `api/`, que corre **en el servidor**. El navegador nunca ve el token: pide
`/api/monday` y la función reenvía a Monday poniendo la credencial.

> **Por qué no `VITE_MONDAY_TOKEN` en producción.** Vite reemplaza toda variable `VITE_*` por su
> valor literal dentro del JavaScript que se descarga el navegador. Cargar el token así equivale a
> publicarlo: cualquiera que abra la página puede leerlo del bundle y escribir en los tableros con
> él. El build está hecho para que eso no pueda pasar ni por error (la lectura vive dentro de una
> rama que sólo existe en desarrollo y el compilador la borra en producción).

> **La app todavía no tiene autenticación.** Quien tenga la URL del deploy puede usarla, y por lo
> tanto operar sobre el tablero a través de `/api/*`. Hasta que la capa de acceso exista, conviene
> dejar el deploy cerrado en **Settings → Deployment Protection**.

### Las rutas de `api/`

| Ruta | Qué hace | Equivalente en desarrollo |
| --- | --- | --- |
| `api/monday.ts` | GraphQL de Monday con el token del servidor | proxy `/monday-api` |
| `api/monday-upload.ts` | Subida del PDF a una columna `file` (multipart) | proxy `/monday-api-file` |
| `api/monday-file.ts` | Trae los bytes del PDF desde S3 y les saca la cabecera de descarga | proxy `/monday-files` |
| `api/make.ts` | Dispara un escenario de Make de una lista cerrada | proxy `/make/*` |

## Configuración local (`.env.local`)

El archivo ya está creado con los valores de trabajo. Es el único lugar donde viven los secretos y
está fuera de git (`.gitignore`):

| Variable | Para qué |
| --- | --- |
| `VITE_MONDAY_TOKEN` | Token de Monday, SÓLO para desarrollo. Viaja por el proxy de Vite (`/monday-api`). En producción se usa `MONDAY_TOKEN` (ver arriba). |
| `MAKE_WEBHOOK_LEER_DOC` | Escenario que lee el PDF de ETMO y arma la OP final. |
| `MAKE_WEBHOOK_ENVIAR_OP` | Escenario que manda la OP al cliente por WhatsApp. |
| `MAKE_WEBHOOK_TALLER` | Escenario de envío al taller. **Falta la URL**: sin ella el botón avisa qué configurar. |

Las tres variables de Make **no** llevan prefijo `VITE_` a propósito: las lee el proxy de Vite, así
la URL del escenario nunca entra en el código que corre en el navegador.

## Las cinco etapas

| # | Etapa | Qué hace | Columnas del tablero |
| --- | --- | --- | --- |
| 1 | **Obra** | Buscador + lista paginada (15/25). Arranca con la obra de trabajo; el resto se trae buscando por nombre o por id de ítem. | — |
| 2 | **Orden ETMO** | Adjunta el PDF de ETMO y guarda las observaciones por ítem. | `file_mktkkjnj`, `text_mm73nvda` |
| 3 | **OP Final** | Botón *Leer documento* (habilitado sólo con ETMO adjunto) → webhook de Make → espera a que el tablero traiga el documento. | `color_mm72nxsj`, `file_mm72n55y` |
| 4 | **Envío al cliente** | Elige destinatario y vía, manda la OP por WhatsApp con el enlace al formulario de confirmación. | `color_mm12ez80`, `color_mktzfcdt`, `color_mm0h8j4m`, `color_mm5jsjea` |
| 5 | **Confirmación y taller** | Muestra la respuesta del cliente e **habilita el envío al taller sólo si la OP está confirmada**. Historial completo del ítem. | `color_mm73rxg7`, `color_mkzrjgcj` |

La ficha de la obra —cuenta corriente del cliente, constructor/arquitecto, teléfonos, estados,
importes, documentos— está presente en todas las etapas.

## Cómo está organizado

```
api/                 Serverless Functions (Vercel): el token vive acá, no en el navegador
src/
  services/monday/   columns.ts (mapa del tablero) · sdk.ts · obras.ts · parse.ts · cache.ts
  services/make/     sdk.ts (disparo de escenarios)
  state/             reducer + contextos (mismo patrón que La Batea)
  components/ui/     Stepper, Dropdown, Modal, VisorPdf, DropArchivo, Aviso…
  features/          inicio · obras · op · envio · actividad · shared
  styles/            base.css · layout.css · components.css (de La Batea) + obras.css
```

`src/services/monday/columns.ts` es la **única** fuente de ids de columna: ningún componente escribe
un `text_xxxxx` suelto.

## Decisiones que conviene conocer

- **El tablero es la fuente de verdad.** Los webhooks de Make contestan enseguida, pero el trabajo
  recién empieza: después de dispararlos la app relee el ítem hasta que aparece el resultado
  (`esperarEnTablero`). Mientras espera, la ficha se va actualizando sola.
- **El payload de los webhooks va con dos formas a la vez**: plana (`itemId`, `boardId`) y como el
  evento que manda el botón de Monday (`event.pulseId`), para que el escenario lo lea como lo lea.
  Si los escenarios esperan otro formato, se ajusta en `src/services/make/sdk.ts`.
- **Los PDF se muestran por un proxy** (`/monday-files`): el bucket de Monday no manda cabeceras
  CORS y firma la URL como descarga; el proxy quita esa cabecera para que el visor pueda mostrarlos.
- **Cada acción de la app queda registrada** como update en el ítem (adjuntar, generar, enviar), así
  el historial del tablero cuenta la misma historia que la app.

## Pendientes

- URL del escenario de **envío al taller** (`MAKE_WEBHOOK_TALLER`).
- Autenticación (hoy la app entra directo).
