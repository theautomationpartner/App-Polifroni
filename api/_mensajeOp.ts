/**
 * El texto del WhatsApp con que sale la Orden de Producción al cliente o al constructor. Son las
 * plantillas que la app muestra en "Ver mensaje" (`src/features/envio/MensajeEjemplo.tsx`), con el
 * formato de WhatsApp (*negrita*). Si se cambia una, hay que cambiar la otra.
 *
 *  - Primer envío: a cada destinatario, con el enlace para confirmar.
 *  - Reenvío: el enlace va sólo a quien confirma; al otro, el recordatorio.
 */

/**
 * El formulario de confirmación de la OP (escenario de Make, fuera de la app). Sale SÓLO de la
 * variable: el repositorio es público, y con la URL a la vista cualquiera podría mandarle respuestas
 * falsas al escenario (confirmar una orden que nadie confirmó).
 */
const urlConfirmar = (): string => process.env.CONFIRMAR_OP_URL?.trim() ?? ''

/** Sin la URL no se manda ninguna OP: saldría un mensaje sin el enlace para confirmarla. */
export const confirmacionConfigurada = (): boolean => !!urlConfirmar()

export interface DatosEnlace {
  /** La OP del tablero. En una orden nueva todavía no existe (nace al finalizar): va vacía. */
  ordenId: string | null
  obraId: string
  nombre: string
  /** Con la OP sin crear, el formulario la reconoce por la obra, su número y su tipo. */
  numero?: string
  tipo?: string
}

export function enlaceConfirmacion(d: DatosEnlace): string {
  const q = new URLSearchParams({ itemId: d.ordenId ?? '', itemIdObra: d.obraId, nombre: d.nombre })
  if (!d.ordenId) {
    if (d.numero) q.set('nroOrden', d.numero)
    if (d.tipo) q.set('tipo', d.tipo)
  }
  const url = urlConfirmar()
  if (!url) throw new Error('falta CONFIRMAR_OP_URL')
  return `${url}?${q.toString()}`
}

export function textoPrimerEnvio(nombre: string, enlace: string): string {
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

Una vez aprobada, la orden pasa directamente a producción. *La tenés que confirmar por acá:* ${enlace}

¡Gracias por tu confianza!
🏠 Polifroni Aberturas`
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
