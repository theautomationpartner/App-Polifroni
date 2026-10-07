import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { SoltarArchivo, type EstadoSoltar } from '@/components/ui/SoltarArchivo'
import { DatosMedicion, type Medicion } from '@/features/op/DatosMedicion'
import { ObservacionesAberturas } from '@/features/op/ObservacionesAberturas'
import type { Abertura } from '@/features/op/observaciones'
import { generarOpFinal } from '@/features/op/opFinal/generar'
import { FinalizarOperacion } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  aModeloListado,
  aberturasDeLectura,
  aberturasNuevas,
  conModelos,
  editarModelo,
  filasAberturas,
  filasVidrios,
  hayCambiosAberturas,
  hayCambiosVidrios,
  mismaAbertura,
  modelosDe,
  nombreConVersion,
  textoNueva,
  type CambioCampo,
  type ModeloListado,
} from '@/lib/edicionOp'
import { imagenAPdf } from '@/lib/imagenAPdf'
import { etiquetaPaso } from '@/lib/pasos'
import { ErrorLecturaIA, leerEdicion } from '@/services/ia/hetmo'
import {
  ArchivoMuyPesado,
  aberturasDeSubelementos,
  esImagen,
  getObra,
  prepararArchivoParaSubir,
  subelementosDeOrdenes,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { TEXTOS_FINALIZAR_EDICION, useRegistrarEdicion, verPdf } from './finalizarEdicion'
import { baseLista, lecturaBase, type BaseEdicion } from './lecturaBase'
import { ListaAberturasModal, ListaVidriosModal } from './ListasEdicion'
import { registrarEdicion } from './registrarEdicion'

/** Lo que propone la IA, antes de confirmar. */
interface Propuesta {
  base: BaseEdicion
  /** Los modelos de la OP, ya con las aberturas que cambian reemplazadas y las nuevas al final. */
  modelos: ModeloListado[]
  /** Las aberturas que cambian o se agregan: sus subelementos se arman de nuevo. */
  editados: ModeloListado[]
  /** Lo que cambia del dibujo (aberturas y vidrios). */
  cambios: CambioCampo[]
  /** Lo que cambia del formulario (la medición y las observaciones). */
  cambiosFormulario: CambioCampo[]
  /** Aberturas del dibujo nuevo que la OP no tenía: se agregan al final de la orden. */
  nuevas: ModeloListado[]
  /** Cuántas aberturas de la orden no están en el dibujo nuevo (quedan como estaban). */
  fueraDelDibujo: number
}

type Fase =
  | { tipo: 'leyendo'; detalle: string }
  | { tipo: 'propuesta'; p: Propuesta }
  | { tipo: 'sinCambios' }
  /** Generando la OP final nueva y registrándola en Monday: la ventana acompaña cada paso. */
  | { tipo: 'editando'; detalle: string }
  /** La OP final nueva quedó generada y registrada (la anterior, cancelada). */
  | { tipo: 'registrada' }
  | { tipo: 'error'; titulo: string; texto: string; reintentarRegistro?: boolean }

const hoy = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fechaDdMm = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const igual = (a: string, b: string) => a.trim() === b.trim()

/** La medición como está en la OP: el punto de partida del formulario. */
const medicionDe = (o: { numero: string; medidoPor: string; observacion: string; fechaMedicion: string }): Medicion => ({
  nroOrden: o.numero,
  nroEditado: false,
  medidoPor: o.medidoPor,
  observacion: o.observacion,
  fecha: o.fechaMedicion.slice(0, 10),
})

/**
 * Editar Órdenes de Producción · Etapa 2: el dibujo nuevo de HETMO y los datos de la orden.
 *
 * A la izquierda se carga el dibujo nuevo. A la derecha, el formulario de la orden: la medición
 * (medido por, fecha y observación de la OP) y la observación de cada abertura, con los valores de
 * la OP y editables; y las listas completas de aberturas y de vidrios.
 *
 * No se elige qué editar: la IA compara el dibujo con TODAS las aberturas de la orden y devuelve
 * cada una tal como figura ahí, y las que el dibujo trae y la orden no. La ventana dice "Se editará X
 * de A a B" y "Se agregará nueva abertura …", junto con lo que se cambió en el formulario.
 *
 * "Confirmar edición" arma la OP final nueva y, ahí mismo —con una ventana que acompaña cada paso—,
 * la registra en Monday: crea la OP nueva ("… V2", con sus subelementos, que no se esperan) y
 * cancela la anterior. Después las listas pasan a "Ver lista nueva …" (lo viejo tachado en rojo, lo
 * nuevo en verde) y se puede enviar la OP nueva (etapa 3) o terminar con "Finalizar Edición".
 */
export function EditarDibujoView() {
  const dispatch = useDispatch()
  const { edicion, paso } = useApp()
  const orden = edicion.orden!
  const generada = edicion.generada
  const registrada = !!edicion.nuevaId
  const finalizar = useRegistrarEdicion()
  const [dibujo, setDibujo] = useState<File | null>(generada?.dibujo ?? null)
  const [errorCarga, setErrorCarga] = useState('')
  const [fase, setFase] = useState<Fase | null>(null)
  const [sinGenerar, setSinGenerar] = useState(false)
  const [lista, setLista] = useState<'aberturas' | 'vidrios' | null>(null)
  const [indice, setIndice] = useState(0)
  /** Las observaciones de cada abertura como están en la OP (para saber qué se cambió). */
  const [obsOriginales, setObsOriginales] = useState<Abertura[] | null>(null)
  /** Los modelos de la OP (la lectura base): para las listas. */
  const [baseModelos, setBaseModelos] = useState<ModeloListado[] | null>(null)

  /* El borrador más reciente: el registro corre en el mismo click que lo actualiza, antes del render. */
  const edicionRef = useRef(edicion)
  edicionRef.current = edicion

  const ocupado = fase?.tipo === 'leyendo' || fase?.tipo === 'editando'
  useAccionEnCurso(
    fase?.tipo === 'editando' ? 'Esperá a que termine de registrarse la orden editada.' : 'Esperá a que termine de leerse el dibujo nuevo.',
    ocupado,
  )

  /* La etapa de envío sin la OP final nueva generada no tiene qué mandar: se queda acá. */
  useEffect(() => {
    if (paso === 'envio') dispatch({ type: 'goto', paso: 'carga' })
  }, [paso, dispatch])

  /* La medición arranca con la de la OP. */
  useEffect(() => {
    if (!edicion.medicion) dispatch({ type: 'setEdicion', cambios: { medicion: medicionDe(orden) } })
  }, [edicion.medicion, orden, dispatch])

  /* Los subelementos de la orden: se copian a la OP nueva y traen las observaciones de cada abertura.
     Sin subelementos, las aberturas salen de la lectura del original (sin observaciones). */
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const subs = edicion.subelementos ?? (await subelementosDeOrdenes([orden.id]))[orden.id] ?? []
        if (!vivo) return
        if (!edicion.subelementos) dispatch({ type: 'setEdicion', cambios: { subelementos: subs } })
        const desdeSubs = aberturasDeSubelementos(subs)
        const lasDeLaOp = desdeSubs.length ? desdeSubs : aberturasDeLectura((await lecturaBase(orden)).lectura)
        if (!vivo) return
        const originales = lasDeLaOp.map((a) => ({ nombre: a.modelo, texto: a.observacion }))
        setObsOriginales(originales)
        if (!edicion.observaciones) dispatch({ type: 'setEdicion', cambios: { observaciones: originales } })
      } catch {
        if (vivo) setObsOriginales([])
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.id])

  /* La lectura base (la de la OP final actual), para las listas de aberturas y vidrios. */
  useEffect(() => {
    let vivo = true
    lecturaBase(orden)
      .then((b) => vivo && setBaseModelos(modelosDe(b.lectura)))
      .catch(() => vivo && setBaseModelos([]))
    return () => {
      vivo = false
    }
  }, [orden])

  const medicion = edicion.medicion ?? medicionDe(orden)
  const observaciones = edicion.observaciones ?? []

  /** Lo que se cambió en el formulario respecto de la OP. */
  const cambiosFormulario = (): CambioCampo[] => {
    const original = medicionDe(orden)
    const c: CambioCampo[] = []
    if (!igual(medicion.medidoPor, original.medidoPor))
      c.push({ abertura: 'OP', campo: 'el medido por', anterior: original.medidoPor || '—', nuevo: medicion.medidoPor || '—' })
    if (!igual(medicion.fecha, original.fecha))
      c.push({ abertura: 'OP', campo: 'la fecha de medición', anterior: fechaDdMm(original.fecha) || '—', nuevo: fechaDdMm(medicion.fecha) || '—' })
    if (!igual(medicion.observacion, original.observacion))
      c.push({ abertura: 'OP', campo: 'la observación de la OP', anterior: original.observacion || '—', nuevo: medicion.observacion || '—' })
    for (const a of observaciones) {
      const antes = obsOriginales?.find((o) => o.nombre === a.nombre)?.texto ?? ''
      if (!igual(a.texto, antes)) c.push({ abertura: a.nombre, campo: 'la observación', anterior: antes || '—', nuevo: a.texto.trim() || '—' })
    }
    return c
  }

  /** Lee el dibujo nuevo con la IA y arma la propuesta de cambios. */
  const analizar = async (pdf: File) => {
    /* Otro análisis descarta la OP final nueva que se hubiera generado con el anterior. */
    if (edicion.generada) dispatch({ type: 'setEdicion', cambios: { generada: null } })
    try {
      setFase({
        tipo: 'leyendo',
        detalle: baseLista(orden.id) ? 'La IA está buscando qué cambió respecto de la orden' : 'Leyendo la orden original con la IA',
      })
      const base = await lecturaBase(orden)
      const modelos = modelosDe(base.lectura)
      if (!modelos.length) {
        setFase({ tipo: 'error', titulo: 'No se pudo leer la orden original', texto: 'La lectura de la orden original no trae ninguna abertura. Contactá con el soporte de TAP.' })
        return
      }
      setFase({ tipo: 'leyendo', detalle: 'La IA está buscando qué cambió respecto de la orden' })
      /* Todas las aberturas, con todos sus vidrios: la IA decide qué cambió. */
      const r = await leerEdicion(
        pdf,
        modelos.map((m) => ({
          codigo: m.codigo ?? '',
          descripcion: m.descripcion,
          color: m.color,
          ancho: m.ancho,
          alto: m.alto,
          cantidad: m.cantidad,
          vidrios: m.vidrios,
          taps: m.taps,
          vidriosAEditar: m.vidrios.map((_, i) => i),
        })),
        modelos.map((m) => m.codigo ?? '').filter(Boolean),
      )

      /* El dibujo nuevo va detrás de los documentos que la OP ya tiene. */
      const archivoIdx = base.documentos.length
      const cambios: CambioCampo[] = []
      const reemplazos = new Map<ModeloListado, ModeloListado>()
      let fueraDelDibujo = 0
      modelos.forEach((viejo, i) => {
        const leida = r.aberturas.find((x) => mismaAbertura(x.codigoOriginal, viejo.codigo)) ?? r.aberturas[i]
        if (!leida?.encontrada) {
          fueraDelDibujo++
          return
        }
        const nuevo = aModeloListado(leida.modelo)
        /* Todos sus vidrios se comparan (los que estaban y los que el dibujo agrega). */
        const todos = Array.from({ length: Math.max(viejo.vidrios.length, nuevo.vidrios.length) }, (_, k) => k)
        const ed = editarModelo(viejo, nuevo, todos, archivoIdx)
        /* Sólo cambia la que tiene cambios: las demás quedan como estaban, con su dibujo. */
        if (!ed.cambios.length) return
        reemplazos.set(viejo, ed.modelo)
        cambios.push(...ed.cambios)
      })
      const nuevas = aberturasNuevas(r.nuevas, modelos, archivoIdx)
      const delFormulario = cambiosFormulario()
      if (!reemplazos.size && !nuevas.length && !delFormulario.length) {
        setFase({ tipo: 'sinCambios' })
        return
      }
      setFase({
        tipo: 'propuesta',
        p: {
          base,
          modelos: [...modelos.map((m) => reemplazos.get(m) ?? m), ...nuevas],
          editados: [...reemplazos.values(), ...nuevas],
          cambios,
          cambiosFormulario: delFormulario,
          nuevas,
          fueraDelDibujo,
        },
      })
    } catch (e) {
      setFase({
        tipo: 'error',
        titulo: 'No se pudo procesar el dibujo nuevo',
        texto:
          e instanceof ErrorLecturaIA ? e.message : e instanceof Error ? e.message : 'No se pudo procesar el documento. Probá de nuevo en unos segundos.',
      })
    }
  }

  const subir = async (elegido: File) => {
    let archivo = elegido
    const pdf = /pdf$/i.test(archivo.type || archivo.name)
    if (!pdf && !esImagen(archivo)) {
      setErrorCarga('El archivo tiene que ser el PDF que genera HETMO, o una foto del dibujo.')
      return
    }
    setErrorCarga('')
    try {
      if (!pdf) archivo = await imagenAPdf(archivo)
      archivo = await prepararArchivoParaSubir(archivo)
    } catch (e) {
      setErrorCarga(e instanceof ArchivoMuyPesado ? e.message : 'No se pudo preparar el documento. Probá con otro archivo.')
      return
    }
    setDibujo(archivo)
    await analizar(archivo)
  }

  /** Registra en Monday la edición ya generada: la OP nueva ("… V2") y la anterior cancelada. */
  const registrar = async () => {
    const avance = (detalle: string) => setFase({ tipo: 'editando', detalle })
    try {
      avance('Registrando la orden nueva en Monday')
      const id = await registrarEdicion(
        // El borrador recién actualizado: `edicion` todavía es el del render anterior.
        edicionRef.current,
        (nueva) => dispatch({ type: 'setEdicion', cambios: { nuevaId: nueva } }),
        avance,
      )
      dispatch({ type: 'setEdicion', cambios: { nuevaId: id } })
      setFase({ tipo: 'registrada' })
    } catch (e) {
      console.warn('[editar] no se pudo registrar la orden editada', e)
      setFase({
        tipo: 'error',
        titulo: 'No se pudo registrar la orden editada',
        texto: `${e instanceof Error ? e.message : 'Monday no respondió.'} La OP final nueva está generada: reintentá el registro en unos segundos (se completa la misma orden nueva, no se crea otra).`,
        reintentarRegistro: true,
      })
    }
  }

  /**
   * Confirmar: arma la OP final nueva con el dibujo y el formulario, y ahí mismo la registra en
   * Monday (la OP nueva y la anterior cancelada).
   */
  const confirmar = async (p: Propuesta) => {
    if (!dibujo) return
    try {
      setFase({ tipo: 'editando', detalle: 'Armando la nueva orden de producción final' })
      const obra = edicion.obra ?? (await getObra(orden.obraId))
      if (!obra) throw new Error('No se encontró la obra de la orden en Monday.')
      const lectura = conModelos(p.base.lectura, p.modelos)
      const r = await generarOpFinal({
        lectura,
        obra: obra.nombre,
        direccion: obra.ubicacion,
        celular: obra.celCoordinar,
        nroOrden: orden.numero,
        fecha: hoy(),
        medidoPor: medicion.medidoPor,
        fechaMedicion: fechaDdMm(medicion.fecha),
        observacionOp: medicion.observacion,
        aberturas: observaciones,
        hetmo: p.base.documentos[0],
        otrosHetmo: [...p.base.documentos.slice(1), dibujo],
      })
      if (!r.ok || !r.archivo) throw new Error(`No se pudo generar la nueva OP final. ${r.errores.join(' · ')}`)
      const nombreNuevo = nombreConVersion(orden.nombre)
      const archivo = new File([r.archivo], r.archivo.name.replace(/\.pdf$/i, ` ${nombreNuevo.match(/V\d+$/)?.[0] ?? 'V2'}.pdf`), {
        type: 'application/pdf',
      })
      const cambios = { obra, nuevaId: null, generada: {
        archivo,
        lectura,
        modelos: p.modelos,
        editados: p.editados,
        cambios: [...p.cambiosFormulario, ...p.cambios],
        nuevas: p.nuevas,
        documentos: p.base.documentos,
        dibujo,
        nombreNuevo,
      } }
      dispatch({ type: 'setEdicion', cambios })
      edicionRef.current = { ...edicion, ...cambios }
      await registrar()
    } catch (e) {
      console.warn('[editar] no se pudo generar la OP final nueva', e)
      setFase({
        tipo: 'error',
        titulo: 'No se pudo generar la nueva OP final',
        texto: `${e instanceof Error ? e.message : 'Probá de nuevo en unos segundos.'} No se registró nada: la orden anterior sigue como estaba.`,
      })
    }
  }

  /** Seguir a la etapa de envío: sólo con la OP nueva generada y registrada. */
  const continuar = () => {
    if (!generada || !registrada) {
      setSinGenerar(true)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  /* Las listas: las de la OP y, con la edición generada, lo que cambia. */
  const finales = generada?.modelos ?? null
  const filasAb = useMemo(() => (baseModelos ? filasAberturas(baseModelos, finales) : null), [baseModelos, finales])
  const filasVid = useMemo(() => (baseModelos ? filasVidrios(baseModelos, finales) : null), [baseModelos, finales])
  const nuevaAb = !!finales && !!filasAb && hayCambiosAberturas(filasAb)
  const nuevaVid = !!finales && !!filasVid && hayCambiosVidrios(filasVid)

  const estadoDrop: EstadoSoltar = fase?.tipo === 'leyendo' ? 'procesando' : errorCarga ? 'error' : dibujo ? 'listo' : 'vacio'
  /* Registrada la orden nueva, la edición ya está hecha: no se vuelve a analizar ni a cambiar el formulario. */
  const bloqueado = registrada
  const todosLosCambios = fase?.tipo === 'propuesta' ? [...fase.p.cambiosFormulario, ...fase.p.cambios] : []

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Cargar Nuevo Dibujo HETMO"
        descripcion={`Cargá el nuevo dibujo de HETMO de la orden ${orden.numero ? `N° ${orden.numero}` : orden.nombre}: la IA detecta qué aberturas cambiaron y cuáles se agregaron. Revisá y corregí los datos de la orden a la derecha.`}
      />

      <div className="carga-grid">
        <SoltarArchivo
          id="ed-hetmo"
          archivo={dibujo?.name ?? null}
          estado={estadoDrop}
          titulo={
            fase?.tipo === 'leyendo'
              ? 'Analizando el nuevo dibujo…'
              : errorCarga
                ? 'No se pudo cargar'
                : registrada
                  ? 'Orden editada'
                  : dibujo
                    ? 'Nuevo dibujo cargado'
                    : undefined
          }
          detalle={
            fase?.tipo === 'leyendo'
              ? fase.detalle
              : errorCarga ||
                (registrada
                  ? `Se registró ${generada?.nombreNuevo ?? 'la orden nueva'} y se canceló la anterior`
                  : dibujo
                    ? 'Para analizarlo de nuevo, volvé a cargarlo'
                    : 'Soltá en este área el PDF del nuevo dibujo de HETMO (o una foto), o hacé click para elegirlo')
          }
          accept="application/pdf,.pdf,image/*"
          formatos="PDF o imagen"
          deshabilitado={ocupado || bloqueado}
          onArchivo={(f) => void subir(f)}
          onQuitar={dibujo && !ocupado && !bloqueado ? () => setDibujo(null) : undefined}
          accion={
            dibujo && !ocupado && !bloqueado && fase?.tipo !== 'propuesta'
              ? { texto: 'Analizar de nuevo', onClick: () => void analizar(dibujo) }
              : undefined
          }
        />

        {/* El formulario de la orden: la medición y las observaciones, con los valores de la OP. */}
        <div className="card carga-datos">
          <section className="carga-sec">
            <h3 className="carga-sec-t">
              <i className="fas fa-ruler-combined" /> Datos de la medición
            </h3>
            <DatosMedicion
              valor={medicion}
              onCambio={(m) => dispatch({ type: 'setEdicion', cambios: { medicion: m } })}
              disabled={bloqueado || ocupado}
            />
          </section>

          <hr className="carga-sep" />

          <section className="carga-sec">
            <h3 className="carga-sec-t">
              <i className="fas fa-pen-to-square" /> Observaciones por abertura
              {observaciones.length > 0 && (
                <span className="carga-sec-dato">
                  {observaciones.filter((a) => a.texto.trim()).length} de {observaciones.length} con observación
                </span>
              )}
            </h3>
            {edicion.observaciones === null ? (
              <p className="cobro-card-desc">
                <i className="fas fa-spinner fa-spin" /> Leyendo las aberturas de la orden...
              </p>
            ) : observaciones.length ? (
              <ObservacionesAberturas
                aberturas={observaciones}
                indice={indice}
                onIndice={setIndice}
                disabled={bloqueado || ocupado}
                onTexto={(i, valor) =>
                  dispatch({
                    type: 'setEdicion',
                    cambios: { observaciones: observaciones.map((a, n) => (n === i ? { ...a, texto: valor } : a)) },
                  })
                }
              />
            ) : (
              <p className="cobro-card-desc">No se pudieron leer las aberturas de la orden.</p>
            )}
          </section>

          <hr className="carga-sep" />

          <div className="ed-listas">
            <button type="button" className={`btn ${nuevaAb ? 'btn-primary btn-marca' : 'btn-out'}`} onClick={() => setLista('aberturas')}>
              <i className="fas fa-table-cells-large" /> {nuevaAb ? 'Ver lista nueva de aberturas' : 'Ver lista de aberturas'}
            </button>
            <button type="button" className={`btn ${nuevaVid ? 'btn-primary btn-marca' : 'btn-out'}`} onClick={() => setLista('vidrios')}>
              <i className="fas fa-border-all" /> {nuevaVid ? 'Ver lista nueva de vidrios' : 'Ver lista de vidrios'}
            </button>
          </div>
        </div>
      </div>

      <PieEtapa>
        {/* Las acciones juntas a la derecha; "Volver" queda solo a la izquierda. */}
        <div className="ed-pie-acc">
          {generada && (
            <button type="button" className="btn btn-out" onClick={() => verPdf(generada.archivo)}>
              <i className="fas fa-eye" /> Ver OP final
            </button>
          )}
          {generada && registrada && (
            <FinalizarOperacion etiqueta="Finalizar Edición" textos={TEXTOS_FINALIZAR_EDICION} detalle={generada.nombreNuevo} registrar={finalizar} />
          )}
          <button type="button" className="btn btn-primary btn-marca" disabled={ocupado} onClick={continuar}>
            Continuar a {etiquetaPaso('envio', null, 'PVC', 'editar')} <i className="fas fa-arrow-right" />
          </button>
        </div>
      </PieEtapa>

      {lista === 'aberturas' && <ListaAberturasModal filas={filasAb} nueva={nuevaAb} onClose={() => setLista(null)} />}
      {lista === 'vidrios' && <ListaVidriosModal filas={filasVid} nueva={nuevaVid} onClose={() => setLista(null)} />}

      {fase?.tipo === 'propuesta' && (
        <Modal
          title="Revisá la edición de la orden"
          icon={<i className="fas fa-pen-ruler modal-icon--marca" />}
          className="modal-box--ancho"
          onClose={() => setFase(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setFase(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-marca" onClick={() => void confirmar(fase.p)}>
                <i className="fas fa-check" /> Confirmar edición
              </button>
            </>
          }
        >
          <div className="ed-cambios">
            <ul className="ed-lista">
              {fase.p.nuevas.map((m) => (
                <li key={`nueva-${m.codigo}`} className="ed-agrega">
                  <span className="ed-ab ed-ab--nueva">Nueva</span> Se agregará nueva abertura <strong>{textoNueva(m)}</strong>
                </li>
              ))}
              {todosLosCambios.map((c, i) => (
                <li key={i}>
                  <span className="ed-ab">{c.abertura}</span> {c.campo.startsWith('los ') ? 'Se editarán' : 'Se editará'}{' '}
                  <strong>{c.campo}</strong> de <span className="ed-viejo">{c.anterior}</span> a{' '}
                  <span className="ed-nuevo">{c.nuevo}</span>
                </li>
              ))}
            </ul>
            {fase.p.fueraDelDibujo > 0 && (
              <p className="ed-nota">
                <i className="fas fa-circle-info" />{' '}
                {fase.p.fueraDelDibujo === 1
                  ? '1 abertura de la orden no está en el nuevo dibujo y queda como estaba.'
                  : `${fase.p.fueraDelDibujo} aberturas de la orden no están en el nuevo dibujo y quedan como estaban.`}
              </p>
            )}
            <p className="ed-nota">
              Al confirmar se genera la nueva OP final y se registra en Monday: se crea la orden «{nombreConVersion(orden.nombre)}» con el
              mismo número, datos y estado, y la orden actual se cancela con el motivo de la edición.
            </p>
          </div>
        </Modal>
      )}

      {fase?.tipo === 'sinCambios' && (
        <Modal
          title="No se encontraron cambios"
          icon={<i className="fas fa-circle-info modal-icon--marca" />}
          onClose={() => setFase(null)}
          actions={
            <>
              {/* El mismo "Volver a Inicio" del cierre de una operación (`CierreOperacion`). */}
              <button type="button" className="btn btn-out" onClick={() => dispatch({ type: 'reset' })}>
                <i className="fas fa-house" /> Volver a Inicio
              </button>
              <button type="button" className="btn btn-out" onClick={() => setFase(null)}>
                Volver
              </button>
            </>
          }
        >
          La IA no encontró aberturas modificadas ni nuevas en el dibujo cargado respecto de la orden, y no cambiaste
          los datos de la orden. Revisá que sea el dibujo correcto; si lo es, la orden no necesita editarse.
        </Modal>
      )}

      {fase?.tipo === 'editando' && <ModalCargando titulo="Editando orden de producción..." detalle={fase.detalle} />}

      {fase?.tipo === 'registrada' && generada && (
        <Modal
          title="Orden de producción editada"
          icon={<i className="fas fa-circle-check modal-icon--ok" />}
          onClose={() => setFase(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => verPdf(generada.archivo)}>
                <i className="fas fa-eye" /> Ver OP final
              </button>
              <button type="button" className="btn btn-primary btn-marca" onClick={() => setFase(null)}>
                Aceptar
              </button>
            </>
          }
        >
          Se creó la orden <strong>{generada.nombreNuevo}</strong> y la anterior quedó cancelada con el motivo de la
          edición. Continuá a enviarla, o tocá «Finalizar Edición» para terminar sin enviarla.
        </Modal>
      )}

      {sinGenerar && (
        <Modal
          title="Falta generar la nueva OP final"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setSinGenerar(false)}
          actions={
            <button type="button" className="btn btn-primary btn-marca" onClick={() => setSinGenerar(false)}>
              Entendido
            </button>
          }
        >
          Cargá el nuevo dibujo de HETMO y confirmá la edición: con la OP final nueva generada vas a poder enviarla.
        </Modal>
      )}

      {fase?.tipo === 'error' && (
        <Modal
          title={fase.titulo}
          icon={<i className="fas fa-circle-exclamation" />}
          onClose={() => setFase(null)}
          actions={
            fase.reintentarRegistro ? (
              <>
                <button type="button" className="btn btn-out" onClick={() => setFase(null)}>
                  Cerrar
                </button>
                <button type="button" className="btn btn-primary btn-marca" onClick={() => void registrar()}>
                  <i className="fas fa-rotate-right" /> Reintentar registro
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-marca" onClick={() => setFase(null)}>
                Aceptar
              </button>
            )
          }
        >
          {fase.texto}
        </Modal>
      )}
    </section>
  )
}
