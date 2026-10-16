import { Fragment, useEffect, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { enElTaller } from '@/lib/estadosOp'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import {
  PEND_SOLICITAR,
  cantidadValida,
  capasValidas,
  composicion,
  delTipoDeLaObra,
  esDvh,
  medidaValida,
  ordenParaCortes,
  ordenVisibleEnCortes,
} from '@/lib/vidrios'
import {
  COL_OBS,
  actualizarVidrios,
  agregarVidrios,
  opcionesVidrio,
  ordenesDeObra,
  quitarVidrios,
  vidriosDeOrdenes,
  type CambioVidrio,
  type ResumenOrden,
  type VidrioDeOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

/** Órdenes por página de la tabla. */
const POR_PAGINA = 6
/** Lo que dura la animación de plegar los vidrios de una orden (ver `.vid-detalle--cierra`). */
const CIERRE_MS = 220

/** Las piezas de una OP: la suma de las cantidades de sus vidrios. */
const piezas = (vs: VidrioDeOrden[]) => vs.reduce((n, v) => n + (v.cantidad ?? 0), 0)

/** Lo que se está escribiendo en un vidrio en edición: el tipo, las capas y los tres números como texto. */
type Borrador = { dvh: boolean; comp1: string; camara: string; comp2: string; ancho: string; alto: string; cantidad: string }
type Capa = 'comp1' | 'camara' | 'comp2'
const borradorDe = (v: VidrioDeOrden): Borrador => ({
  dvh: esDvh(v),
  comp1: v.comp1,
  camara: v.camara,
  comp2: v.comp2,
  ancho: v.ancho,
  alto: v.alto,
  cantidad: v.cantidad == null ? '' : String(v.cantidad),
})
const borradorValido = (b: Borrador) =>
  capasValidas(b) && medidaValida(b.ancho) && medidaValida(b.alto) && cantidadValida(b.cantidad)
/** Las capas que se guardan: en un simple, la Cámara y el Comp 2 van vacías (se borran). */
const capasDe = (b: Borrador) => ({ comp1: b.comp1.trim(), camara: b.dvh ? b.camara.trim() : '', comp2: b.dvh ? b.comp2.trim() : '' })
const cambiaronCapas = (b: Borrador, v: VidrioDeOrden) => {
  const c = capasDe(b)
  return c.comp1 !== v.comp1 || c.camara !== v.camara || c.comp2 !== v.comp2
}
/** Las columnas de Monday de cada capa, para sus opciones. */
const COL_CAPA: Record<Capa, string> = { comp1: COL_OBS.comp1, camara: COL_OBS.camara, comp2: COL_OBS.comp2 }
const TITULO_CAPA: Record<Capa, string> = { comp1: 'Vidrio 1', camara: 'Cámara', comp2: 'Vidrio 2' }

/** Un vidrio nuevo de una orden: lo mismo que se edita, más su modelo y una clave para la fila. */
type FilaAlta = Borrador & { clave: string; modelo: string }
let claveAlta = 0
const filaVacia = (): FilaAlta => ({
  clave: `alta-${++claveAlta}`,
  modelo: '',
  dvh: false,
  comp1: '',
  camara: '',
  comp2: '',
  ancho: '',
  alto: '',
  cantidad: '',
})

/**
 * Solicitud de cortes de vidrio · Etapa 2: qué vidrios se piden.
 *
 * Las órdenes de la obra que ya salieron al taller y son del mismo tipo que la obra (en una de PVC,
 * sólo las de PVC; en una de Aluminio, sólo las de Aluminio; ver `delTipoDeLaObra`), en la misma tabla que "Seleccionar OP A Enviar",
 * de a 6 por página. Elegir una orden con su casilla la despliega y muestra sus vidrios —los
 * subelementos con datos de vidrio: la composición, simple o DVH con cada capa, las medidas y la
 * cantidad—; destildarla la pliega. Arrancan todas sin elegir, plegadas. Las que no tienen vidrios
 * (`🤖Tiene Vidrios` sin tildar) se muestran apagadas, sin casilla para elegir: no hay nada que pedir de ellas.
 *
 * Cada orden desplegada se puede corregir: "Editar" abre sus vidrios —el tipo (Simple o DVH), las
 * capas (Vidrio Comp 1, Cámara y Vidrio Comp 2, con las opciones de sus columnas en Monday), el
 * ancho, el alto y la cantidad— y el mismo botón —ahora "Guardar"— escribe en Monday sólo los
 * vidrios que cambiaron (sus subelementos, ver `actualizarVidrios`). Pasar un DVH a Simple borra su
 * Cámara y su Comp 2. En la edición, además, el tacho de cada fila quita ese vidrio y «Agregar
 * vidrios» suma filas nuevas: "Guardar" escribe los cambios, crea los nuevos (ver `agregarVidrios`) y
 * quita los borrados (ver `quitarVidrios`). Vale igual para las de PVC y las de Aluminio.
 *
 * Las órdenes sin vidrios (de PVC o de Aluminio) llevan "Agregar vidrios" en vez de "Editar": abre la
 * misma tabla vacía para cargarlos a mano —el modelo, el tipo, las capas, las medidas y la cantidad—.
 * "Guardar" los crea como subelementos de la OP (ver `agregarVidrios`) y la orden queda elegida para
 * la solicitud.
 */
export function VidriosSeleccionView() {
  const obra = useObra()
  /** Sólo las órdenes de este tipo (el de la obra) entran en la solicitud. */
  const tipoObra = tipoDe(obra)
  const dispatch = useDispatch()
  const { vidriosOps } = useApp()
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [vidrios, setVidrios] = useState<Record<string, VidrioDeOrden[]>>({})
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [faltan, setFaltan] = useState(false)
  const [pagina, setPagina] = useState(0)
  /** Las que se acaban de destildar: sus vidrios salen con su animación antes de desaparecer. */
  const [cerrando, setCerrando] = useState<Set<string>>(new Set())
  /** Las órdenes en edición: por orden, lo escrito en cada uno de sus vidrios (por id). */
  const [edicion, setEdicion] = useState<Record<string, Record<string, Borrador>>>({})
  /** La orden que se está guardando en Monday. */
  const [guardando, setGuardando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)
  /** Las opciones de cada capa, por columna; se leen de Monday la primera vez que se edita. */
  const [opciones, setOpciones] = useState<Record<string, string[]> | null>(null)
  /** Las órdenes a las que se les están agregando vidrios: por orden, sus filas nuevas. */
  const [alta, setAlta] = useState<Record<string, FilaAlta[]>>({})
  /** Las órdenes en edición: por orden, los ids de los vidrios que se quitaron con el tacho. */
  const [quitados, setQuitados] = useState<Record<string, string[]>>({})

  useAccionEnCurso('Esperá a que se guarden los vidrios.', guardando !== null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const enTaller = (await ordenesDeObra(obra.ordenesIds)).filter(
          (o) => enElTaller(o.estadoOrden, o.envioTaller) && delTipoDeLaObra(tipoObra, o.tipo),
        )
        /* `🤖Tiene Vidrios` dice cuáles traen vidrios: sólo de ésas se leen los subelementos. */
        const porOp = await vidriosDeOrdenes(enTaller.filter((o) => o.tieneVidrios).map((o) => o.id))
        if (!vivo) return
        const datos = (o: ResumenOrden) => ({
          enTaller: true,
          estadoVidrios: o.estadoVidrios,
          vidrios: o.tieneVidrios ? (porOp[o.id] ?? []).length : 0,
        })
        /* Las que tienen vidrios sin pedir y, sin poder elegirse, las que no tienen vidrios (ver
           `ordenVisibleEnCortes`). Las ya solicitadas, colocadas o canceladas no se muestran. */
        const todas = enTaller.filter((o) => ordenVisibleEnCortes(datos(o)))
        const aptas = todas.filter((o) => ordenParaCortes(datos(o)))
        setOrdenes(todas)
        /* Una elegida antes que ya no se puede pedir (se pidió mientras tanto) sale de la solicitud. */
        if (vidriosOps.some((id) => !aptas.some((o) => o.id === id))) {
          dispatch({ type: 'setVidriosOps', ids: vidriosOps.filter((id) => aptas.some((o) => o.id === id)) })
        }
        setVidrios(porOp)
        setError(false)
      } catch {
        if (!vivo) return
        setOrdenes([])
        setError(true)
      }
    })()
    return () => {
      vivo = false
    }
    // Se relee al abrir la etapa o con "Volver a intentar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra, intento])

  const paginas = Math.max(1, Math.ceil((ordenes ?? []).length / POR_PAGINA))
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = (ordenes ?? []).slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)

  const elegidas = (ordenes ?? []).filter((o) => vidriosOps.includes(o.id))
  const totalPiezas = elegidas.reduce((n, o) => n + piezas(vidrios[o.id] ?? []), 0)
  /** Elegir la orden la despliega; destildarla la pliega con su animación. */
  const alternar = (id: string) => {
    if (cerrando.has(id)) return
    const elegida = vidriosOps.includes(id)
    dispatch({ type: 'setVidriosOps', ids: elegida ? vidriosOps.filter((x) => x !== id) : [...vidriosOps, id] })
    if (!elegida || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setCerrando((c) => new Set(c).add(id))
    setTimeout(
      () =>
        setCerrando((c) => {
          const n = new Set(c)
          n.delete(id)
          return n
        }),
      CIERRE_MS,
    )
  }

  const cargarOpciones = () => {
    if (opciones) return
    opcionesVidrio()
      .then(setOpciones)
      /* Sin las opciones del tablero, cada capa ofrece al menos los valores que ya usan estos vidrios. */
      .catch(() => setOpciones({}))
  }

  const editar = (id: string) => {
    setEdicion((e) => ({ ...e, [id]: Object.fromEntries((vidrios[id] ?? []).map((v) => [v.id, borradorDe(v)])) }))
    /* En la edición también se suman vidrios nuevos (empieza sin ninguno) y se quitan los que están. */
    setAlta((a) => ({ ...a, [id]: [] }))
    setQuitados((q) => ({ ...q, [id]: [] }))
    cargarOpciones()
  }

  const quitarVidrio = (op: string, vidrio: string) => setQuitados((q) => ({ ...q, [op]: [...(q[op] ?? []), vidrio] }))

  /** Cierra la edición de una orden: lo escrito, los vidrios nuevos y los quitados. */
  const cerrarEdicion = (op: string) => {
    setEdicion((e) => {
      const resto = { ...e }
      delete resto[op]
      return resto
    })
    setQuitados((q) => {
      const resto = { ...q }
      delete resto[op]
      return resto
    })
    cerrarAlta(op)
  }

  /** "Agregar vidrios" en una orden sin vidrios: abre la tabla con un vidrio vacío para cargar. */
  const empezarAlta = (id: string) => {
    setAlta((a) => ({ ...a, [id]: [filaVacia()] }))
    cargarOpciones()
  }

  const escribirAlta = <K extends keyof FilaAlta>(op: string, clave: string, campo: K, valor: FilaAlta[K]) =>
    setAlta((a) => ({ ...a, [op]: a[op].map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)) }))

  const sumarFila = (op: string) => setAlta((a) => ({ ...a, [op]: [...a[op], filaVacia()] }))

  const quitarFila = (op: string, clave: string) => setAlta((a) => ({ ...a, [op]: a[op].filter((f) => f.clave !== clave) }))

  const cerrarAlta = (op: string) =>
    setAlta((a) => {
      const resto = { ...a }
      delete resto[op]
      return resto
    })

  /** Crea en Monday los vidrios cargados y deja la orden elegida para la solicitud. */
  const guardarAlta = async (id: string) => {
    const filas = alta[id] ?? []
    if (filas.length === 0) {
      setAviso({
        titulo: 'Agregá al menos un vidrio',
        texto: 'Tocá «Agregar otro vidrio» para cargar uno, o «Cancelar» si esta orden no lleva vidrios.',
      })
      return
    }
    if (filas.some((f) => !f.modelo.trim() || !borradorValido(f))) {
      setAviso({
        titulo: 'Revisá los vidrios',
        texto:
          'Cada vidrio lleva su modelo (por ejemplo V1), su Vidrio 1 y, si es DVH, también la Cámara y el Vidrio 2. El ancho y el alto van en mm enteros (por ejemplo 843 o 1.013) y la cantidad es un número de 1 en adelante.',
      })
      return
    }
    setGuardando(id)
    try {
      await agregarVidrios(
        id,
        filas.map((f) => ({
          modelo: f.modelo.trim(),
          ...capasDe(f),
          ancho: f.ancho.trim(),
          alto: f.alto.trim(),
          cantidad: Number(f.cantidad),
        })),
      )
    } catch (e) {
      console.warn('[vidrios] no se pudieron agregar los vidrios', e)
      setGuardando(null)
      setAviso({
        titulo: 'No se pudieron agregar los vidrios',
        texto: 'Monday no respondió. Lo que cargaste sigue en la tabla: volvé a tocar «Guardar» en unos segundos.',
      })
      return
    }
    cerrarAlta(id)
    try {
      /* Se releen para tener los ids de los subelementos nuevos (los usa "Editar"). */
      const porOp = await vidriosDeOrdenes([id])
      setVidrios((todos) => ({ ...todos, [id]: porOp[id] ?? [] }))
      setOrdenes((os) => os && os.map((x) => (x.id === id ? { ...x, tieneVidrios: true, estadoVidrios: PEND_SOLICITAR } : x)))
      if (!vidriosOps.includes(id)) dispatch({ type: 'setVidriosOps', ids: [...vidriosOps, id] })
    } catch {
      /* Se guardaron, pero no se pudieron releer: se relee la tabla entera. */
      setOrdenes(null)
      setIntento((n) => n + 1)
    } finally {
      setGuardando(null)
    }
  }

  const escribir = <K extends keyof Borrador>(op: string, vidrio: string, campo: K, valor: Borrador[K]) =>
    setEdicion((e) => ({ ...e, [op]: { ...e[op], [vidrio]: { ...e[op][vidrio], [campo]: valor } } }))

  /** Las opciones de una capa: las de su columna y, si no está entre ellas, el valor que ya tiene. */
  const opcionesDe = (capa: Capa, actual: string) => {
    const lista = opciones?.[COL_CAPA[capa]] ?? []
    const todas = actual && !lista.includes(actual) ? [actual, ...lista] : lista
    return todas.map((o) => ({ valor: o, texto: o }))
  }

  /**
   * Guarda en Monday la edición de una orden: corrige los vidrios que cambiaron, crea los nuevos y
   * quita los borrados con el tacho; sin cambios, sólo cierra la edición.
   */
  const guardar = async (id: string) => {
    const escritos = edicion[id] ?? {}
    const borrados = quitados[id] ?? []
    const nuevas = alta[id] ?? []
    const originales = (vidrios[id] ?? []).filter((v) => !borrados.includes(v.id))
    const cambiados = originales.filter((v) => {
      const b = escritos[v.id]
      return (
        b &&
        (cambiaronCapas(b, v) ||
          b.ancho.trim() !== v.ancho ||
          b.alto.trim() !== v.alto ||
          b.cantidad.trim() !== (v.cantidad == null ? '' : String(v.cantidad)))
      )
    })
    if (cambiados.some((v) => !borradorValido(escritos[v.id])) || nuevas.some((f) => !f.modelo.trim() || !borradorValido(f))) {
      setAviso({
        titulo: 'Revisá los vidrios',
        texto:
          'Cada vidrio lleva su modelo (por ejemplo V1), su Vidrio 1 y, si es DVH, también la Cámara y el Vidrio 2. El ancho y el alto van en mm enteros (por ejemplo 843 o 1.013) y la cantidad es un número de 1 en adelante.',
      })
      return
    }
    const cambios: CambioVidrio[] = cambiados.map((v) => ({
      id: v.id,
      capas: cambiaronCapas(escritos[v.id], v) ? capasDe(escritos[v.id]) : undefined,
      ancho: escritos[v.id].ancho.trim(),
      alto: escritos[v.id].alto.trim(),
      cantidad: Number(escritos[v.id].cantidad),
    }))
    if (!cambios.length && !nuevas.length && !borrados.length) {
      cerrarEdicion(id)
      return
    }
    const quedan = originales.length + nuevas.length
    setGuardando(id)
    /* Hasta dónde se llegó: si falla, volver a tocar «Guardar» no repite lo que ya se hizo. */
    let paso: 'cambios' | 'nuevas' | 'borrados' = 'cambios'
    try {
      if (cambios.length) await actualizarVidrios(cambios)
      paso = 'nuevas'
      if (nuevas.length) {
        await agregarVidrios(
          id,
          nuevas.map((f) => ({
            modelo: f.modelo.trim(),
            ...capasDe(f),
            ancho: f.ancho.trim(),
            alto: f.alto.trim(),
            cantidad: Number(f.cantidad),
          })),
        )
      }
      paso = 'borrados'
      if (borrados.length) await quitarVidrios(id, borrados, quedan > 0)
    } catch (e) {
      console.warn('[vidrios] no se pudieron guardar los vidrios', e)
      setGuardando(null)
      if (paso === 'borrados' || (paso === 'nuevas' && nuevas.length)) {
        /* Ya se escribió una parte (o no se sabe cuánta): se relee la orden tal como quedó en Monday. */
        setAviso({
          titulo: 'No se pudieron guardar todos los vidrios',
          texto: 'Monday no respondió a mitad del guardado. Se volvieron a leer los vidrios: revisá la orden y, si falta algo, tocá «Editar» de nuevo.',
        })
        cerrarEdicion(id)
        setOrdenes(null)
        setIntento((n) => n + 1)
      } else {
        setAviso({
          titulo: 'No se pudieron guardar los vidrios',
          texto: 'Monday no respondió. Lo que escribiste sigue en la tabla: volvé a tocar «Guardar» en unos segundos.',
        })
      }
      return
    }
    cerrarEdicion(id)
    if (!nuevas.length && !borrados.length) {
      setGuardando(null)
      const porId = new Map(cambios.map((c) => [c.id, c]))
      setVidrios((todos) => ({
        ...todos,
        [id]: (todos[id] ?? []).map((v) => {
          const c = porId.get(v.id)
          return c ? { ...v, ...c.capas, ancho: c.ancho, alto: c.alto, cantidad: c.cantidad } : v
        }),
      }))
      return
    }
    try {
      /* Se releen para tener los ids de los subelementos nuevos y dejar afuera los quitados. */
      const porOp = await vidriosDeOrdenes([id])
      const vs = porOp[id] ?? []
      setVidrios((todos) => ({ ...todos, [id]: vs }))
      setOrdenes((os) => os && os.map((x) => (x.id === id ? { ...x, tieneVidrios: vs.length > 0 } : x)))
      /* Sin vidrios, la orden ya no se puede pedir. */
      if (!vs.length && vidriosOps.includes(id)) dispatch({ type: 'setVidriosOps', ids: vidriosOps.filter((x) => x !== id) })
    } catch {
      setOrdenes(null)
      setIntento((n) => n + 1)
    } finally {
      setGuardando(null)
    }
  }

  const continuar = () => {
    if (Object.keys(edicion).length) {
      setAviso({
        titulo: 'Hay vidrios en edición',
        texto: 'Tocá «Guardar» en las órdenes que estás editando antes de continuar: si no, la solicitud sale con los vidrios anteriores.',
      })
      return
    }
    if (Object.keys(alta).length) {
      setAviso({
        titulo: 'Hay vidrios sin guardar',
        texto: 'Tocá «Guardar» en las órdenes a las que les estás agregando vidrios, o «Cancelar» si no los vas a pedir.',
      })
      return
    }
    if (elegidas.every((o) => (vidrios[o.id] ?? []).length === 0)) {
      setFaltan(true)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Seleccionar Ordenes"
        descripcion="Revisá los vidrios de las órdenes que ya salieron al taller y tildá las órdenes cuyos vidrios vas a pedir."
      />

      <div className="cobro-static">
        <div className="cobro-card">
          <h3 className="cobro-card-title">Órdenes enviadas al taller</h3>
          <p className="cobro-card-desc">
            Órdenes de {tipoObra ?? 'su tipo'} de {obra.nombre} que ya están en el taller y tienen sus vidrios pendientes de solicitar.
            Debajo de cada una, los vidrios que lleva: la composición, las medidas y la cantidad de piezas.
            Las que no tienen vidrios se muestran apagadas y no se pueden elegir hasta que se les carguen
            con «Agregar vidrios».
          </p>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija vid-tabla">
              <colgroup>
                <col className="ant-w-check" />
                <col className="ant-w-orden" />
                <col className="ant-w-fecha" />
                <col className="ant-w-medido" />
                <col className="ant-w-fecha" />
                <col className="ant-w-estado" />
                <col className="ant-w-op" />
                <col className="vid-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ant-col-check" />
                  <th>Orden de producción</th>
                  <th className="ant-col-cen">Fecha de creación</th>
                  <th className="ant-col-cen">Medido por</th>
                  <th className="ant-col-cen">Fecha de medición</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Vidrios</th>
                  <th className="ant-col-cen">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={8} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes y sus vidrios...
                    </td>
                  </tr>
                ) : ordenes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error ? 'No se pudieron leer las órdenes desde Monday.' : `${obra.nombre} no tiene órdenes de ${tipoObra ?? 'su tipo'} en el taller con vidrios pendientes de solicitar.`}{' '}
                      <button
                        type="button"
                        className="cobro-reintentar"
                        onClick={() => {
                          setOrdenes(null)
                          setIntento((n) => n + 1)
                        }}
                      >
                        Volver a intentar
                      </button>
                    </td>
                  </tr>
                ) : (
                  visibles.map((o) => {
                    const vs = vidrios[o.id] ?? []
                    const on = vidriosOps.includes(o.id)
                    const sinVidrios = vs.length === 0
                    /* Una orden sin vidrios (PVC o Aluminio) no se edita: se le agregan. */
                    const paraAgregar = sinVidrios
                    const filasAlta = alta[o.id]
                    /* Elegida, se ve desplegada; recién destildada, se ve mientras se pliega. */
                    const abierta = !sinVidrios && (on || cerrando.has(o.id))
                    const escritos = edicion[o.id]
                    const enEdicion = !!escritos
                    /* La carga de una orden sin vidrios; en la edición, las filas nuevas van en su tabla. */
                    const enAlta = !!filasAlta && !enEdicion
                    const borrados = quitados[o.id] ?? []
                    const guardandoEsta = guardando === o.id
                    /** Una fila de vidrio nuevo: la de las órdenes sin vidrios y la de la edición. */
                    const filaNueva = (f: FilaAlta, i: number) => {
                      const nombre = f.modelo.trim() || `el vidrio ${i + 1}`
                      return (
                        <tr key={f.clave}>
                          <td>
                            <input
                              className={`vid-input ${f.modelo.trim() ? '' : 'vid-input--mal'}`}
                              value={f.modelo}
                              placeholder="V1"
                              disabled={guardandoEsta}
                              onChange={(e) => escribirAlta(o.id, f.clave, 'modelo', e.target.value)}
                              aria-label={`Modelo del vidrio ${i + 1}`}
                            />
                          </td>
                          <td>
                            {/* Simple o DVH: Simple deja sólo el Vidrio 1. */}
                            <span className="vid-tipo-sel" role="group" aria-label={`Tipo de ${nombre}`}>
                              {([false, true] as const).map((dvh) => (
                                <button
                                  key={String(dvh)}
                                  type="button"
                                  className={`vid-tipo-op ${f.dvh === dvh ? 'vid-tipo-op--on' : ''}`}
                                  aria-pressed={f.dvh === dvh}
                                  disabled={guardandoEsta}
                                  onClick={() => escribirAlta(o.id, f.clave, 'dvh', dvh)}
                                >
                                  {dvh ? 'DVH' : 'Simple'}
                                </button>
                              ))}
                            </span>
                          </td>
                          <td>
                            <span className="vid-capas vid-capas--edicion">
                              {(f.dvh ? (['comp1', 'camara', 'comp2'] as const) : (['comp1'] as const)).map((capa) => (
                                <span key={capa} className={`vid-capa-sel ${capa === 'camara' ? 'vid-capa-sel--camara' : ''}`}>
                                  <SelectBuscable
                                    id={`vid-${f.clave}-${capa}`}
                                    valor={f[capa]}
                                    opciones={opcionesDe(capa, f[capa])}
                                    placeholder={TITULO_CAPA[capa]}
                                    cargando={!opciones}
                                    textoCargando="…"
                                    disabled={guardandoEsta}
                                    falta={!f[capa].trim()}
                                    onElegir={(valor) => escribirAlta(o.id, f.clave, capa, valor)}
                                  />
                                </span>
                              ))}
                            </span>
                          </td>
                          {(['ancho', 'alto', 'cantidad'] as const).map((campo) => {
                            const valor = f[campo]
                            const ok = campo === 'cantidad' ? cantidadValida(valor) : medidaValida(valor)
                            return (
                              <td key={campo}>
                                <input
                                  className={`vid-input ${ok ? '' : 'vid-input--mal'}`}
                                  inputMode="numeric"
                                  value={valor}
                                  disabled={guardandoEsta}
                                  onChange={(e) => escribirAlta(o.id, f.clave, campo, e.target.value)}
                                  aria-label={`${campo === 'cantidad' ? 'Cantidad' : campo === 'ancho' ? 'Ancho' : 'Alto'} de ${nombre}`}
                                />
                              </td>
                            )
                          })}
                          <td>
                            <button
                              type="button"
                              className="vid-quitar"
                              disabled={guardandoEsta}
                              onClick={() => quitarFila(o.id, f.clave)}
                              title="Quitar este vidrio"
                              aria-label={`Quitar ${nombre}`}
                            >
                              <i className="fas fa-trash-can" />
                            </button>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <Fragment key={o.id}>
                        {/* La casilla elige la orden y la despliega; destildarla la pliega. */}
                        <tr
                          className={`ant-row vid-fila ${on ? 'ant-row--on' : ''} ${sinVidrios && !enAlta ? 'ant-row--off' : ''} ${abierta || enAlta ? 'vid-fila--abierta' : ''}`}
                          title={!enAlta && paraAgregar ? 'Esta orden no tiene vidrios: agregalos con «Agregar vidrios».' : undefined}
                        >
                          <td className="ant-col-check">
                            <input
                              type="checkbox"
                              className="ant-check"
                              checked={on && !sinVidrios}
                              disabled={sinVidrios || enEdicion}
                              title={enEdicion ? 'Guardá los vidrios antes de destildar la orden' : undefined}
                              onChange={() => alternar(o.id)}
                              aria-label={`Pedir los vidrios de ${o.idOp || o.nombre}`}
                            />
                          </td>
                          <td>
                            <span className="ant-nro">{o.numero ? `N° ${o.numero}` : 'Sin N°'}</span>
                            <span className="ant-detalle">{[o.idOp, o.tipo].filter(Boolean).join(' · ') || '—'}</span>
                          </td>
                          <td className="ant-col-cen">{fecha(o.creada)}</td>
                          <td className="ant-col-cen">{o.medidoPor || <span className="ant-sd">—</span>}</td>
                          <td className="ant-col-cen">
                            {o.fechaMedicion ? o.fechaMedicion.split('-').reverse().join('/') : <span className="ant-sd">—</span>}
                          </td>
                          <td className="ant-col-cen">
                            <EstadoOrdenBadge estado={o.estadoOrden} chico />
                          </td>
                          <td className="ant-col-cen">
                            {enAlta ? (
                              <span className="vid-cuenta">Cargando vidrios</span>
                            ) : sinVidrios ? (
                              <span className="ant-sd">Sin vidrios</span>
                            ) : (
                              <span className="vid-abrir" aria-hidden="true">
                                <span className="vid-cuenta">
                                  {piezas(vs)} {piezas(vs) === 1 ? 'pieza' : 'piezas'}
                                </span>
                                <i className={`fas fa-chevron-down vid-chev ${on ? 'vid-chev--on' : ''}`} />
                              </span>
                            )}
                          </td>
                          <td className="ant-col-cen">
                            {paraAgregar ? (
                              /* Sin vidrios: "Agregar vidrios" abre la tabla vacía; Guardar los crea. */
                              <button
                                type="button"
                                className={`btn ${enAlta ? 'btn-primary btn-marca' : 'btn-out'} vid-editar`}
                                disabled={guardando !== null}
                                onClick={() => (enAlta ? void guardarAlta(o.id) : empezarAlta(o.id))}
                              >
                                {guardandoEsta ? (
                                  <>
                                    <i className="fas fa-circle-notch spin" /> Guardando
                                  </>
                                ) : enAlta ? (
                                  <>
                                    <i className="fas fa-floppy-disk" /> Guardar
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-plus" /> Agregar vidrios
                                  </>
                                )}
                              </button>
                            ) : (
                              /* Editar abre las medidas y la cantidad de los vidrios; Guardar las escribe. */
                              <button
                              type="button"
                              className={`btn ${enEdicion ? 'btn-primary btn-marca' : 'btn-out'} vid-editar`}
                              disabled={!on || sinVidrios || guardando !== null}
                              title={
                                sinVidrios
                                  ? 'Esta orden no tiene vidrios para editar'
                                  : !on
                                    ? 'Elegí la orden para ver y editar sus vidrios'
                                    : undefined
                              }
                              onClick={() => (enEdicion ? void guardar(o.id) : editar(o.id))}
                            >
                              {guardandoEsta ? (
                                <>
                                  <i className="fas fa-circle-notch spin" /> Guardando
                                </>
                              ) : enEdicion ? (
                                <>
                                  <i className="fas fa-floppy-disk" /> Guardar
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-pen" /> Editar
                                </>
                              )}
                            </button>
                            )}
                          </td>
                        </tr>
                        {enAlta && (
                          <tr className="vid-detalle">
                            <td colSpan={8}>
                              <table className="vid-sub vid-sub--edicion">
                                <colgroup>
                                  <col className="vid-w-modelo" />
                                  <col className="vid-w-tipo" />
                                  <col className="vid-w-comp" />
                                  <col className="vid-w-med" />
                                  <col className="vid-w-med" />
                                  <col className="vid-w-cant" />
                                  <col className="vid-w-quitar" />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Modelo</th>
                                    <th>Tipo</th>
                                    <th>Composición (mm)</th>
                                    <th>Ancho (mm)</th>
                                    <th>Alto (mm)</th>
                                    <th>Cantidad</th>
                                    <th aria-label="Quitar" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {filasAlta.length === 0 ? (
                                    <tr>
                                      <td colSpan={7} className="vid-alta-vacia">
                                        Sin vidrios cargados: tocá «Agregar otro vidrio».
                                      </td>
                                    </tr>
                                  ) : (
                                    filasAlta.map((f, i) => filaNueva(f, i))
                                  )}
                                </tbody>
                              </table>
                              <div className="vid-alta-pie">
                                <button
                                  type="button"
                                  className="btn btn-out vid-editar"
                                  disabled={guardandoEsta}
                                  onClick={() => sumarFila(o.id)}
                                >
                                  <i className="fas fa-plus" /> Agregar otro vidrio
                                </button>
                                <button type="button" className="cobro-reintentar" disabled={guardandoEsta} onClick={() => cerrarAlta(o.id)}>
                                  Cancelar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {abierta && (
                          <tr
                            className={`vid-detalle ${on ? '' : 'vid-detalle--fuera'} ${cerrando.has(o.id) ? 'vid-detalle--cierra' : ''}`}
                          >
                            <td colSpan={8}>
                              <table className={`vid-sub ${enEdicion ? 'vid-sub--edicion' : ''}`}>
                                <colgroup>
                                  <col className="vid-w-modelo" />
                                  <col className="vid-w-tipo" />
                                  <col className="vid-w-comp" />
                                  <col className="vid-w-med" />
                                  <col className="vid-w-med" />
                                  <col className="vid-w-cant" />
                                  {enEdicion && <col className="vid-w-quitar" />}
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Modelo</th>
                                    <th>Tipo</th>
                                    <th>Composición (mm)</th>
                                    <th>Ancho (mm)</th>
                                    <th>Alto (mm)</th>
                                    <th>Cantidad</th>
                                    {enEdicion && <th aria-label="Quitar" />}
                                  </tr>
                                </thead>
                                <tbody>
                                  {enEdicion && vs.length === borrados.length && (filasAlta ?? []).length === 0 && (
                                    <tr>
                                      <td colSpan={7} className="vid-alta-vacia">
                                        Quitaste todos los vidrios: al guardar, la orden queda sin vidrios. Tocá «Agregar vidrios» para cargar otros.
                                      </td>
                                    </tr>
                                  )}
                                  {vs.filter((v) => !borrados.includes(v.id)).map((v) => {
                                    const b = enEdicion ? escritos[v.id] : undefined
                                    return (
                                      <tr key={v.id}>
                                        <td className="vid-modelo">{v.modelo || '—'}</td>
                                        <td>
                                          {b ? (
                                            /* Simple o DVH: pasar a Simple deja sólo el Vidrio 1. */
                                            <span className="vid-tipo-sel" role="group" aria-label={`Tipo de ${v.modelo || 'el vidrio'}`}>
                                              {([false, true] as const).map((dvh) => (
                                                <button
                                                  key={String(dvh)}
                                                  type="button"
                                                  className={`vid-tipo-op ${b.dvh === dvh ? 'vid-tipo-op--on' : ''}`}
                                                  aria-pressed={b.dvh === dvh}
                                                  disabled={guardandoEsta}
                                                  onClick={() => escribir(o.id, v.id, 'dvh', dvh)}
                                                >
                                                  {dvh ? 'DVH' : 'Simple'}
                                                </button>
                                              ))}
                                            </span>
                                          ) : (
                                            <span className={`vid-tipo ${esDvh(v) ? 'vid-tipo--dvh' : ''}`}>
                                              {esDvh(v) ? 'DVH' : 'Simple'}
                                            </span>
                                          )}
                                        </td>
                                        <td>
                                          {b ? (
                                            <span className="vid-capas vid-capas--edicion">
                                              {(b.dvh ? (['comp1', 'camara', 'comp2'] as const) : (['comp1'] as const)).map((capa) => (
                                                <span key={capa} className={`vid-capa-sel ${capa === 'camara' ? 'vid-capa-sel--camara' : ''}`}>
                                                  <SelectBuscable
                                                    id={`vid-${v.id}-${capa}`}
                                                    valor={b[capa]}
                                                    opciones={opcionesDe(capa, b[capa])}
                                                    placeholder={TITULO_CAPA[capa]}
                                                    cargando={!opciones}
                                                    textoCargando="…"
                                                    disabled={guardandoEsta}
                                                    falta={!b[capa].trim()}
                                                    onElegir={(valor) => escribir(o.id, v.id, capa, valor)}
                                                  />
                                                </span>
                                              ))}
                                            </span>
                                          ) : esDvh(v) ? (
                                            <span className="vid-capas" title="Vidrio 1 · Cámara · Vidrio 2">
                                              <span className="vid-capa">{v.comp1 || '—'}</span>
                                              <span className="vid-capa vid-capa--camara">{v.camara || '—'}</span>
                                              <span className="vid-capa">{v.comp2 || '—'}</span>
                                            </span>
                                          ) : (
                                            <span className="vid-capas">
                                              <span className="vid-capa">{composicion(v)}</span>
                                            </span>
                                          )}
                                        </td>
                                        {enEdicion && escritos[v.id] ? (
                                          <>
                                            {(['ancho', 'alto', 'cantidad'] as const).map((campo) => {
                                              const valor = escritos[v.id][campo]
                                              const ok = campo === 'cantidad' ? cantidadValida(valor) : medidaValida(valor)
                                              return (
                                                <td key={campo}>
                                                  <input
                                                    className={`vid-input ${ok ? '' : 'vid-input--mal'}`}
                                                    inputMode="numeric"
                                                    value={valor}
                                                    disabled={guardandoEsta}
                                                    onChange={(e) => escribir(o.id, v.id, campo, e.target.value)}
                                                    aria-label={`${campo === 'cantidad' ? 'Cantidad' : campo === 'ancho' ? 'Ancho' : 'Alto'} de ${v.modelo || 'el vidrio'}`}
                                                  />
                                                </td>
                                              )
                                            })}
                                          </>
                                        ) : (
                                          <>
                                            <td className="vid-num">{v.ancho || '—'}</td>
                                            <td className="vid-num">{v.alto || '—'}</td>
                                            <td className="vid-cant">
                                              {v.cantidad ?? <span className="vid-falta">Sin cantidad</span>}
                                            </td>
                                          </>
                                        )}
                                        {enEdicion && (
                                          <td>
                                            <button
                                              type="button"
                                              className="vid-quitar"
                                              disabled={guardandoEsta}
                                              onClick={() => quitarVidrio(o.id, v.id)}
                                              title="Quitar este vidrio"
                                              aria-label={`Quitar ${v.modelo || 'el vidrio'}`}
                                            >
                                              <i className="fas fa-trash-can" />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    )
                                  })}
                                  {enEdicion && (filasAlta ?? []).map((f, i) => filaNueva(f, i))}
                                </tbody>
                              </table>
                              {enEdicion && (
                                /* Sumar vidrios a la orden y descartar la edición. */
                                <div className="vid-alta-pie">
                                  <button
                                    type="button"
                                    className="btn btn-out vid-editar"
                                    disabled={guardandoEsta}
                                    onClick={() => sumarFila(o.id)}
                                  >
                                    <i className="fas fa-plus" /> Agregar vidrios
                                  </button>
                                  <button type="button" className="cobro-reintentar" disabled={guardandoEsta} onClick={() => cerrarEdicion(o.id)}>
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* El paginador está siempre, aunque entren todas en una página. */}
          {ordenes !== null && (
            <div className="obras-pager">
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina === 0}
                onClick={() => setPagina(enPagina - 1)}
              >
                <i className="fas fa-chevron-left" /> Anterior
              </button>
              <span className="obras-pager-info">
                Página {enPagina + 1} de {paginas} · {ordenes.length} {ordenes.length === 1 ? 'orden' : 'órdenes'}
              </span>
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina >= paginas - 1}
                onClick={() => setPagina(enPagina + 1)}
              >
                Siguiente <i className="fas fa-chevron-right" />
              </button>
            </div>
          )}

          <div className="cobro-card-acts">
            {ordenes && ordenes.length > 0 && (
              <span className={`cobro-bloqueo-inline ${elegidas.length ? 'cobro-bloqueo-inline--ok' : 'cobro-bloqueo-inline--info'}`}>
                <i className={`fas ${elegidas.length ? 'fa-circle-check' : 'fa-circle-info'}`} />{' '}
                {elegidas.length
                  ? `${elegidas.length} ${elegidas.length === 1 ? 'orden elegida' : 'órdenes elegidas'} · ${totalPiezas} ${totalPiezas === 1 ? 'pieza' : 'piezas'} de vidrio para pedir.`
                  : 'Tildá las órdenes cuyos vidrios vas a pedir.'}
              </span>
            )}
          </div>
        </div>
      </div>

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', null, null, 'vidrios')} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {faltan && (
        <AvisoModal titulo="Elegí qué vidrios pedir" onClose={() => setFaltan(false)}>
          Tildá en la tabla al menos una orden con vidrios para armar la solicitud de cortes.
        </AvisoModal>
      )}
      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
    </section>
  )
}
