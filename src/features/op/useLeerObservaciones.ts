import { useCallback, useEffect, useRef, useState } from 'react'
import { ESCENARIO, EscenarioNoConfigurado, dispararEscenario } from '@/services/make'
import type { VidrioLeido } from '@/services/monday'
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
export function cuerpoDe(respuesta: { cuerpo: Record<string, unknown> | null; texto: string }) {
  if (respuesta.cuerpo) return respuesta.cuerpo
  const texto = respuesta.texto.trim()
  if (!texto.includes('"observaciones"')) return null

  /* La respuesta trae DOS listas interpoladas así —`observaciones` y `vidrios`—, y a las dos les
     pueden faltar los corchetes. Se toma el tramo de cada clave hasta la siguiente (o hasta el
     cierre) y se le ponen si no los tiene. Una lista vacía llega como nada: queda `[]`. */
  const claves = ['observaciones', 'vidrios']
  const posiciones = claves
    .map((k) => ({ k, i: texto.indexOf(`"${k}"`) }))
    .filter((p) => p.i >= 0)
    .sort((a, b) => a.i - b.i)
  const partes = posiciones.map((p, n) => {
    const inicio = texto.indexOf(':', p.i) + 1
    const fin = n + 1 < posiciones.length ? posiciones[n + 1].i : texto.lastIndexOf('}')
    let tramo = texto.slice(inicio, fin).trim().replace(/,\s*$/, '').trim()
    if (!tramo) tramo = '[]'
    else if (!tramo.startsWith('[')) tramo = `[${tramo}]`
    return `"${p.k}":${tramo}`
  })
  try {
    const datos = JSON.parse(`{${partes.join(',')}}`) as unknown
    return datos && typeof datos === 'object' ? (datos as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Los vidrios de la respuesta. Vienen aparte de las aberturas: una entrada por línea "Vid:". */
export function aVidrios(cuerpo: Record<string, unknown> | null): VidrioLeido[] {
  const lista = cuerpo?.vidrios
  if (!Array.isArray(lista)) return []
  const txt = (v: unknown) => (v == null || v === '' ? null : String(v).trim())
  return lista.map((v: Record<string, unknown>) => ({
    modelo: typeof v?.modelo === 'string' ? normalizarNombre(v.modelo) : '',
    comp1: txt(v?.comp1),
    camara: txt(v?.camara),
    comp2: txt(v?.comp2),
    ancho: txt(v?.ancho),
    alto: txt(v?.alto),
    cant: v?.cant == null || v.cant === '' ? null : Number(v.cant),
  }))
}

/** La respuesta, convertida en aberturas. `null` si no vino con la forma esperada. */
export function aAberturas(cuerpo: Record<string, unknown> | null): Abertura[] | null {
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
  /** Los vidrios de la última lectura. Se guardan hasta generar la OP: ahí van como subelementos. */
  const [vidrios, setVidrios] = useState<VidrioLeido[]>([])
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

  const leer = useCallback(async (ordenId: string | null): Promise<Abertura[] | null> => {
    if (corriendo.current) return null
    corriendo.current = true
    setEstado({ fase: 'leyendo', segundos: 0, problema: '' })

    try {
      /* `observaciones: []` va siempre vacío, a propósito. El escenario lo espera en su entrada
         (`ifempty(1.observaciones; "Sin Observaciones")`) y resuelve el caso por su cuenta: lo que
         acá se pide es que LEA el documento, no que reciba lo que ya había. */
      /* `ordenId`: la OP del tablero de órdenes. El escenario lee la Orden HETMO de AHÍ —cada OP
         tiene la suya—, no de la obra. */
      const respuesta = await dispararEscenario(ESCENARIO.leerObservaciones, itemId, {
        observaciones: [],
        ordenId,
      })

      if (respuesta.sinRespuesta) {
        setEstado((e) => ({
          ...e,
          fase: 'error',
          problema:
            'El escenario tardó más de lo que el servidor espera. Puede que haya terminado igual: volvé a intentar, o cargá las aberturas a mano.',
        }))
        return null
      }

      const cuerpo = cuerpoDe(respuesta)
      const aberturas = aAberturas(cuerpo)
      if (!aberturas) {
        /* El caso típico: Make contesta "Accepted". Eso significa que TOMÓ el pedido pero el
           escenario terminó antes de su módulo de respuesta —su router filtra por dirección,
           celular y archivo adjunto—, así que no hay lista que devolver. Decirlo evita que se
           busque el problema de este lado. */
        setEstado((e) => ({
          ...e,
          fase: 'error',
          problema:
            'El escenario tomó el pedido pero no devolvió la lista de aberturas. Suele ser que cortó en su filtro: revisá que la Orden HETMO esté cargada, y que la obra tenga la ubicación y el celular a coordinar.',
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

      setVidrios(aVidrios(cuerpo))
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
    setVidrios([])
  }, [])

  return { estado, leer, limpiar, vidrios, setVidrios, leyendo: estado.fase === 'leyendo' }
}
