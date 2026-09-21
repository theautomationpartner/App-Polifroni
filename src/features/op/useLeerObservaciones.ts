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

      const aberturas = aAberturas(respuesta.cuerpo)
      if (!aberturas) {
        setEstado((e) => ({
          ...e,
          fase: 'error',
          problema: 'El escenario contestó, pero no con la lista de aberturas.',
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
            ? 'Falta configurar el escenario de lectura de observaciones en el servidor.'
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
