/**
 * Disparo de los escenarios de Make.
 *
 * Los escenarios YA están desarrollados (leer el PDF de ETMO con IA y armar la OP final; enviar la
 * OP al cliente por WhatsApp). La app no reimplementa nada de eso: sólo toca el timbre y después
 * mira el tablero, que es donde el escenario deja el resultado.
 *
 * Cada hook vive detrás de una ruta del propio origen (`/make/...`, ver `vite.config.ts`): el hook
 * de Make no responde con cabeceras CORS, así que pegarle directo desde el navegador falla, y de
 * paso la URL del escenario no queda escrita en el bundle.
 */
import { BOARD_OBRAS } from '../monday/columns'

/** Los escenarios que la app puede disparar, con la ruta local que los representa. */
export const ESCENARIO = {
  leerDocumento: '/make/leer-documento',
  enviarOpCliente: '/make/enviar-op-cliente',
  enviarOpTaller: '/make/enviar-op-taller',
} as const

export type Escenario = (typeof ESCENARIO)[keyof typeof ESCENARIO]

/** El escenario no está configurado en el entorno: la ruta del proxy no existe y Vite devuelve 404. */
export class EscenarioNoConfigurado extends Error {
  constructor(ruta: string) {
    super(`El escenario de Make para "${ruta}" no está configurado en .env.local.`)
    this.name = 'EscenarioNoConfigurado'
  }
}

/**
 * Cuerpo del pedido.
 *
 * Va con DOS formas a la vez a propósito. Los escenarios hoy los dispara el botón de Monday, que
 * manda `{ event: { pulseId, boardId, ... } }`; si el escenario lee esa forma, la encuentra igual.
 * Y arriba van los mismos datos en plano (`itemId`, `boardId`), que es como los espera un webhook
 * escrito a mano. Mandar los dos sobres evita tener que adivinar cuál abre el escenario.
 */
function cuerpo(itemId: string, extra: Record<string, unknown>) {
  return {
    itemId,
    boardId: String(BOARD_OBRAS),
    pulseId: Number(itemId),
    origen: 'app-obras-polifroni',
    disparadoEn: new Date().toISOString(),
    ...extra,
    event: {
      pulseId: Number(itemId),
      boardId: BOARD_OBRAS,
      type: 'app_trigger',
      app: 'obras-polifroni',
      ...extra,
    },
  }
}

/**
 * Dispara un escenario y devuelve lo que contestó, como texto.
 *
 * El tiempo de espera es largo (3 minutos) porque del otro lado hay un módulo de IA leyendo un PDF.
 * Aun así, la respuesta del hook NO es el resultado del proceso: quien dice si salió bien es el
 * tablero. Por eso el que llama sigue con `esperarEnTablero`.
 */
export async function dispararEscenario(
  escenario: Escenario,
  itemId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const control = new AbortController()
  const corte = setTimeout(() => control.abort(), 180_000)

  try {
    const res = await fetch(escenario, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo(itemId, extra)),
      signal: control.signal,
    })
    /* Sin URL configurada, la ruta no existe: el 404 lo devuelve Vite, no Make. Se distingue para
       poder decir en pantalla "falta configurar el escenario" en vez de "el escenario falló". */
    if (res.status === 404) throw new EscenarioNoConfigurado(escenario)
    if (!res.ok) throw new Error(`El escenario respondió HTTP ${res.status}`)
    return (await res.text()).trim()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('El escenario de Make tardó más de 3 minutos en responder.')
    }
    throw e
  } finally {
    clearTimeout(corte)
  }
}
