/**
 * Disparo de los escenarios de Make.
 *
 * Los escenarios YA están desarrollados (leer el PDF de ETMO con IA y armar la OP final; enviar la
 * OP al cliente por WhatsApp). La app no reimplementa nada de eso: sólo toca el timbre y después
 * mira el tablero, que es donde el escenario deja el resultado.
 *
 * Nunca se le pega al hook directo desde el navegador: no responde con cabeceras CORS y, además,
 * su URL es un secreto —quien la tenga puede disparar el escenario—. En desarrollo lo tapa el proxy
 * de Vite (`/make/...`) y en producción la Serverless Function `/api/make`, que en los dos casos
 * leen la URL de una variable de entorno del servidor.
 */
import { BOARD_OBRAS } from '../monday/columns'

/** Los escenarios que la app puede disparar. El nombre es el mismo en los dos entornos. */
export const ESCENARIO = {
  leerDocumento: 'leer-documento',
  enviarOpCliente: 'enviar-op-cliente',
  enviarOpTaller: 'enviar-op-taller',
} as const

export type Escenario = (typeof ESCENARIO)[keyof typeof ESCENARIO]

/** A qué ruta del propio origen le pega cada escenario, según el entorno. */
const rutaDe = (escenario: Escenario): string =>
  import.meta.env.DEV ? `/make/${escenario}` : `/api/make?escenario=${escenario}`

/** El escenario no está configurado en el entorno: no hay URL a la que mandar el pedido. */
export class EscenarioNoConfigurado extends Error {
  constructor(escenario: string) {
    super(`El escenario de Make "${escenario}" no tiene URL configurada.`)
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
 * Lo que contestó el escenario.
 *
 * El escenario tiene un módulo *Webhook response* al final de CADA rama del router, así que la
 * respuesta dice cómo terminó:
 *  - rama de error:  `{ "error_update_id": "<id del update>" }`
 *  - rama de éxito:  `{ "estado": "true" }`
 *
 * Pero la respuesta llega recién cuando esa rama TERMINA, y el camino de éxito incluye leer el PDF
 * con IA y armar el documento. Esa espera puede pasarse del tope de la función que hace de puente
 * (y del que el propio Make mantiene abierta la conexión). Cuando eso pasa no hay respuesta y no
 * pasó nada malo: el escenario sigue, y quien contesta es el tablero. Eso es `sinRespuesta`.
 */
export interface RespuestaEscenario {
  /** El cuerpo ya parseado, si vino JSON. */
  cuerpo: Record<string, unknown> | null
  /** No hubo respuesta a tiempo. NO es un fallo: el escenario recibió el pedido igual. */
  sinRespuesta: boolean
}

/** El id del update que el escenario dejó al fallar, si la respuesta lo trae. */
export const updateDeError = (r: RespuestaEscenario): string | null => {
  const id = r.cuerpo?.error_update_id
  return id ? String(id) : null
}

/** La respuesta dice que la orden se generó. */
export const terminoBien = (r: RespuestaEscenario): boolean =>
  String(r.cuerpo?.estado ?? '') === 'true'

/**
 * Dispara un escenario y espera su respuesta.
 *
 * El tiempo de espera es largo (3 minutos) porque del otro lado hay un módulo de IA leyendo un PDF.
 * Si la respuesta no llega, no se lanza error: se devuelve `sinRespuesta` y el que llamó sigue
 * mirando el tablero, que es donde el escenario deja el resultado pase lo que pase.
 */
export async function dispararEscenario(
  escenario: Escenario,
  itemId: string,
  extra: Record<string, unknown> = {},
): Promise<RespuestaEscenario> {
  const control = new AbortController()
  const corte = setTimeout(() => control.abort(), 180_000)

  try {
    const res = await fetch(rutaDe(escenario), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo(itemId, extra)),
      signal: control.signal,
    })
    /* Sin URL configurada la ruta contesta 404 —en desarrollo porque no existe, en producción
       porque la función lo dice—. Se distingue para poder avisar "falta configurar el escenario"
       en vez de "el escenario falló". */
    if (res.status === 404) throw new EscenarioNoConfigurado(escenario)
    /* Que se corte la ESPERA no es que el escenario haya fallado: el hook ya recibió el pedido y
       está trabajando. Pasa de verdad en producción, donde la función serverless tiene un tope de
       duración más corto que un escenario que lee un PDF con IA. Se sigue de largo y lo resuelve
       la lectura del tablero, que es la que sabe cómo terminó. */
    if (res.status === 504 || res.status === 408) return { cuerpo: null, sinRespuesta: true }
    if (!res.ok) throw new Error(`El escenario respondió HTTP ${res.status}`)

    const texto = (await res.text()).trim()
    /* El cuerpo se parsea con cuidado: un webhook puede contestar "Accepted" a secas, y eso no es
       JSON ni es un problema. Sin cuerpo entendible, decide el tablero. */
    try {
      const datos = JSON.parse(texto) as unknown
      const cuerpo = datos && typeof datos === 'object' ? (datos as Record<string, unknown>) : null
      return { cuerpo, sinRespuesta: false }
    } catch {
      return { cuerpo: null, sinRespuesta: false }
    }
  } catch (e) {
    // Mismo caso que el 504, pero cortado de este lado.
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { cuerpo: null, sinRespuesta: true }
    }
    throw e
  } finally {
    clearTimeout(corte)
  }
}
