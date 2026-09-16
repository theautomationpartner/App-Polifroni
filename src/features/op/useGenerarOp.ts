import { useCallback, useEffect, useRef, useState } from 'react'
import { ESCENARIO, EscenarioNoConfigurado, dispararEscenario } from '@/services/make'
import { ETIQUETA, getActividadDesde, getEstadoOp, getObra } from '@/services/monday'
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
}

const INICIAL: Generacion = {
  fase: 'idle',
  segundos: 0,
  arranco: false,
  updateError: null,
  problema: null,
}

/**
 * Dispara el escenario y sigue la corrida MIRANDO EL TABLERO.
 *
 * El webhook contesta apenas recibe el pedido, no cuando termina: el resultado —el documento y el
 * estado— lo deja el escenario en el ítem, y eso es lo único que dice cómo salió. Por eso acá se
 * pregunta por las dos columnas de la OP hasta que aparece un archivo NUEVO (no el de una corrida
 * anterior) o el estado queda en error.
 *
 * Leer el tablero, y no esperar una respuesta del escenario, también es lo que hace que cerrar la
 * pestaña no pierda nada: al volver a entrar, la obra ya trae el resultado.
 */
export function useGenerarOp(obra: Obra) {
  const dispatch = useDispatch()
  const [estado, setEstado] = useState<Generacion>(INICIAL)
  /** Se apaga al desmontar: un `setState` sobre una vista que ya no está sólo trae ruido. */
  const vivo = useRef(true)
  /** Momento del disparo: con él se filtran los updates viejos y se mide la espera. */
  const t0 = useRef(0)
  const previos = useRef<Set<string>>(new Set())

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
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

  const sondear = useCallback(async () => {
    while (vivo.current) {
      const { estado: etiqueta, opFinal } = await getEstadoOp(obra.id).catch(() => ({
        estado: '',
        opFinal: [],
      }))

      /* Un archivo que no estaba antes de apretar: ESO es el resultado de esta corrida. Esperar
         "que haya archivo" daría por buena la OP vieja en el primer latido. */
      const nuevo = opFinal.find((a) => !previos.current.has(a.assetId))
      if (nuevo) {
        setEstado((e) => ({ ...e, fase: 'listo' }))
        await refrescarObra()
        return
      }

      if (etiqueta === ETIQUETA.opError) {
        const update = await getActividadDesde(obra.id, t0.current).catch(() => null)
        setEstado((e) => ({ ...e, fase: 'error', updateError: update }))
        await refrescarObra()
        return
      }

      const transcurrido = Date.now() - t0.current
      if (etiqueta === ETIQUETA.opGenerando) {
        setEstado((e) => (e.arranco ? { ...e, fase: 'generando' } : { ...e, fase: 'generando', arranco: true }))
      }

      if (transcurrido > TOPE_MS) {
        setEstado((e) => ({ ...e, fase: 'demorado' }))
        await refrescarObra()
        return
      }

      await espera(transcurrido > CAMBIO_DE_RITMO_MS ? INTERVALO_LARGO : INTERVALO_CORTO)
    }
  }, [obra.id, refrescarObra])

  /** Pide la generación: dispara el escenario y se queda mirando el tablero. */
  const generar = useCallback(async () => {
    t0.current = Date.now()
    previos.current = new Set(obra.opFinal.map((a) => a.assetId))
    setEstado({ ...INICIAL, fase: 'disparando' })

    try {
      await dispararEscenario(ESCENARIO.leerDocumento, obra.id, {
        obra: obra.nombre,
        observaciones: obra.observaciones,
        accion: 'leer-documento-etmo',
      })
    } catch (e) {
      if (!vivo.current) return
      const problema =
        e instanceof EscenarioNoConfigurado
          ? 'Falta la URL del escenario (MAKE_WEBHOOK_LEER_DOC). Cargala en el entorno y reintentá.'
          : e instanceof Error
            ? e.message
            : 'No se pudo avisarle a la automatización.'
      setEstado((s) => ({ ...s, fase: 'error', problema }))
      return
    }

    if (!vivo.current) return
    setEstado((s) => ({ ...s, fase: 'esperando' }))
    await sondear()
  }, [obra.id, obra.nombre, obra.observaciones, obra.opFinal, sondear])

  /** Después del tope: volver a mirar, sin disparar el escenario otra vez. */
  const seguirEsperando = useCallback(async () => {
    setEstado((e) => ({ ...e, fase: e.arranco ? 'generando' : 'esperando' }))
    await sondear()
  }, [sondear])

  const enCurso = ['disparando', 'esperando', 'generando'].includes(estado.fase)
  /* La espera arrancó y el tablero todavía no dice "Generando": el pedido no llegó al escenario. */
  const noArranco = estado.fase === 'esperando' && estado.segundos * 1000 > SIN_ARRANCAR_MS

  return { estado, generar, seguirEsperando, enCurso, noArranco }
}
