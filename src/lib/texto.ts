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

/** Palabras que van en minúscula en medio de un título: "Etapa de Venta", "Confirmar y Enviar al Taller". */
const MENORES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'al', 'en', 'por', 'con', 'o'])

/**
 * Rótulo con Mayúscula Inicial en cada palabra: "ETAPA DE PRODUCCION" → "Etapa de Produccion".
 *
 * Las siglas cortas que ya vienen en mayúscula se respetan ("OP", "ID", "PVC", "CTA" no: "Cta" es
 * como se escribe en el tablero). Los conectores van en minúscula salvo al principio.
 */
export function tituloPalabras(texto: string): string {
  const SIGLAS = new Set(['OP', 'ID', 'PVC', 'DVH', 'CV', 'IVA', 'CUIT', 'ETMO', 'HETMO'])
  return texto
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const limpia = w.replace(/[^\p{L}\p{N}]/gu, '')
      if (SIGLAS.has(limpia.toUpperCase()) && limpia === limpia.toUpperCase()) return w
      const min = w.toLocaleLowerCase('es')
      /* El conector se reconoce sin la puntuación pegada: "a:" en "Asignado a:" también lo es. */
      if (i > 0 && MENORES.has(limpia.toLocaleLowerCase('es'))) return min
      /* Mayúscula al principio de la palabra y después de una barra: "Constructor/Arquitecto". */
      return min.replace(
        /(^|\/)(\p{L})/gu,
        (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es'),
      )
    })
    .join(' ')
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
