/**
 * Validación y armado del número de WhatsApp: el `ValidarTelWsp` del escenario de envío de Make,
 * pasado a la app.
 *
 * Un número válido para WhatsApp es 549 + característica (sin el 0) + número (sin el 15), y la
 * característica y el número juntos suman 10 dígitos: 5492494122557. Acá se acepta cómo lo escribe
 * la gente —"0249 15 412-2557", "+54 9 249 4122557", "2494122557"— y se lo lleva a esa forma. Lo que
 * no se puede llevar a esa forma con seguridad, no se manda.
 */

export interface TelValidado {
  success: boolean
  /** El número listo para la API (sólo dígitos, con el 549), o lo que se pudo leer si no es válido. */
  phone: string
}

/** El "15" de los celulares va después de la característica, que tiene 2, 3 o 4 dígitos. */
function sinQuince(nacional: string): string | null {
  for (const p of [2, 3, 4]) {
    if (nacional.slice(p, p + 2) === '15') {
      const sin = nacional.slice(0, p) + nacional.slice(p + 2)
      if (sin.length === 10) return sin
    }
  }
  return null
}

export function validarTelWsp(texto: string): TelValidado {
  let d = String(texto ?? '').replace(/\D/g, '')
  const original = d
  if (!d) return { success: false, phone: '' }
  if (d.startsWith('00')) d = d.slice(2)
  /* Con el código de país: se quita, y también el 9 de los móviles, para quedarse con lo nacional. */
  if (d.startsWith('54') && d.length >= 12) {
    d = d.slice(2)
    if (d.startsWith('9') && d.length === 11) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 12) d = sinQuince(d) ?? d
  if (!/^\d{10}$/.test(d)) return { success: false, phone: original }
  return { success: true, phone: `549${d}` }
}

/** El mensaje de error del escenario, con el número que no sirvió. */
export const mensajeTelInvalido = (numero: string, nombre?: string) =>
  `No se pudo enviar el mensaje por WhatsApp${nombre ? ` a ${nombre}` : ''}: el número de teléfono es inválido.

Número cargado: ${numero || '(sin número)'}

<strong>Cómo debe armarse un número válido para WhatsApp:</strong>
549 + característica (sin el 0) + número (sin el 15)

<strong>Ejemplo: 5492494122557</strong>
- 54 → código de país (Argentina)
- 9 → obligatorio: es el que identifica al celular en WhatsApp
- 249 → característica
- 4122557 → número

La característica y el número juntos deben sumar 10 dígitos.

Puede clickear en Editar para actualizar el numero de celular y reintentar el envio. Si luego de corregir el error persiste, contactese con el soporte de TAP.`
