# Manual de uso · Área de Producción

**App Polifroni — Órdenes de Producción**

Este manual es para las personas de Producción que van a cargar, enviar y seguir las órdenes de
producción (OP) desde la app. Explica paso a paso las dos operaciones del área y, en cada paso,
**qué controla la app y por qué**.

---

## Índice

1. [La idea general: Monday es la base, la app es donde se trabaja](#1-la-idea-general)
2. [Cómo entrar a la app](#2-cómo-entrar-a-la-app)
3. [La pantalla de inicio y el encabezado](#3-la-pantalla-de-inicio-y-el-encabezado)
4. [El ciclo de vida de una orden de producción](#4-el-ciclo-de-vida-de-una-orden-de-producción)
5. [Operación 1 · Cargar y Enviar Órdenes de Producción](#5-operación-1--cargar-y-enviar-órdenes-de-producción)
   - [5.1 ¿A quién vas a enviarle la orden?](#51-a-quién-vas-a-enviarle-la-orden)
   - [5.2 Etapa 1 · Seleccionar Obra](#52-etapa-1--seleccionar-obra)
   - [5.3 Al cliente o constructor · obra de Aluminio](#53-al-cliente-o-constructor--obra-de-aluminio)
   - [5.4 Al cliente o constructor · obra de PVC](#54-al-cliente-o-constructor--obra-de-pvc)
   - [5.5 El envío: destinatarios, quién confirma y el mensaje](#55-el-envío-destinatarios-quién-confirma-y-el-mensaje)
   - [5.6 Finalizar Operación](#56-finalizar-operación)
   - [5.7 Al taller](#57-al-taller)
6. [La confirmación del cliente o constructor](#6-la-confirmación-del-cliente-o-constructor)
7. [Operación 2 · Consultar Órdenes de Producción](#7-operación-2--consultar-órdenes-de-producción)
8. [Resumen: qué valida la app y por qué](#8-resumen-qué-valida-la-app-y-por-qué)
9. [Preguntas frecuentes y problemas comunes](#9-preguntas-frecuentes-y-problemas-comunes)

---

## 1. La idea general

En el espacio de Producción de Monday van a seguir viendo los tableros de siempre: Presupuestos,
Obras, Configuración de obra, Órdenes de compra de vidrio, Arquitectos y constructores, y ahora
también **Órdenes de Producción**, que antes vivía dentro de Obras y ahora es un tablero aparte.

A partir de ahora, la forma de trabajar cambia:

- **Los tableros de Monday son la base de datos.** Ahí se *consulta* la información.
- **Las órdenes de producción se cargan, se envían y se gestionan desde la app**
  (*App Polifroni*), no a mano en el tablero.

¿Por qué? Porque la app controla cada paso antes de dejar avanzar: no deja enviar una orden con
datos faltantes, no deja mandar al taller algo que el cliente no confirmó y registra todo en
Monday de la misma forma, siempre. En vez de descubrir un error cuando ya pasó, la app avisa
antes y dice qué falta.

> Hoy en la app está funcionando **Producción**. **Presupuesto** y **Obras** aparecen como
> "Próximamente": se van a ir sumando.

---

## 2. Cómo entrar a la app

La app se abre **desde Monday**, en la vista *App Polifroni*. Fuera de Monday no funciona: si se
abre desde otro lado aparece **"ERROR 401 NO Autorizado"** y la pantalla queda en "Acceso no
disponible". Así nadie puede usarla desde afuera de la cuenta de Polifroni.

Al entrar, la app hace tres controles, en este orden:

1. **Que tu usuario esté habilitado.** Cada persona tiene que estar dada de alta para usar la app.
   Si no lo estás, aparece **"ERROR 403 · Usuario sin permisos"**: pedile a soporte de TAP que te
   den de alta.
2. **Quién sos.** La app toma tu usuario de Monday.
3. **El segundo factor (Google Authenticator).** Un código desde tu celular, para confirmar que
   sos vos.

### La primera vez: configurar Google Authenticator

1. Instalá **Google Authenticator** en tu celular.
2. La app muestra **"Configurá tu segundo factor"** con un código QR. Escanealo con Google
   Authenticator. Si no podés escanearlo, debajo está el código para cargarlo a mano.
3. Escribí los **seis dígitos** que te muestra el celular y tocá **Confirmar**.
4. La app te muestra **10 códigos de rescate**. **Guardalos en un lugar seguro**: son la única
   forma de entrar si perdés o cambiás el celular, cada uno sirve **una sola vez** y **no se
   vuelven a mostrar**. Tildá "Ya los guardé en un lugar seguro" y tocá
   **Entrar a la aplicación**.

### Todos los días

- La app pide **"Verificación en dos pasos"**: escribí el código de seis dígitos que muestra
  Google Authenticator en ese momento y tocá **Verificar**.
- El código vale por **12 horas**: en general se pide una vez por jornada.
- Si el código no sirve ("El código no es válido o ya venció"), esperá al siguiente que muestre
  el celular y probá de nuevo. Los códigos cambian cada pocos segundos.
- **¿Cambiaste de celular?** Entrá con un código de rescate (se escribe en el mismo campo) y usá
  "¿Cambiaste de celular o de app? Configurar de nuevo".

### Tu usuario

Arriba a la derecha dice **Usuario:** con tu nombre. Es a nombre de quién se emiten las órdenes:
queda registrado como *Responsable* de cada OP en el tablero.

- **No lo podés cambiar.** Cada uno emite a su nombre, para que quede claro quién hizo cada cosa.
- Solo un **administrador** puede elegir a otra persona en ese selector.

---

## 3. La pantalla de inicio y el encabezado

### Inicio

1. Tocá la tarjeta **Producción**.
2. **"Seleccioná una operación:"** → elegí una de las dos:

| Operación | Para qué sirve |
| --- | --- |
| **Cargar y Enviar Órdenes de Producción** | Cargar una OP nueva y mandarla al cliente o constructor para que la confirme, o mandar al taller una OP ya confirmada. Tiene 3 etapas. |
| **Consultar Órdenes de Producción** | Ver las OP que están esperando la confirmación del cliente o constructor, reenviarlas o cancelarlas. |

**Atajo:** en el inicio hay un buscador, **"Buscar área u operación"**. Escribí, por ejemplo,
*consultar* o *enviar*: aparece la tarjeta de esa operación y, tocándola, entrás directo a ella.

### El encabezado

El encabezado está siempre arriba y muestra:

- **El logo**: vuelve al inicio.
- **Área**: un desplegable con el área en la que estás (Producción). Desde ahí volvés a
  **Inicio** o cambiás de área. Las áreas que todavía no están se ven apagadas.
- **Operación**: un desplegable para pasar de una operación a la otra. Es lo mismo que elegirla en
  las tarjetas.
- **Usuario**: tu nombre.
- **Las etapas** de la operación, a la derecha (1 · 2 · 3).

Sobre las etapas:

- Podés **volver** a una etapa por la que ya pasaste, sin perder lo cargado.
- **No podés saltar hacia adelante**: "Completá los pasos anteriores para llegar a esta etapa."
  Cada etapa necesita lo de la anterior.

> **Cuidado al cambiar de operación o de área a mitad de camino.** La app pregunta antes:
> *"Al cambiar de operación, todos los datos ingresados actualmente se perderán. Lo que ya se
> guardó en el tablero queda como está."* Lo que no se registró con **Finalizar Operación** se
> pierde.

Mientras la app está haciendo algo (subiendo un documento, enviando un mensaje), no deja
navegar y te dice por qué, por ejemplo *"Esperá a que termine el envío de la OP."*. Así no se
corta un envío a la mitad.

---

## 4. El ciclo de vida de una orden de producción

Antes de ver las operaciones, conviene entender por qué estados pasa una OP. La app decide qué
se puede hacer con cada orden según su estado.

```
Cargada ──▶ Enviada · Pend de Confirmar ──▶ Confirmada ──▶ Enviada a taller
                     │                          
                     ▼                          
               No confirmada            (cualquiera de ellas) ──cancelar──▶ Cancelada
```

| Estado | Qué significa | Qué se puede hacer |
| --- | --- | --- |
| **Pend de Confirmar** | Se envió al cliente o constructor y se espera su respuesta. | Reenviarla o cancelarla. |
| **Confirmada** | El cliente o constructor dijo que está correcta. | Enviarla al taller o cancelarla. |
| **No confirmada** | El cliente o constructor pidió revisar algo. | Cancelarla y cargar una nueva corregida. |
| **Enviada a taller** | Ya salió a fabricación. | Solo consultarla. |
| **Cancelada** | Dejó de valer. Queda con el motivo escrito. | Solo consultarla. |

**La regla más importante: una OP no se modifica ni se borra.** Si el cliente pide un cambio
(otro color, otra medida), la OP se **cancela** con el motivo y se **carga una nueva**.

¿Por qué? Para que siempre quede escrito **qué se mandó, qué se aprobó y por qué cambió**. Una
obra puede tener varias OP: porque se fabrica por partes, porque hubo correcciones o porque se
cargó una por error. Todas quedan registradas y se sabe cuál es la vigente.

---

## 5. Operación 1 · Cargar y Enviar Órdenes de Producción

Esta operación tiene **tres etapas**. Cómo se llama cada una y qué se hace en ella depende de
**a quién** se envía y del **tipo de obra**:

| Etapa | Al cliente o constructor · **PVC** | Al cliente o constructor · **Aluminio** | **Al taller** |
| --- | --- | --- | --- |
| 1 | Seleccionar Obra | Seleccionar Obra | Seleccionar Obra |
| 2 | Cargar OP Hetmo | Cargar OP | Seleccionar OP A Enviar |
| 3 | Emitir y Enviar OP | Enviar OP | Enviar OP |

¿Por qué cambian? Porque **PVC y Aluminio trabajan distinto**:

- **Aluminio**: la orden se dibuja fuera de HETMO. Solo hay que **cargar el PDF y enviarlo**.
- **PVC**: se sube el listado de dibujos que genera **HETMO**, y la app lo convierte en la
  **OP final** con el formato de Polifroni (logo, datos de la obra, aberturas, vidrios y
  observaciones). Después se envía.

### 5.1 ¿A quién vas a enviarle la orden?

Lo primero que pregunta la operación, arriba de todo:

- **A Cliente/Constructor**: para cargar una OP nueva y mandarla a confirmar.
- **Al Taller**: para mandar a fabricar una OP que ya está confirmada.

Si tocás *Continuar* sin contestar, el recuadro se pone en rojo: de esta respuesta depende todo lo
que sigue. Si la cambiás después de elegir una obra, la operación empieza de nuevo desde la
selección de la obra.

### 5.2 Etapa 1 · Seleccionar Obra

*"Buscá y seleccioná la obra a la cual pertenece la orden de producción que querés enviar."*

**Buscar la obra**

- Escribí el **nombre** de la obra (o su **ID**). Mientras escribís, la app sugiere obras. No
  importan las mayúsculas ni las tildes.
- Si la obra no aparece (por ejemplo, porque se creó recién), tocá **Buscar**: la busca
  directamente en Monday.
- Elegir la obra **no crea nada** en Monday. La OP recién nace cuando subís el PDF en la etapa 2.

**La ficha de la obra**

Al elegirla, la app muestra la ficha. Revisala antes de seguir:

| Dato | Para qué sirve |
| --- | --- |
| **ID, nombre y ubicación** | Confirmar que es la obra correcta. |
| **Cliente asignado / Constructor asignado** | Son los posibles destinatarios de la OP. |
| **Tipo de Venta** | Por ejemplo, *Ganado/Aceptado/Anticipo*. |
| **Asignado a** | Quién de ustedes lleva la obra. |
| **Combinada** | La obra forma parte de una obra mayor que tiene aberturas de PVC **y** de Aluminio (en Monday son dos obras, una de cada tipo, combinadas). |
| **PVC / Aluminio** (arriba a la derecha) | El tipo de obra. **Define el camino de la etapa 2.** |
| **"Requiere de una orden de producción de HETMO"** | Aparece en las obras de PVC. |
| **Situación de las órdenes** | *Sin Orden de Producción asignada* (gris), *N Órdenes de Producción asignadas* (amarillo) o *Con Orden de Producción confirmada* (verde). Las canceladas no cuentan. |
| **Total obra pactado / Cancelado / Pendiente de cobro** | La situación de cobro de la obra. |
| **Coordinador, Cel a coordinar y Fecha pactada de colocación** | Con quién se coordina y cuándo. |

**Qué valida la app al tocar "Continuar"**

| Situación | Qué pasa | Por qué |
| --- | --- | --- |
| La obra **no tiene el tipo** (PVC o Aluminio) cargado | **No deja seguir.** *"La obra no tiene el tipo cargado"*. Hay que cargar el tipo en la obra en Monday y volver a elegirla. | PVC y Aluminio cargan documentos distintos. Sin el tipo, la app no sabe qué camino tomar, y tomar el equivocado arruinaría la orden. |
| La obra **ya tiene órdenes** asignadas | Pregunta *"¿Querés cargar una orden de producción nueva?"* → **Cargar una nueva** o **Volver**. | Para que no se cargue una OP repetida por error. Si lo que querías era **reenviar** una que ya existe, eso se hace desde *Consultar Órdenes de Producción*. |
| La obra **ya tiene una orden confirmada** | Avisa *"Esta obra ya tiene una orden confirmada"* y pregunta si querés cargar otra → **Cargar una nueva** o **Volver**. | Es válido: una obra puede necesitar más de una OP (se fabrica por partes, hay un agregado o una corrección). La app solo te avisa para que lo hagas a conciencia. |

### 5.3 Al cliente o constructor · obra de Aluminio

#### Etapa 2 · Cargar OP

*"Cargá el PDF de la orden de producción y completá los datos de la medición."*

1. **Arrastrá y soltá el PDF** de la orden en el recuadro (o hacé click para elegirlo).
   - Tiene que ser un **PDF**.
   - Al subirlo, la OP **nace en el tablero de Órdenes de Producción**, vinculada a la obra.
2. **Datos de Medición**:
   - **Nro Orden Producción**: lo calcula la app y **no se edita**. En Aluminio empieza con
     **"A"** (por ejemplo, *A3010*). Es el siguiente al último emitido, para que la numeración
     sea correlativa y sin repetidos. PVC y Aluminio llevan numeraciones separadas.
   - **Medido por**: elegí de la lista quién midió. Si no está, elegí *"Otro — no está en la
     lista"* y escribilo en la observación.
   - **Fecha de medición**: por defecto es hoy. Se puede cambiar a una fecha anterior, nunca
     futura (no se puede haber medido algo que todavía no pasó).
   - **Observación**: una aclaración general de la orden (opcional).
3. Tocá **Continuar a Enviar OP**.

**La app no deja continuar sin** el PDF cargado y el número de orden calculado. Mientras el PDF
se está subiendo, espera a que termine.

#### Etapa 3 · Enviar OP

Antes de enviar, **abrí el documento** para verificar que cargaste el archivo correcto. Después
seguí con el envío, que se explica en [5.5](#55-el-envío-destinatarios-quién-confirma-y-el-mensaje).

### 5.4 Al cliente o constructor · obra de PVC

#### Antes de empezar: datos de la obra que faltan

Si a la obra le falta la **ubicación** o el **celular a coordinar**, al entrar a la etapa 2 la app
lo pide en la ventana **"Faltan datos de la obra"**:

- **Ubicación de la obra**: escribí calle, número y ciudad, y tocá **Buscar**. La app te muestra
  las ubicaciones posibles; elegí la correcta.
- **Celular a coordinar**: con código de país y de área, sin 0 ni 15 (ejemplo: 5492494520152).

Tocá **Guardar y seguir**: los datos **se guardan en la obra** en Monday.

¿Por qué? Porque la OP final de PVC los lleva impresos, y la lectura del documento no funciona sin
ellos. Pedirlos al principio evita llegar al final y que la generación falle. Cuando Obras se cargue
desde la app, estos datos ya van a venir completos.

#### Etapa 2 · Cargar OP Hetmo

*"Como la obra seleccionada es PVC, cargá una orden específica de HETMO, indicá si se cargan
observaciones y completá los datos de la medición."*

1. **Arrastrá y soltá el PDF de la orden de HETMO** (el listado de dibujos que sale de HETMO).
   - En PVC **no se puede seguir sin la orden de HETMO**: de ahí salen los dibujos, las medidas y
     los vidrios de la OP final.
   - Al subirlo, la OP **nace en el tablero de Órdenes de Producción**, vinculada a la obra.
2. La app pregunta **"¿Querés cargar observaciones?"**
   - Si decís que sí, **la IA lee el documento** y arma **una caja por abertura** (Modelo V1,
     Modelo V2…).
   - Si ahora no, lo podés hacer después con **Cargar observaciones**.
3. **Observaciones por abertura**: se ve una abertura por vez. Te movés con las flechas ‹ ›, con el
   desplegable, con los puntitos o con las teclas ← →. Escribí la observación de cada abertura que
   la necesite; las que quedan vacías no llevan observación. Arriba dice cuántas escribiste (por
   ejemplo, *"2 de 4 escritas"*).
4. **Datos de Medición**: igual que en Aluminio (número automático, medido por, fecha y
   observación general). En PVC el número **no** lleva la "A".
5. Tocá **Continuar a Emitir y Enviar OP**.

**Qué controla la app en esta etapa**

- No deja continuar **mientras se sube el documento o se leen las observaciones**. Si avanzaras
  antes, la OP final saldría sin ellas.
- No deja continuar **sin** la orden de HETMO, sin el número de orden, o si a la obra le falta la
  ubicación o el celular a coordinar. Te muestra la lista de lo que falta.
- Si reemplazás o quitás el documento de HETMO cuando ya escribiste observaciones, pregunta antes:
  **se borran también las observaciones escritas**.
- Volver a leer el documento con la IA **no borra** lo que escribiste a mano.

#### Etapa 3 · Emitir y Enviar OP

*"Revisá el resumen, generá la OP final y mandásela al cliente o al constructor."*

1. **Leé el "Resumen OP final a generar"**: usuario emisor, obra, tipo de obra, coordinador,
   número de orden, quién midió y cuándo, cantidad de aberturas, cuántas observaciones cargaste
   (por ejemplo, *"2 de 4"*) y el nombre del documento de HETMO. Un dato vacío aparece como "--".
2. Tocá **Generar OP final**. La app lee el documento de HETMO y arma un PDF nuevo, ordenado y con
   el formato de Polifroni:
   - **Arriba**: el logo, la obra, la dirección, el celular, el número de orden, el número del
     listado de HETMO y la vista (interior).
   - **En el centro**: cada abertura con su modelo, descripción, color, medidas, cantidades,
     vidrios y su observación, si tiene.
   - **Al pie**: el total de aberturas, de vidrios (DVH) y de mosquiteros; quién midió, la fecha
     de medición y la observación general.
3. Tocá **Ver OP Final** y **revisala antes de enviarla**.
4. Si algo está mal, corregilo en la etapa 2 y volvé a generar. Se puede generar las veces que
   haga falta **mientras no se haya enviado**.

**Qué controla la app al generar**

- **Si algo impide generar** (falta la dirección o el celular, el documento no trae ningún modelo,
  el PDF no se pudo leer), **no genera** y te dice qué falta.
- **Si genera pero hay algo para revisar**, la genera igual y te muestra **advertencias**. Por
  ejemplo: un modelo sin dibujo, un dato ilegible que sale con "—", modelos repetidos, una
  observación que no coincide con ningún modelo (va al pie para no perderla) o que falta *Medido
  por*. Revisá la OP con **Ver OP Final** antes de enviarla.
- **Tamaño máximo**: si la OP final pesa más de lo que se puede subir a Monday, no la genera.
  Así no se arma una orden que después no se pueda guardar.
- Generar la OP final **no escribe nada en Monday**: todo se registra al finalizar.

Con la OP final generada, se habilita el envío: ver [5.5](#55-el-envío-destinatarios-quién-confirma-y-el-mensaje).

### 5.5 El envío: destinatarios, quién confirma y el mensaje

El bloque de envío se lee **de izquierda a derecha**: destinatarios → quién confirma → ver el
mensaje → enviar. El medio de envío es **WhatsApp**.

**1. Destinatarios**

- Viene **preseleccionado** el destinatario que ya tenía la obra para las órdenes de producción
  (cliente, constructor o ambos).
- Con **Agregar destinatario…** sumás al otro (el cliente o el constructor de la obra).
- Con la **papelera** quitás a uno.
- Cada destinatario muestra su celular. Con **Editar** podés corregirlo: el número nuevo **se
  guarda en Monday**, en la ficha del cliente o del constructor, y la orden se envía a ese número.

**2. Responsable de confirmar la orden**

Si hay **dos destinatarios**, la app pide elegir **quién confirma** (cliente o constructor). Es el
único que recibe el **enlace para confirmar**; el otro recibe la orden para estar al tanto.

¿Por qué solo uno? Porque si los dos pudieran responder, uno podría confirmar y el otro no, y no
se sabría qué vale. **Una orden, una respuesta.**

Si hay un solo destinatario, confirma ese.

**3. Ver el mensaje que le llega**

En el enlace azul **"Ver el mensaje que le llega"** ves, antes de mandarlo, el WhatsApp que va a
recibir cada destinatario: el saludo, los datos de la orden a verificar, el PDF adjunto y, para
quien confirma, el enlace para confirmar.

**4. Confirmar y Enviar**

Tocá **Confirmar y Enviar**. El botón pasa a *Enviando…* y después a **Enviado exitosamente**
(verde) o **Error de Envío** (rojo; tocándolo de nuevo se reintenta).

**Qué controla la app antes de enviar**

| Control | Qué pasa | Por qué |
| --- | --- | --- |
| La obra no tiene **cliente** (cuenta corriente) ni **constructor** vinculados | No deja enviar. | No hay a quién mandarle la orden. Hay que vincularlos en la obra. |
| Un constructor llamado **"SIN ARQUITECTO"** o **"SIN CONSTRUCTOR"** | Se toma como que no hay constructor. | Es un ítem de relleno del tablero, no una persona. |
| Un destinatario **sin celular** o con un celular **inválido** | No deja enviar y dice cuál es. Se corrige con **Editar**. | El mensaje no llegaría. |
| Dos destinatarios y **no se eligió quién confirma** | No deja enviar. | Ver arriba: una orden, una respuesta. |
| El cliente y el constructor tienen **el mismo celular** | Avisa, pero deja enviar. | Para que verifiques que el enlace le llegue a quien tiene que confirmar. |
| La orden **cambió de estado** mientras la tenías abierta (alguien la canceló o la envió) | No envía nada y avisa. | Para no actuar sobre algo que ya no es como se ve en pantalla. |

Si el envío no termina bien en **90 segundos**, la app lo marca como error y te pide que toques
**Finalizar Operación** igual, para que la orden quede registrada y no pierdas lo cargado. Más
tarde la podés reenviar desde *Consultar Órdenes de Producción*.

### 5.6 Finalizar Operación

**Cuando el envío sale bien, la operación se finaliza sola**: se ve un momento el *Enviado
exitosamente* y enseguida aparece *"Registrando orden y envío en el sistema..."*. Puede demorar
unos segundos: la app está guardando en Monday la orden, su PDF y la constancia del envío. **No
cierres la app mientras tanto.**

El botón **Finalizar Operación** sigue estando, para los casos en que hay que finalizar a mano:
cuando el envío dio error, cuando el registro falló y hay que reintentarlo, o cuando querés
registrar la orden sin enviarla.

Qué queda registrado en Monday:

- **En el tablero de Órdenes de Producción**: la OP con su número, tipo, responsable, quién midió,
  la fecha y la observación; su estado **Enviada Pend Confirmar**, quién confirma y el link al
  PDF. En PVC, además, la OP final adjunta y una línea por abertura y por vidrio.
- **En la obra**: a quién se envió, por qué vía y la actividad **"OP Enviada"** en el historial.
- **En la numeración**: el número usado, para que la próxima orden tome el siguiente.

**¿Por qué todo al final?** Para que en Monday no queden órdenes a medio hacer: se registra
todo junto, cuando la operación está completa.

> **Importante:** si salís de la app **antes de que termine el registro**, la OP queda en el
> tablero con su PDF pero **sin los datos ni el estado del envío**, aunque el WhatsApp ya haya
> salido. Esperá siempre a ver la pantalla de cierre (*"¿Qué deseás hacer ahora?"*).

Si tocás *Finalizar* **sin haber enviado**, la app pregunta: *"La orden todavía no se envió. La
orden se registra en el sistema, pero no le llegó a nadie."* Podés **Finalizar igual** y
enviarla después desde *Consultar Órdenes de Producción*.

Al terminar, la app pregunta **"¿Qué deseás hacer ahora?"**: **Volver a Inicio** o
**Seleccionar Otra Operación**.

### 5.7 Al taller

Al taller **solo se manda una OP confirmada por el cliente o constructor.** Sin esa confirmación
no se fabrica nada.

#### Etapa 1 · Seleccionar Obra

Igual que antes, pero al tocar *Continuar* la app controla:

| Situación | Qué pasa |
| --- | --- |
| La obra **no tiene órdenes** | *"No hay ninguna orden para mandar al taller."* Ofrece **Cargar una OP** (cambia a enviar al cliente). |
| La obra tiene órdenes, pero **ninguna confirmada** | *"Sin la confirmación del cliente o del constructor no se manda nada al taller."* Te dice cuántas están pendientes de confirmar. No deja seguir. |
| La orden confirmada **ya se envió al taller** | *"Una orden que ya está en el taller no se vuelve a enviar."* No deja seguir. |

#### Etapa 2 · Seleccionar OP A Enviar

Aparece una tabla con **todas las OP de la obra**: número, fecha de creación, quién midió, fecha de
medición, estado y el link para **Ver** el documento.

- **Solo se puede tildar una OP confirmada** que todavía no fue al taller.
- Las demás aparecen **apagadas**. Pasando el mouse se ve por qué: *"Sólo se puede enviar al
  taller una orden confirmada."*, *"Esta orden ya se envió al taller: no se vuelve a enviar."* o
  *"Esta orden todavía no tiene la OP final generada."*

¿Por qué? Para que **no se pueda mandar a fabricar por error** una orden cancelada, una que el
cliente no respondió o una que ya está en el taller (eso duplicaría la fabricación).

Si una orden está esperando la respuesta del cliente, la tabla se actualiza sola: apenas el
cliente confirma, la orden se habilita.

#### Etapa 3 · Enviar OP

Revisá el documento con **Abrir documento** y tocá **Confirmar y Enviar**. El destinatario es el
**Taller de fabricación**. Al terminar bien, la OP pasa a **Enviada a taller** y la operación se
finaliza sola.

> El taller recibe la orden de verdad: no hagas pruebas enviando órdenes al taller.

---

## 6. La confirmación del cliente o constructor

Quien confirma recibe por WhatsApp la OP en PDF y un **enlace para confirmar**. Al abrirlo ve:

- Un mensaje con los datos de la orden y la pregunta **"¿La orden se encuentra correcta?"**
- Dos opciones:
  - **Confirmar**: *"La orden es correcta, puede procederse con la fabricación."*
  - **No confirmar**: *"Es necesario revisar algún dato antes de continuar."* En este caso tiene
    que escribir **qué hay que corregir**.
- El botón **Enviar respuesta**.

La respuesta **se registra sola en Monday**. **Nadie de Polifroni puede confirmar una OP en
nombre del cliente**: la confirmación tiene que venir de él. Ustedes no ven el WhatsApp del
cliente; ven el resultado en Monday y en la app:

- Si **confirmó**, la OP pasa a **Confirmada** y ya se puede enviar al taller.
- Si **no confirmó**, la OP queda **No confirmada** con lo que pidió corregir. Lo que sigue es
  **cancelarla** y cargar una nueva corregida.

---

## 7. Operación 2 · Consultar Órdenes de Producción

*"Las órdenes enviadas que esperan la confirmación del cliente o del constructor."*

Esta operación muestra las OP que están en **Pend de Confirmar**, es decir, las que se enviaron y
todavía no tienen respuesta. Sirve para hacerles seguimiento.

**Buscar**

El buscador acepta el **ID de la OP** (por ejemplo, *IDOP-041* o solo *41*), el **número de
orden** o el **nombre de la obra**. La tabla muestra seis órdenes por página, con la obra, la
fecha de creación, quién midió y el estado.

**Acciones de cada orden**

- **Reenviar**: abre, debajo de la fila, el mismo bloque de envío de la sección
  [5.5](#55-el-envío-destinatarios-quién-confirma-y-el-mensaje), con el documento que se envía. Sirve si el
  cliente no recibió el mensaje, lo perdió o hay que mandárselo a otra persona. Se puede reenviar
  las veces que haga falta. La orden **sigue esperando la misma confirmación**; en la obra queda
  la actividad *"OP Reenviada"*.
- **Cancelar**: pide el **motivo** (obligatorio). Por ejemplo, *"el cliente pidió cambiar el
  color a negro"*.
  - La OP **no se borra**: queda en **Cancelada** con el motivo, quién la canceló y cuándo.
  - Después, si hace falta, se carga una OP nueva corregida desde *Cargar y Enviar Órdenes de
    Producción*.

¿Por qué se cancela en vez de borrar? Así, en una obra donde la orden fue cambiando (el cliente la
modificó, pidió otros cambios, se hizo otra), **quedan registradas todas**, cada una con el motivo
por el que dejó de valer, y se sabe cuál es la vigente.

> Para ver **todas** las OP de una obra (confirmadas, enviadas a taller, canceladas), usá el
> tablero **Órdenes de Producción** en Monday, o la tabla de la etapa 2 de *Al taller*.

---

## 8. Resumen: qué valida la app y por qué

| La app… | Porque… |
| --- | --- |
| …solo funciona dentro de Monday, con usuario habilitado y Google Authenticator. | Nadie de afuera de Polifroni puede entrar ni actuar a nombre de otro. |
| …emite cada OP a nombre del usuario que entró, y no deja cambiarlo. | Queda claro quién hizo cada cosa. |
| …no deja seguir si la obra no tiene el tipo (PVC/Aluminio). | Cada tipo tiene su propio camino y su propio documento. |
| …pregunta antes de cargar otra OP en una obra que ya tiene. | Para no duplicar órdenes por error, sin impedir las que sí hacen falta. |
| …exige la orden de HETMO en PVC. | De ahí salen los dibujos, las medidas y los vidrios de la OP final. |
| …pide la ubicación y el celular a coordinar en PVC antes de empezar. | La OP final los lleva, y es mejor saberlo al principio que al final. |
| …calcula el número de orden y no deja editarlo. | Numeración correlativa, sin saltos ni repetidos. Aluminio lleva la "A". |
| …no deja poner una fecha de medición futura. | No se puede haber medido algo que todavía no pasó. |
| …muestra la OP y el mensaje antes de enviar. | Para verificar que no se cargó un archivo equivocado. |
| …no deja enviar sin destinatario o con un celular inválido. | El mensaje no llegaría. |
| …pide un solo responsable de confirmar. | Una orden, una respuesta. |
| …relee el estado de la OP antes de enviar o cancelar. | Otra persona pudo haberla cambiado mientras tanto. |
| …registra todo en Monday recién al **finalizar la operación** (sola, apenas sale el envío). | Para que no queden órdenes a medio hacer en el tablero. |
| …solo deja mandar al taller una OP confirmada que no se haya enviado. | No se fabrica nada sin confirmación, y nada se fabrica dos veces. |
| …no borra OP: las cancela con motivo. | Queda la historia de qué se mandó, qué se aprobó y por qué cambió. |

---

## 9. Preguntas frecuentes y problemas comunes

**La obra dice "Sin tipo" y no me deja seguir.**
Falta cargar si es PVC o Aluminio en la columna *Tipo* de la obra en Monday. Cargalo y volvé a
elegir la obra.

**No encuentro la obra en el buscador.**
Probá con parte del nombre o con el ID, y tocá **Buscar** para buscarla directamente en Monday.

**Me equivoqué de PDF.**
Si todavía no enviaste, en la etapa 2 podés **Eliminar** el documento y cargar el correcto. Si ya
la enviaste, cancelala desde *Consultar Órdenes de Producción* y cargá una nueva.

**El cliente pidió un cambio.**
Cancelá la OP con el motivo (desde *Consultar*) y cargá una nueva desde *Cargar y Enviar*.

**El cliente dice que no le llegó el mensaje.**
Revisá su celular con **Editar** y usá **Reenviar** desde *Consultar Órdenes de Producción*.

**El envío dio error.**
Tocá el botón rojo para reintentar. Si sigue fallando, tocá **Finalizar Operación** para que la
orden quede registrada, y reenviala más tarde desde *Consultar*. Si el problema persiste, contactá
a soporte de TAP.

**Quiero mandar al taller y no me deja.**
La OP tiene que estar **Confirmada** por el cliente o constructor. Si figura *Pend de Confirmar*,
hay que esperar su respuesta (o reenviarle el mensaje).

**La IA no leyó las observaciones.**
Revisá que la obra tenga la ubicación y el celular a coordinar, y probá de nuevo con *Cargar
observaciones*. Si sigue sin leerlas, escribí lo importante en la **Observación** de *Datos de
Medición*: sale al pie de la OP final.

**Perdí o cambié el celular y no puedo entrar.**
Usá uno de tus **códigos de rescate** en el campo del código y volvé a configurar Google
Authenticator. Si no los tenés, contactá a soporte de TAP.

**¿Quién atiende los problemas?**
Soporte de TAP (The Automation Partner).
