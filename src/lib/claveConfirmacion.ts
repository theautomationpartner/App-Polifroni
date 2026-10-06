/**
 * La clave del enlace de confirmación, para la Orden de Producción y para el presupuesto.
 *
 * Cuando sale el mensaje el ítem de Monday puede no existir todavía (nace al finalizar), así que la
 * app genera una clave única al enviar y la guarda en `🤖Clave Confirmacion` cuando registra el envío
 * en Monday. El enlace lo arma y lo FIRMA el servidor (`api/_confirmacion.ts`): la app sólo le manda la
 * clave. Con ella `/confirmar` encuentra la OP o el presupuesto que se responde.
 */

export function nuevaClave(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  /* Navegadores viejos sin randomUUID: 16 bytes al azar en hexadecimal. */
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Dónde va el enlace en un texto que arma la app (el del presupuesto): el servidor la reemplaza por el
 * enlace firmado. La misma marca está en `api/_confirmacion.ts` (`MARCA_ENLACE`).
 */
export const MARCA_ENLACE = '[[ENLACE_CONFIRMACION]]'
