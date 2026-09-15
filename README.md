# Polifroni · App de procesos — 🪟 Obras

Aplicación local para el proceso de **Orden de Producción** de obras. Lee y escribe únicamente el
tablero **🪟 Obras (9617181553)** de Monday y dispara los escenarios de Make que ya están
desarrollados.

El sistema de diseño (colores, tipografía, márgenes, botones, dropdowns, stepper, cards) es el mismo
de la app **La Batea**: `src/styles/base.css`, `layout.css` y `components.css` se tomaron tal cual de
ese repositorio, y `obras.css` sigue sus mismos patrones para lo propio de este proceso.

---

## Cómo levantarla

```bash
npm install
npm run dev
```

Abrir <http://localhost:5191>.

Todavía **no hay autenticación**: se entra directo a la pantalla de selección de procesos.

## Configuración (`.env.local`)

El archivo ya está creado con los valores de trabajo. Es el único lugar donde viven los secretos y
está fuera de git (`.gitignore`):

| Variable | Para qué |
| --- | --- |
| `VITE_MONDAY_TOKEN` | Token de Monday. Viaja por el proxy de Vite (`/monday-api`). |
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
