/** Utilidades de texto para mostrar en pantalla lo que viene del tablero. */

/**
 * Convierte el HTML de un update de Monday en texto plano.
 *
 * Los updates traen HTML armado por personas y por escenarios (menciones, negritas, saltos); se
 * muestran como TEXTO y no con `dangerouslySetInnerHTML`: ninguna de las dos fuentes está bajo el
 * control de la app, y un historial no necesita estilos propios para leerse.
 */
export function htmlATexto(html: string): string {
  const conSaltos = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<li>/gi, '• ')
  const doc = new DOMParser().parseFromString(conSaltos, 'text/html')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Fecha ISO de Monday → "dd/MM/yyyy HH:mm", que es como se lee un historial. */
export function fechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Deja un número de teléfono en la forma que espera wa.me: sólo dígitos, sin el `+` ni separadores.
 * Monday los devuelve ya con el código de país (549…).
 */
export const soloDigitos = (telefono: string): string => telefono.replace(/\D/g, '')
