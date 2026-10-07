/**
 * El texto del WhatsApp con que sale la Orden de Producción al cliente o al constructor. Son las
 * plantillas que la app muestra en "Ver mensaje" (`src/features/envio/MensajeEjemplo.tsx`), con el
 * formato de WhatsApp (*negrita*). Si se cambia una, hay que cambiar la otra.
 *
 *  - Primer envío, reenvío y OP editada ("Editar Órdenes de Producción"): el enlace para confirmar va SÓLO a quien confirma (el destinatario con la
 *    etiqueta de Confirmador). Al otro le llega el mismo mensaje, sin el enlace.
 *
 * `enlace` es `null` para quien no confirma.
 */

/* El enlace para confirmar (firmado, a `/confirmar` de la app) lo arma `enlaceConfirmacion` de
   `_confirmacion.ts`: acá sólo están los textos. */

export function textoPrimerEnvio(nombre: string, enlace: string | null): string {
  const cierre = enlace
    ? `Una vez aprobada, la orden pasa directamente a producción. *La tenés que confirmar por acá:* ${enlace}`
    : 'Una vez aprobada, la orden pasa directamente a producción.'
  return `Hola *${nombre}* 👋

🧾 Te adjuntamos *Orden de Producción*.

Te pedimos por favor que verifiques con atención estos ítems:
- Datos del cliente, teléfono y dirección de obra.
- Color de aberturas.
- Tipologías de aberturas.
- Manos de apertura (los gráficos son vistos desde el interior).
- Composición de vidrios.
- Si la compra incluye mosquiteros, que figuren en la orden.

Si necesitás realizar algún cambio o detectás un error, avisanos.

${cierre}

¡Gracias por tu confianza!
🏠 Polifroni Aberturas`
}

/** La OP final nueva de una orden editada: se le pide que revise los cambios que pidió. */
export function textoEdicion(nombre: string, enlace: string | null): string {
  const cierre = enlace
    ? `Una vez aprobada, la orden pasa directamente a producción. *La tenés que confirmar por acá:* ${enlace}`
    : 'Una vez aprobada, la orden pasa directamente a producción.'
  return `Hola *${nombre}* 👋

🧾 Te adjuntamos la *nueva Orden de Producción*.

Te pedimos por favor que verifiques que los cambios que nos pediste realizar sean correctos, y valides que la orden contenga:
- Datos del cliente, teléfono y dirección de obra.
- Color de aberturas.
- Tipologías de aberturas.
- Manos de apertura (los gráficos son vistos desde el interior).
- Composición de vidrios.
- Si la compra incluye mosquiteros, que figuren en la orden.

Cualquier cambio faltante o erroneo por favor avisanos.
${cierre}

¡Gracias por tu confianza!
🏠 Polifroni Aberturas`
}

/** El jefe del taller de fabricación: el mensaje al taller lo saluda por su nombre. */
export const JEFE_TALLER = 'Alfredo'

/**
 * La OP confirmada, al taller de fabricación (con el PDF de la OP final detrás). Sin enlace: el
 * taller no confirma nada. `obra` es el nombre de la obra y `material`, su tipo (PVC o Aluminio).
 */
export function textoTaller(obra: string, material: string): string {
  return `👋 Hola *${JEFE_TALLER}*

Adjunto la *orden de producción* para:

- 🏗️  *Obra:* ${obra}
- 🔨  *Material:* ${material}

¡Cualquier duda comunicate con nosotros!
Polifroni Aberturas
Automatizado por *The Automation Partner*`
}

export function textoReenvio(nombre: string, enlace: string | null): string {
  const cierre = enlace
    ? `📌 *RECORDÁ* que para comenzar con la produccion necesitamos tu confirmacion. Podes confirmar la orden con el siguiente link: ${enlace}`
    : '📌 Recordá que, una vez aprobada, la orden pasa directamente a producción.'
  return `Hola *${nombre}* 👋

🔁 Te *REENVIAMOS* la *Orden de Producción* para que puedas revisarla y, si está todo bien, confirmarla.

Te pedimos que verifiques con atención estos ítems:
- Datos del cliente, teléfono y dirección de obra
- Color de las aberturas
- Tipologías de las aberturas
- Manos de apertura (los gráficos están vistos desde el interior)
- Composición de los vidrios
- Mosquiteros: si los incluiste en la compra, chequeá que figuren en la orden

Si necesitás hacer algún cambio o detectás un error, avisanos y lo corregimos.
${cierre}

¡Gracias por tu confianza!
Polifroni Aberturas
Automatizado por *The Automation Partner*`
}
