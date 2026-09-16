import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ESCENARIO,
  EscenarioNoConfigurado,
  dispararEscenario,
  terminoBien,
  updateDeError,
  type RespuestaEscenario,
} from '@/services/make'
import {
  ETIQUETA,
  getActividadDesde,
  getActividadPorId,
  getEstadoOp,
  getObra,
} from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { Actividad, Obra } from '@/types'

/**
 * En qué anda la generación.
 *
 * `esperando` y `generando` son dos cosas distintas y por eso son dos fases: en la primera todavía
 * no sabemos si el escenario recibió el pedido; en la segunda ya lo confirmó el tablero. Cuando
 * algo no funciona, saber en cuál de las dos se quedó es la mitad del diagnóstico.
 */
export type Fase = 'idle' | 'disparando' | 'esperando' | 'generando' | 'listo' | 'error' | 'demorado'

/** Cuánto se espera antes de dejar de preguntar (el escenario sigue igual; ver `demorado`). */
const TOPE_MS = 5 * 60_000
/** Al principio se pregunta seguido; después se afloja, que es cuando la espera se hace larga. */
const INTERVALO_CORTO = 3_000
const INTERVALO_LARGO = 6_000
const CAMBIO_DE_RITMO_MS = 30_000
/** Si a los 25 s el tablero no pasó a "Generando", el disparo no prendió. Se avisa, no se corta. */
const SIN_ARRANCAR_MS = 25_000

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Generacion {
  fase: Fase
  /** Segundos desde que se apretó el botón. Es lo que hace que la espera no se sienta colgada. */
  segundos: number
  /** El tablero confirmó que el escenario tomó el pedido (pasó a "Generando"). */
  arranco: boolean
  /** El update que dejó ESTA corrida cuando falla. `null` si el escenario no escribió nada. */
  updateError: Actividad | null
  /** Un problema de la app, no del escenario: el hook no está configurado, la red falló. */
  problema: string | null
  /** Quién trajo la noticia. Sirve para saber si la respuesta del escenario llega o no a tiempo. */
  origen: 'respuesta' | 'tablero' | null
}

const INICIAL: Generacion = {
  fase: 'idle',
  segundos: 0,
  arranco: false,
  updateError: null,
  problema: null,
  origen: null,
}

/**
 * Dispara el escenario y espera el resultado por DOS caminos a la vez.
 *
 * 1. La respuesta del propio escenario, que ahora cierra cada rama con un *Webhook response*:
 *    `{error_update_id}` si falló, `{estado:"true"}` si generó. Es la noticia más rápida y la más
 *    precisa —con el id del update se lee exactamente el mensaje de esta corrida—.
 * 2. El tablero, releído cada pocos segundos.
 *
 * Los dos corren en paralelo y gana el que llegue primero. No es redundancia: la respuesta del
 * camino de éxito llega recién cuando terminan la IA y el armado del PDF, y esa espera puede
 * pasarse del tope de la función que hace de puente. Cuando eso pasa, el sondeo ya está mirando y
 * el usuario no se entera de nada. Y al revés: cuando el escenario falla rápido, la respuesta
 * evita seguir preguntándole al tablero por algo que ya está resuelto.
 *
 * Mirar el tablero es, además, lo que hace que cerrar la pestaña no pierda nada: al volver a
 * entrar, la obra ya trae el resultado.
 */
export function useGenerarOp(obra: Obra) {
  const dispatch = useDispatch()
  const [estado, setEstado] = useState<Generacion>(INICIAL)
  /** Se apaga al desmontar: un `setState` sobre una vista que ya no está sólo trae ruido. */
  const vivo = useRef(true)
  /** Ya se decidió cómo terminó: el otro camino tiene que callarse. */
  const cerrado = useRef(false)
  /** Momento del disparo: con él se filtran los updates viejos y se mide la espera. */
  const t0 = useRef(0)
  const previos = useRef<Set<string>>(new Set())

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
    const corriendo = ['disparando', 'esperando', 'generando'].includes(estado.fase)
    if (!corriendo) return
    const reloj = setInterval(() => {
      setEstado((e) => ({ ...e, segundos: Math.round((Date.now() - t0.current) / 1000) }))
    }, 1000)
    return () => clearInterval(reloj)
  }, [estado.fase])

  /** Relee la obra ENTERA. Una sola vez, al terminar: durante la espera alcanza con dos columnas. */
  const refrescarObra = useCallback(async () => {
    const fresca = await getObra(obra.id).catch(() => null)
    if (fresca && vivo.current) dispatch({ type: 'refrescarObra', obra: fresca })
  }, [dispatch, obra.id])

  /** Cierra la corrida: el primero que sabe cómo terminó gana, el otro camino se calla. */
  const cerrar = useCallback(
    async (parcial: Partial<Generacion>) => {
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
      const { estado: etiqueta, opFinal } = await getEstadoOp(obra.id).catch(() => ({
        estado: '',
        opFinal: [],
      }))
      if (cerrado.current) return

      /* Un archivo que no estaba antes de apretar: ESO es el resultado de esta corrida. Esperar
         "que haya archivo" daría por buena la OP vieja en el primer latido. */
      if (opFinal.some((a) => !previos.current.has(a.assetId))) {
        await cerrar({ fase: 'listo', origen: 'tablero' })
        return
      }

      if (etiqueta === ETIQUETA.opError) {
        const update = await getActividadDesde(obra.id, t0.current).catch(() => null)
        await cerrar({ fase: 'error', updateError: update, origen: 'tablero' })
        return
      }

      if (etiqueta === ETIQUETA.opGenerando && vivo.current) {
        setEstado((e) => ({ ...e, fase: 'generando', arranco: true }))
      }

      const transcurrido = Date.now() - t0.current
      if (transcurrido > TOPE_MS) {
        await cerrar({ fase: 'demorado' })
        return
      }

      await espera(transcurrido > CAMBIO_DE_RITMO_MS ? INTERVALO_LARGO : INTERVALO_CORTO)
    }
  }, [cerrar, obra.id])

  /** Pide la generación: dispara el escenario y escucha por los dos caminos. */
  const generar = useCallback(async () => {
    t0.current = Date.now()
    previos.current = new Set(obra.opFinal.map((a) => a.assetId))
    cerrado.current = false
    setEstado({ ...INICIAL, fase: 'disparando' })

    /* El pedido NO se espera antes de empezar a mirar el tablero: su respuesta llega al final del
       escenario, y hasta entonces el tablero es la única fuente de novedades. */
    const pedido = dispararEscenario(ESCENARIO.leerDocumento, obra.id, {
      obra: obra.nombre,
      observaciones: obra.observaciones,
      accion: 'leer-documento-etmo',
    })
      .then(leerRespuesta)
      .catch(async (e: unknown) => {
        /* Sin URL configurada no salió nada y no hay nada que esperar: se corta acá. Cualquier otro
           fallo de red puede haber llegado igual al escenario, así que el sondeo sigue. */
        if (e instanceof EscenarioNoConfigurado) {
          await cerrar({
            fase: 'error',
            problema:
              'Falta la URL del escenario (MAKE_WEBHOOK_LEER_DOC). Cargala en el entorno y reintentá.',
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
  }, [cerrar, leerRespuesta, obra.id, obra.nombre, obra.observaciones, obra.opFinal, sondear])

  /** Después del tope: volver a mirar, sin disparar el escenario otra vez. */
  const seguirEsperando = useCallback(async () => {
    cerrado.current = false
    setEstado((e) => ({ ...e, fase: e.arranco ? 'generando' : 'esperando' }))
    await sondear()
  }, [sondear])

  const enCurso = ['disparando', 'esperando', 'generando'].includes(estado.fase)
  /* La espera arrancó y el tablero todavía no dice "Generando": el pedido no llegó al escenario. */
  const noArranco = estado.fase === 'esperando' && estado.segundos * 1000 > SIN_ARRANCAR_MS

  return { estado, generar, seguirEsperando, enCurso, noArranco }
}
