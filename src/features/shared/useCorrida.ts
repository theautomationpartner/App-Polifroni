import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EscenarioNoConfigurado,
  dispararEscenario,
  terminoBien,
  updateDeError,
  type Escenario,
  type RespuestaEscenario,
} from '@/services/make'
import { getActividadPorId, getObra } from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { Actividad } from '@/types'

/**
 * En qué anda una corrida de un escenario de Make.
 *
 * `esperando` y `trabajando` son dos cosas distintas y por eso son dos fases: en la primera todavía
 * no sabemos si el escenario recibió el pedido; en la segunda ya lo confirmó el tablero. Cuando
 * algo no funciona, saber en cuál de las dos se quedó es la mitad del diagnóstico.
 */
export type Fase =
  | 'idle'
  | 'disparando'
  | 'esperando'
  | 'trabajando'
  | 'listo'
  | 'error'
  | 'demorado'

/** Cuánto se espera antes de dejar de preguntar (el escenario sigue igual; ver `demorado`). */
const TOPE_MS = 5 * 60_000
/** Al principio se pregunta seguido; después se afloja, que es cuando la espera se hace larga. */
const INTERVALO_CORTO = 3_000
const INTERVALO_LARGO = 6_000
const CAMBIO_DE_RITMO_MS = 30_000
/** Si a los 25 s el tablero no confirma que arrancó, el disparo no prendió. Se avisa, no se corta. */
const SIN_ARRANCAR_MS = 25_000

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Lo que el tablero contesta en cada vistazo. */
export interface Veredicto {
  /** `null` mientras la corrida sigue. */
  fin: 'listo' | 'error' | null
  /** El escenario tomó el pedido (el tablero ya lo dice). */
  arranco: boolean
  /** Update con el detalle del error, si se puede saber cuál es. */
  updateId?: string | null
  /** El update ya leído, cuando el tablero no da un id y hay que buscarlo por fecha. */
  update?: Actividad | null
}

export interface Corrida {
  fase: Fase
  /** Segundos desde que se apretó el botón. Es lo que hace que la espera no se sienta colgada. */
  segundos: number
  arranco: boolean
  /** El update que dejó ESTA corrida cuando falla. */
  updateError: Actividad | null
  /** Un problema de la app, no del escenario: el hook no está configurado, la red falló. */
  problema: string | null
  /** Quién trajo la noticia. Sirve para saber si la respuesta del escenario llega o no a tiempo. */
  origen: 'respuesta' | 'tablero' | null
}

const INICIAL: Corrida = {
  fase: 'idle',
  segundos: 0,
  arranco: false,
  updateError: null,
  problema: null,
  origen: null,
}

interface Opciones {
  escenario: Escenario
  itemId: string
  /** Datos extra del cuerpo del webhook. */
  extra?: Record<string, unknown>
  /** Se corre ANTES de disparar: sirve para fotografiar el estado previo del tablero. */
  antes?: () => void
  /** Mira el tablero y dice si la corrida terminó. Recibe el momento del disparo. */
  mirar: (desdeMs: number) => Promise<Veredicto>
}

/**
 * Dispara un escenario y espera el resultado por DOS caminos a la vez.
 *
 * 1. La respuesta del propio escenario, cuando su rama termina con un *Webhook response*:
 *    `{error_update_id}` si falló, `{estado:"true"}` si salió bien. Es la noticia más rápida y la
 *    más precisa —con el id del update se lee exactamente el mensaje de esta corrida—.
 * 2. El tablero, releído cada pocos segundos por `mirar`.
 *
 * Los dos corren en paralelo y gana el que llegue primero. No es redundancia: la respuesta llega
 * recién cuando la rama TERMINA, y esa espera puede pasarse del tope de la función que hace de
 * puente; cuando eso pasa, el sondeo ya está mirando y el usuario no se entera de nada. Al revés,
 * cuando el escenario falla rápido, la respuesta evita seguir preguntando por algo ya resuelto.
 *
 * Mirar el tablero es, además, lo que hace que cerrar la pestaña no pierda nada: al volver a
 * entrar, la obra ya trae el resultado.
 */
export function useCorrida({ escenario, itemId, extra, antes, mirar }: Opciones) {
  const dispatch = useDispatch()
  const [estado, setEstado] = useState<Corrida>(INICIAL)
  /** Se apaga al desmontar: un `setState` sobre una vista que ya no está sólo trae ruido. */
  const vivo = useRef(true)
  /** Ya se decidió cómo terminó: el otro camino tiene que callarse. */
  const cerrado = useRef(false)
  /** Momento del disparo: con él se miden la espera y qué cambió DESPUÉS de apretar. */
  const t0 = useRef(0)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      cerrado.current = true
    }
  }, [])

  /* El cronómetro vive aparte del sondeo: así el número sigue corriendo entre consulta y consulta
     y la pantalla no parece congelada mientras espera la respuesta de Monday. */
  useEffect(() => {
    if (!['disparando', 'esperando', 'trabajando'].includes(estado.fase)) return
    const reloj = setInterval(() => {
      setEstado((e) => ({ ...e, segundos: Math.round((Date.now() - t0.current) / 1000) }))
    }, 1000)
    return () => clearInterval(reloj)
  }, [estado.fase])

  /** Relee la obra ENTERA. Una sola vez, al terminar: durante la espera alcanza con dos columnas. */
  const refrescarObra = useCallback(async () => {
    const fresca = await getObra(itemId).catch(() => null)
    if (fresca && vivo.current) dispatch({ type: 'refrescarObra', obra: fresca })
  }, [dispatch, itemId])

  /** Cierra la corrida: el primero que sabe cómo terminó gana, el otro camino se calla. */
  const cerrar = useCallback(
    async (parcial: Partial<Corrida>) => {
      if (cerrado.current) return
      cerrado.current = true
      if (vivo.current) setEstado((e) => ({ ...e, ...parcial }))
      await refrescarObra()
    },
    [refrescarObra],
  )

  /** Camino 1 · lo que contestó el escenario. */
  const leerRespuesta = useCallback(
    async (r: RespuestaEscenario) => {
      if (cerrado.current || r.sinRespuesta) return
      const idUpdate = updateDeError(r)
      if (idUpdate) {
        const update = await getActividadPorId(idUpdate).catch(() => null)
        await cerrar({ fase: 'error', updateError: update, origen: 'respuesta' })
        return
      }
      if (terminoBien(r)) await cerrar({ fase: 'listo', origen: 'respuesta' })
    },
    [cerrar],
  )

  /** Camino 2 · el tablero, releído hasta que aparezca el resultado. */
  const sondear = useCallback(async () => {
    while (vivo.current && !cerrado.current) {
      const v = await mirar(t0.current).catch(
        (): Veredicto => ({ fin: null, arranco: false }),
      )
      if (cerrado.current) return

      if (v.fin === 'listo') {
        await cerrar({ fase: 'listo', origen: 'tablero' })
        return
      }
      if (v.fin === 'error') {
        const update = v.updateId
          ? await getActividadPorId(v.updateId).catch(() => null)
          : (v.update ?? null)
        await cerrar({ fase: 'error', updateError: update, origen: 'tablero' })
        return
      }
      if (v.arranco && vivo.current) {
        setEstado((e) => ({ ...e, fase: 'trabajando', arranco: true }))
      }

      const transcurrido = Date.now() - t0.current
      if (transcurrido > TOPE_MS) {
        await cerrar({ fase: 'demorado' })
        return
      }
      await espera(transcurrido > CAMBIO_DE_RITMO_MS ? INTERVALO_LARGO : INTERVALO_CORTO)
    }
  }, [cerrar, mirar])

  /** Dispara el escenario y escucha por los dos caminos. */
  const correr = useCallback(async () => {
    t0.current = Date.now()
    antes?.()
    cerrado.current = false
    setEstado({ ...INICIAL, fase: 'disparando' })

    /* El pedido NO se espera antes de empezar a mirar el tablero: su respuesta llega al final del
       escenario, y hasta entonces el tablero es la única fuente de novedades. */
    const pedido = dispararEscenario(escenario, itemId, extra)
      .then(leerRespuesta)
      .catch(async (e: unknown) => {
        /* Sin URL configurada no salió nada y no hay nada que esperar: se corta acá. Cualquier otro
           fallo de red puede haber llegado igual al escenario, así que el sondeo sigue. */
        if (e instanceof EscenarioNoConfigurado) {
          await cerrar({
            fase: 'error',
            problema: `El escenario "${escenario}" no tiene URL configurada en el entorno.`,
          })
          return
        }
        if (vivo.current) {
          setEstado((s) => ({
            ...s,
            problema:
              e instanceof Error
                ? `${e.message} — sigo mirando el tablero por las dudas.`
                : 'No se pudo confirmar el disparo; sigo mirando el tablero.',
          }))
        }
      })

    if (vivo.current) setEstado((s) => ({ ...s, fase: 'esperando' }))
    await Promise.all([sondear(), pedido])
  }, [antes, cerrar, escenario, extra, itemId, leerRespuesta, sondear])

  /** Después del tope: volver a mirar, sin disparar el escenario otra vez. */
  const seguirEsperando = useCallback(async () => {
    cerrado.current = false
    setEstado((e) => ({ ...e, fase: e.arranco ? 'trabajando' : 'esperando' }))
    await sondear()
  }, [sondear])

  const enCurso = ['disparando', 'esperando', 'trabajando'].includes(estado.fase)
  /* La espera arrancó y el tablero todavía no lo confirma: el pedido no llegó al escenario. */
  const noArranco = estado.fase === 'esperando' && estado.segundos * 1000 > SIN_ARRANCAR_MS

  return { estado, correr, seguirEsperando, enCurso, noArranco }
}
