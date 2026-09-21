import { useCallback, useEffect, useRef, useState } from 'react'
import { ESCENARIO, EscenarioNoConfigurado, dispararEscenario } from '@/services/make'
import { normalizarNombre, type Abertura } from './observaciones'

export type FaseLectura = 'idle' | 'leyendo' | 'listo' | 'error'

export interface EstadoLectura {
  fase: FaseLectura
  segundos: number
  /** Qué salió mal, en palabras de quien mira la pantalla. */
  problema: string
}

/** Lo que devuelve el escenario: una entrada por dibujo del documento. */
interface FilaRespuesta {
  nombre?: unknown
  observacion?: unknown
}

/**
 * El cuerpo de la respuesta, aunque venga roto.
 *
 * El módulo *Webhook response* del escenario arma su cuerpo interpolando texto:
 *
 *     { "observaciones": {{24.jsonResponse.observaciones}} }
 *
 * y Make interpola una lista pegando sus elementos con comas, SIN los corchetes del array. El
 * resultado es `{"observaciones":{…}, {…}, {…}}`, que no es JSON válido aunque traiga los datos
 * completos. Se los recupera poniendo los corchetes que faltan.
 *
 * Es una reparación acotada a ese caso: si el cuerpo ya era válido nunca se llega acá, y si está
 * roto de otra forma la reparación tampoco parsea y se devuelve `null`.
 */
function cuerpoDe(respuesta: { cuerpo: Record<string, unknown> | null; texto: string }) {
  if (respuesta.cuerpo) return respuesta.cuerpo
  const texto = respuesta.texto.trim()
  if (!texto.includes('"observaciones"')) return null

  const conCorchetes = texto.replace(/("observaciones"\s*:\s*)([\s\S]*?)(\s*}\s*)$/, '$1[$2]$3')
  try {
    const datos = JSON.parse(conCorchetes) as unknown
    return datos && typeof datos === 'object' ? (datos as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** La respuesta, convertida en aberturas. `null` si no vino con la forma esperada. */
function aAberturas(cuerpo: Record<string, unknown> | null): Abertura[] | null {
  const lista = cuerpo?.observaciones
  if (!Array.isArray(lista)) return null

  const aberturas: Abertura[] = []
  lista.forEach((fila: FilaRespuesta, i) => {
    const nombre = typeof fila?.nombre === 'string' ? normalizarNombre(fila.nombre) : ''
    /* El escenario manda `null` cuando el documento no trae observación para ese dibujo: es un
       dato, no un error. La abertura existe igual y su caja va vacía, lista para escribirla. */
    const texto = typeof fila?.observacion === 'string' ? fila.observacion.trim() : ''
    /* Sin nombre no se puede identificar la abertura, pero tampoco se la puede descartar: el
       documento la tiene. Se la numera por su posición. */
    aberturas.push({ nombre: nombre || `V${i + 1}`, texto })
  })
  return aberturas
}

/**
 * Lectura del ETMO para saber QUÉ aberturas tiene.
 *
 * A diferencia de los otros escenarios, éste no deja su resultado en el tablero: lo devuelve en la
 * respuesta del webhook. Por eso acá no hay nada que ir a mirar después —si la respuesta no llega,
 * no llegó— y la espera es una sola, con su reloj.
 */
export function useLeerObservaciones(itemId: string) {
  const [estado, setEstado] = useState<EstadoLectura>({
    fase: 'idle',
    segundos: 0,
    problema: '',
  })
  const corriendo = useRef(false)

  /* El reloj de la espera. Vive acá y no en el `await` porque lo que se dibuja es el paso del
     tiempo, no el final. */
  useEffect(() => {
    if (estado.fase !== 'leyendo') return
    const t = setInterval(() => setEstado((e) => ({ ...e, segundos: e.segundos + 1 })), 1000)
    return () => clearInterval(t)
  }, [estado.fase])

  const leer = useCallback(async (): Promise<Abertura[] | null> => {
    if (corriendo.current) return null
    corriendo.current = true
    setEstado({ fase: 'leyendo', segundos: 0, problema: '' })

    try {
      const respuesta = await dispararEscenario(ESCENARIO.leerObservaciones, itemId)

      if (respuesta.sinRespuesta) {
        setEstado((e) => ({
          ...e,
          fase: 'error',
          problema:
            'El escenario tardó más de lo que el servidor espera. Puede que haya terminado igual: volvé a intentar, o cargá las aberturas a mano.',
        }))
        return null
      }

      const aberturas = aAberturas(cuerpoDe(respuesta))
      if (!aberturas) {
        /* El caso típico: Make contesta "Accepted". Eso significa que TOMÓ el pedido pero el
           escenario terminó antes de su módulo de respuesta —su router filtra por dirección,
           celular y archivo adjunto—, así que no hay lista que devolver. Decirlo evita que se
           busque el problema de este lado. */
        setEstado((e) => ({
          ...e,
          fase: 'error',
          problema:
            'El escenario tomó el pedido pero no devolvió la lista de aberturas. Suele ser que cortó en su filtro: revisá que la obra tenga la Orden ETMO adjunta, la ubicación y el celular a coordinar.',
        }))
        return null
      }
      if (aberturas.length === 0) {
        setEstado((e) => ({
          ...e,
          fase: 'error',
          problema: 'El escenario no encontró ninguna abertura en el documento.',
        }))
        return null
      }

      setEstado((e) => ({ ...e, fase: 'listo' }))
      return aberturas
    } catch (e) {
      setEstado((prev) => ({
        ...prev,
        fase: 'error',
        problema:
          e instanceof EscenarioNoConfigurado
            ? import.meta.env.DEV
              ? 'El pedido no salió de esta máquina: no hay ruta para el escenario. Cargá MAKE_WEBHOOK_LEER_OBSERVACIONES en .env.local (o dejá que use el deploy con APP_URL) y reiniciá npm run dev.'
              : 'Falta cargar la URL del escenario de observaciones en las variables del proyecto.'
            : 'No se pudo hablar con el escenario que lee el documento.',
      }))
      return null
    } finally {
      corriendo.current = false
    }
  }, [itemId])

  const limpiar = useCallback(() => {
    setEstado({ fase: 'idle', segundos: 0, problema: '' })
  }, [])

  return { estado, leer, limpiar, leyendo: estado.fase === 'leyendo' }
}
