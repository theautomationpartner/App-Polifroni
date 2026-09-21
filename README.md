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

En **Settings → Environment Variables** van estas cinco, **ninguna con prefijo `VITE_`**:

| Variable | Valor |
| --- | --- |
| `MONDAY_TOKEN` | El token de Monday de Polifroni |
| `MAKE_WEBHOOK_LEER_DOC` | `https://hook.us1.make.com/9chqbwa4...` |
| `MAKE_WEBHOOK_LEER_OBSERVACIONES` | Escenario que lee el ETMO y devuelve una entrada por abertura. **También se acepta `LEER_OBSERVACIONES`**, que es como quedó cargada |
| `MAKE_WEBHOOK_ENVIAR_OP` | `https://hook.us1.make.com/p0q6e8ga...` |
| `MAKE_WEBHOOK_ENVIAR_OP_TALLER` | `https://hook.us1.make.com/…` (envío al taller) |

> Cargalas en **Production Y Preview**. Una variable que sólo está en Production hace que los
> deploys de preview de `dev` fallen justo en lo que se quería probar.

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
| `MAKE_WEBHOOK_LEER_OBSERVACIONES` | Escenario que lee el ETMO y devuelve qué aberturas tiene. |
| `MAKE_WEBHOOK_ENVIAR_OP` | Escenario que manda la OP al cliente por WhatsApp. |
| `MAKE_WEBHOOK_ENVIAR_OP_TALLER` | Escenario que manda la orden al taller de fabricación. |

Las variables de Make **no** llevan prefijo `VITE_` a propósito: las lee el proxy de Vite, así
la URL del escenario nunca entra en el código que corre en el navegador.

**Un escenario sin URL local no queda muerto**: el proxy lo manda a `/api/make` de la app ya
desplegada, que sí tiene la variable. Así se prueba el circuito completo sin repartir las URLs de
los hooks por las máquinas de cada uno. Se apunta a otro deploy con `APP_URL`, y se apaga el
respaldo poniéndola vacía.

## Las cinco etapas

| # | Etapa | Qué hace | Columnas del tablero |
| --- | --- | --- | --- |
| 1 | **Obra** | Buscador + el tablero entero, traído de a lotes y paginado en memoria (25/50). | — |
| 2 | **Orden ETMO** | Carga el PDF de ETMO, lo lee y escribe las observaciones, una caja por abertura. | `file_mktkkjnj`, `text_mm73nvda` |
| 3 | **OP Final** | Botón *Leer documento* (habilitado sólo con ETMO adjunto) → webhook de Make → espera a que el tablero traiga el documento. | `color_mm72nxsj`, `file_mm72n55y` |
| 4 | **Envío al cliente** | Elige destinatario y vía, manda la OP por WhatsApp con el enlace al formulario de confirmación. | `color_mm12ez80`, `color_mktzfcdt`, `color_mm0h8j4m`, `color_mm5jsjea` |
| 5 | **Confirmación y taller** | Muestra la respuesta del cliente y despacha al taller. Se entra con la OP generada; el despacho pide la confirmación. | `color_mm73rxg7`, `color_mkzrjgcj` |

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

- **El tablero es la fuente de verdad.** Los webhooks contestan enseguida, pero el trabajo recién
  empieza: la app relee el ítem hasta que aparece el resultado y a la vez escucha la respuesta del
  escenario (`useCorrida`); gana el que llegue primero. Un estado sólo cuenta si **cambió después
  del click** (`changed_at`): una obra puede arrastrar un "Enviado" de hace meses, y darlo por bueno
  sería informar un envío que nunca ocurrió.
- **El payload de los webhooks va con dos formas a la vez**: plana (`itemId`, `boardId`) y como el
  evento que manda el botón de Monday (`event.pulseId`), para que el escenario lo lea como lo lea.
  Si los escenarios esperan otro formato, se ajusta en `src/services/make/sdk.ts`.
- **Los PDF se muestran por un proxy** (`/monday-files`): el bucket de Monday no manda cabeceras
  CORS y firma la URL como descarga; el proxy quita esa cabecera para que el visor pueda mostrarlos.
- **La app no escribe updates en el ítem.** El historial queda para lo que informan los escenarios;
  ante un error se muestra el update de ESA corrida, nunca los de corridas viejas.
- **El documento y sus observaciones se borran juntos.** Las aberturas SON las de ese ETMO: las
  armó su lectura. Dejarlas al cambiar de archivo haría escribir contra un dibujo que ya no está, y
  el documento nuevo puede traer otra cantidad y otros nombres. Quitar el documento con
  observaciones escritas pide confirmación; sin nada escrito, no molesta.
- **Las observaciones no se guardan mientras se escriben.** Se completan las que se quieran, en el
  orden que se quiera, y se vuelcan al tablero al salir del paso. Al tocar "Generar la OP final" se
  avisa CUÁLES quedaron sin escribir y se deja decidir: no toda abertura lleva observación, así que
  la pregunta es una advertencia, no un freno. Si están todas, no se pregunta nada.
  Al guardar, **las aberturas sin observación no se escriben**: un renglón "Modelo V3:" vacío
  viajaría a la orden sin decir nada. La contracara es que la lista vive en ese campo, así que las
  que queden vacías desaparecen y se recuperan volviendo a leer el documento.
- **Las observaciones son opcionales, y se editan por abertura** (`features/op/observaciones.ts`).
  No hay campo libre: no se puede escribir hasta que el documento se leyó, porque quién sabe cuántas
  aberturas tiene es el documento. Si al cargarlo se dijo que no, el botón *Leer documento* queda
  disponible, y al llegar al paso 3 sin observaciones se vuelve a preguntar una vez. Una obra puede
  generarse sin ninguna; lo que sí corta la generación es una observación con formato inválido.
  Al adjuntar el ETMO se ofrece leerlo: el escenario `leer-observaciones` devuelve una entrada por
  dibujo y la pantalla arma una caja para cada una. En el tablero se sigue guardando un renglón por
  abertura con el formato que el escenario de la OP ya espera (`Modelo V1: …`), así que la columna
  no cambia de forma. Volver a leer el documento **no pisa** lo ya escrito: aporta la lista, no el
  texto. A diferencia de los otros escenarios, éste no deja nada en el tablero —contesta en la
  respuesta del webhook—, así que si la respuesta no llega no hay nada que ir a buscar.
- **La lista de obras se trae de a lotes y se guarda en memoria** (`features/obras/catalogoObras.ts`).
  El tablero tiene ~570 obras y esperarlas todas deja la pantalla vacía varios segundos. Se pide un
  primer lote de 25, se dibuja, y el resto sigue llegando por detrás. Medido contra Monday, el
  tamaño del lote casi no cambia la demora (~1,3 s con 25, ~1,8 s con 100): lo que cuesta es el
  viaje, no los ítems. Por eso la carga **empieza en la pantalla de inicio**, mientras se elige el
  proceso: son los mismos segundos, pero ya no se esperan mirando una lista vacía.
  La **búsqueda tiene prioridad**: mientras hay una en curso el fondo no pide lotes nuevos, y al
  terminar sigue desde el cursor donde quedó. Lo traído vale **8 minutos**, así que entrar a una
  obra y volver no vuelve a pedir nada.
- **Antes de disparar un escenario se verifica lo que ese escenario filtra** (`features/op/requisitos.ts`).
  El de lectura de observaciones exige dirección, celular a coordinar y archivo adjunto; si corta en
  su filtro no llega a su módulo de respuesta y Make contesta `Accepted`, sin lista y sin explicación.
  Y como ese escenario cambia el estado de la obra ANTES del filtro, una corrida que no sirvió para
  nada igual deja rastro en el tablero. Por eso se verifica de este lado primero.
- **A cada etapa se entra por lo que la obra TIENE ADJUNTO** (`lib/pasos`): al paso 3 con la Orden
  ETMO (`file_mktkkjnj`), y a los pasos 4 y 5 con la OP final (`file_mm72n55y`). Los dos archivos,
  no el estado: una obra marcada "Enviado" pero sin la OP adjunta no tiene qué mandar. La condición
  se **encadena**, así que la etapa bloqueada informa el primer requisito que falta, no el último.
  Entrar al paso 5 **no** exige la confirmación: ésa es la pantalla donde se mira si el cliente
  contestó. Lo que la confirmación gobierna es el **botón** de despacho al taller
  (`puedeDespacharAlTaller`): con `color_mm73rxg7` en *Pend de Confirmar* se entra igual pero no se
  manda, y con *NO CONFIRMAOD* no se manda nunca.
- **Las esperas no muestran cuánto tardan.** Un contador de segundos en una corrida cuya duración
  no conocemos no informa: sólo mide la ansiedad. Se muestra que está trabajando y en qué.
- **Los escenarios reciben `event.columnId`.** Disparados desde el botón de Monday ese dato viene
  solo, y alguno lo reenvía al hook que después cierra el estado. Sin él, el envío al taller se
  quedaba en *Enviando* para siempre porque nadie sabía qué columna cerrar.
- **El recorrido se hace con el selector de acción, no con el stepper.** La barra de etapas informa
  —dónde estás, cuánto falta— y no navega: un círculo apagado no sabe explicar por qué está
  apagado. El selector (`AccionSelect`, la caja de configuración de La Batea) lista las cinco
  acciones, deshabilita las que la obra no alcanzó y muestra abajo qué falta para la próxima.

## Pendientes

- Autenticación (hoy la app entra directo).
- El logo de `public/logo-polifroni.png` es la versión **blanca** (pensada para fondos oscuros).
  Sobre la barra blanca no se veía, así que se invierte por CSS: es monocromo puro, y al invertirlo
  queda negro limpio. Con el archivo en oscuro, se borra el `filter: invert(1)` de `.marca-img`.
