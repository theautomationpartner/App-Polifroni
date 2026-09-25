# Actividades de Monday CRM sobre la obra

Las actividades de la línea de tiempo de la obra (Emails & Activities) se crean con la mutación
`create_timeline_item` de la API de Monday. Cada una usa una **actividad personalizada** de la
cuenta, que define su nombre, su color y su ícono.

## Actividades personalizadas de la cuenta

| Actividad | `custom_activity_id` |
|---|---|
| OP Enviada | `2a577f76-e14f-4e36-8ebc-68912434487a` |
| OP Confirmada x Client | `e61dc320-5aa0-4d44-bef0-0f25fbbbf47b` |
| Nuevo mensaje WhatsApp | `e46503be-08fe-4ea0-806d-20e0f244c7a1` |
| Gestion de Cobranza | `614960d6-0777-4158-a1fb-379d2660aa75` |

Para ver la lista actualizada:

```graphql
query { custom_activity { id name color icon_id } }
```

> Todavía **no existe** una actividad para "OP No Confirmada". Se crea una sola vez con:
>
> ```graphql
> mutation {
>   create_custom_activity(name: "OP No Confirmada x Client", color: PARADISE_PINK, icon_id: FLAG) { id }
> }
> ```
>
> El `id` que devuelve es el que se usa después en `custom_activity_id`.

## La mutación

```graphql
mutation (
  $item: ID!
  $act: String!
  $title: String!
  $summary: String
  $content: String
  $ts: ISO8601DateTime!
  $url: String
  $phone: String
) {
  create_timeline_item(
    item_id: $item
    custom_activity_id: $act
    title: $title
    summary: $summary
    content: $content
    timestamp: $ts
    url: $url
    phone: $phone
  ) { id }
}
```

- `item`: el id de la **obra** (tablero 🪟 Obras).
- `summary`: una línea; es lo que se lee sin abrir la actividad.
- `content`: el detalle, en HTML simple (`<p>`, `<b>`, `<a>`). Monday lo muestra con formato.
- `timestamp`: cuándo pasó, en ISO 8601 (`2026-09-25T17:32:00Z`).
- `url` y `phone`: opcionales.

Probado contra la cuenta con `API-Version: 2024-10`.

## Cómo se arma el contenido

**Cada dato va con su título**, el mismo nombre que tiene la columna en el tablero
**Orden de Produccion**. Nunca un valor suelto: quien lee la actividad tiene que saber a qué se
refiere sin abrir el tablero.

| Título en la actividad | Columna del tablero Orden de Produccion |
|---|---|
| Fecha De Envío | (cuándo se envió) |
| N° OP PVC / N° OP Aluminio | `numeric_mm7ep0eq` / `text_mm7gjg24` (según el tipo) |
| N° OP HETMO | `text_mm7g5hbe` |
| Tipo | `color_mm7gbz9q` |
| Enviada A Cliente / Enviada A Constructor | nombre — Teléfono (uno por destinatario) |
| Medido Por | `text_mm7gq0gg` |
| Fecha De Medición | `date_mm7gejvf` |
| Observación | `long_text_mm7g7k7n` |
| Link PDF | el link que devuelve el webhook |

Cada renglón es un `<p>` con el título en negrita:

```html
<p><b>N° OP HETMO:</b> 9502 - V1</p>
```

## OP Enviada (la crea la app)

Cuando el webhook de envío (`MAKE_WEBHOOK_ENVIAR_OP`) contesta, la app crea la actividad con todos
los renglones de la tabla de arriba. Ejemplo de cómo queda:

```html
<p><b>Fecha De Envío:</b> 25 de septiembre - 14:32 hs</p>
<p><b>N° OP Aluminio:</b> A3001</p>
<p><b>N° OP HETMO:</b> 9502 - V1</p>
<p><b>Tipo:</b> Aluminio</p>
<p><b>Enviada A Cliente:</b> test luciano — <b>Teléfono:</b> 5492494240181</p>
<p><b>Enviada A Constructor:</b> TEST Arquitecto 1 — <b>Teléfono:</b> 5492494014611</p>
<p><b>Medido Por:</b> Otro</p>
<p><b>Fecha De Medición:</b> 25/09/2026</p>
<p><b>Observación:</b> Test - Midió y funcionó</p>
<p><b>Link PDF:</b> <a href="https://drive.google.com/file/d/...">https://drive.google.com/file/d/...</a></p>
```

**Lo que tiene que devolver el Webhook response del envío** para que la actividad lleve el link:

```json
{
  "msj_cliente_arquitecto": "enviado",
  "linkPdf": "{{35.shareLink}}"
}
```

(`35` es el módulo de Google Drive "Crear URL compartida". La app también acepta la clave
`shareLink` o `webContentLink`).

## Las mismas actividades desde Make

En Make, un módulo **monday.com → Execute a GraphQL query**. En los ejemplos, `OP` es el número del
módulo que trae el ítem de **Orden de Produccion** (en el escenario de envío es el `4`, "Obtener
Datos De Orden Produccion") y `OBRA` el que trae la obra. Reemplazalos por los números reales.

Los renglones son los mismos para las tres actividades; sólo cambian el id, el título, el primer
renglón (qué pasó y cuándo) y, en el rechazo, el motivo.

### Renglones comunes (con sus títulos)

```text
<p><b>{{if(OP.mappable_column_values.color_mm7gbz9q.text = "PVC"; "N° OP PVC"; "N° OP Aluminio")}}:</b> {{ifempty(OP.mappable_column_values.text_mm7gjg24; OP.mappable_column_values.numeric_mm7ep0eq)}}</p>
<p><b>N° OP HETMO:</b> {{OP.mappable_column_values.text_mm7g5hbe}}</p>
<p><b>Tipo:</b> {{OP.mappable_column_values.color_mm7gbz9q.text}}</p>
<p><b>Medido Por:</b> {{OP.mappable_column_values.text_mm7gq0gg}}</p>
<p><b>Fecha De Medición:</b> {{formatDate(OP.mappable_column_values.date_mm7gejvf.date; "DD/MM/YYYY")}}</p>
<p><b>Observación:</b> {{escapeHTML(OP.mappable_column_values.long_text_mm7g7k7n.text)}}</p>
<p><b>Link PDF:</b> <a href='{{LINK_PDF}}'>{{LINK_PDF}}</a></p>
```

> Dentro de la consulta, los atributos HTML van con comilla **simple** (`href='...'`): la comilla
> doble cierra el texto de GraphQL. Por lo mismo, los textos que escribe una persona (observación,
> motivo, nombre) pasan por `escapeHTML(...)`, que convierte sus comillas en `&quot;`.
>
> Adentro de las llaves de Make (`formatDate(...)`, `if(...)`) las comillas van **sin** barra
> invertida: Make resuelve la fórmula antes de mandar la consulta.

### OP Enviada

```graphql
mutation {
  create_timeline_item(
    item_id: {{OBRA.id}}
    custom_activity_id: "2a577f76-e14f-4e36-8ebc-68912434487a"
    title: "OP Enviada"
    summary: "Enviada a {{ITERATOR.tipo}} {{ITERATOR.nombre_destinatario}}"
    content: "<p><b>Fecha De Envío:</b> {{formatDate(now; "D [de] MMMM - HH:mm"; "America/Argentina/Buenos_Aires")}} hs</p><p><b>Enviada A {{ITERATOR.tipo}}:</b> {{ITERATOR.nombre_destinatario}} — <b>Teléfono:</b> {{ITERATOR.whatsapp_destinatario}}</p> + RENGLONES COMUNES"
    timestamp: "{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}"
  ) { id }
}
```

### OP Confirmada x Client

```graphql
mutation {
  create_timeline_item(
    item_id: {{OBRA.id}}
    custom_activity_id: "e61dc320-5aa0-4d44-bef0-0f25fbbbf47b"
    title: "OP Confirmada x Client"
    summary: "El cliente confirmó la Orden de Producción"
    content: "<p><b>Fecha De Confirmación:</b> {{formatDate(now; "D [de] MMMM - HH:mm"; "America/Argentina/Buenos_Aires")}} hs</p><p><b>Confirmó:</b> {{escapeHTML(NOMBRE_CLIENTE)}}</p> + RENGLONES COMUNES"
    timestamp: "{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}"
  ) { id }
}
```

### OP No Confirmada x Client

Con el id de la actividad "OP No Confirmada x Client" (crearla primero, ver arriba):

```graphql
mutation {
  create_timeline_item(
    item_id: {{OBRA.id}}
    custom_activity_id: "ID_DE_OP_NO_CONFIRMADA"
    title: "OP No Confirmada x Client"
    summary: "El cliente rechazó la Orden de Producción"
    content: "<p><b>Fecha De Rechazo:</b> {{formatDate(now; "D [de] MMMM - HH:mm"; "America/Argentina/Buenos_Aires")}} hs</p><p><b>Rechazó:</b> {{escapeHTML(NOMBRE_CLIENTE)}}</p><p><b>Motivo:</b> {{escapeHTML(MOTIVO)}}</p> + RENGLONES COMUNES"
    timestamp: "{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}"
  ) { id }
}
```

"+ RENGLONES COMUNES" significa pegar ahí, en el mismo texto y sin saltos de línea, los renglones
de la sección de arriba.
