import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { SoltarArchivo, type EstadoSoltar } from '@/components/ui/SoltarArchivo'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useRefrescarObra } from '@/features/shared/PasoNav'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { getArchivosOrden, quitarEtmoDeOrden, subirEtmoAOrden } from '@/services/monday'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { useApp, useDispatch } from '@/state/hooks'
import { DatosMedicion } from './DatosMedicion'
import { DatosObraFaltantes } from './DatosObraFaltantes'
import { ObservacionesAberturas } from './ObservacionesAberturas'
import { fusionar } from './observaciones'
import { abrirOrdenDeObra } from './ordenDeObra'
import { faltaParaLeer } from './requisitos'
import { useLeerObservaciones } from './useLeerObservaciones'
import { useNumeroOrden } from './useNumeroOrden'

/**
 * Etapa 2 · Cargar OP Hetmo (obras de PVC, envío al cliente o constructor).
 *
 * Es un formulario de tres partes:
 *  1. CARGAR la orden de producción de HETMO, en el recuadro de arrastrar y soltar del cobro
 *     CONTADO de La Batea. Es ACÁ donde nace la OP en el tablero de órdenes: antes no tenía nada que
 *     guardar, y entrar a mirar una obra no deja ítems vacíos.
 *  2. Indicar si se cargan observaciones: al soltar el documento se pregunta si la IA lo lee para
 *     armar una caja por abertura. Si se dice que no, el desplegable lo ofrece de nuevo.
 *  3. Los datos base de la OP: el desplegable "Datos de Medición" (N° de orden, medido por y
 *     fecha).
 *
 * Nada de esto genera todavía la OP final: eso es la etapa 3, con el resumen a la vista. Lo cargado
 * vive en el borrador (estado global), así ir y volver con el stepper no pierde nada.
 */
export function CargarHetmoView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()
  const { borrador, responsableId, enviado, destino } = useApp()
  const lectura = useLeerObservaciones(obra.id)
  const numero = useNumeroOrden(obra)

  const [subiendo, setSubiendo] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const [proponerLectura, setProponerLectura] = useState(false)
  const [confirmarQuitar, setConfirmarQuitar] = useState<File | 'quitar' | null>(null)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const [indice, setIndice] = useState(0)
  const [procesando, setProcesando] = useState<'leyendo' | 'subiendo' | null>(null)

  /* Enviada la orden, la carga queda de consulta: lo que se mandó no se cambia. */
  const bloqueado = enviado
  useAccionEnCurso('Esperá a que termine de cargarse el documento.', subiendo || lectura.leyendo)

  const tieneEtmo = borrador.etmo.length > 0
  const falta = faltaParaLeer(obra, tieneEtmo)
  const faltanDatosObra = !obra.ubicacion.trim() || !obra.celCoordinar.trim()
  const escritas = borrador.aberturas.filter((a) => a.texto.trim()).length
  const m = borrador.medicion

  /** Cambiar algo de la carga invalida la OP final que ya se hubiera generado. */
  const cambiar = (cambios: Partial<typeof borrador>) =>
    dispatch({ type: 'setBorrador', cambios: { ...cambios, generada: false } })

  /* Los vidrios que devuelve la lectura van con la OP (subelementos): se guardan en el borrador. */
  useEffect(() => {
    if (lectura.vidrios.length) dispatch({ type: 'setBorrador', cambios: { vidrios: lectura.vidrios } })
  }, [lectura.vidrios, dispatch])

  /** Sube el documento a la OP —creándola si todavía no existe— y ofrece leerlo. */
  const subir = async (archivo: File) => {
    setConfirmarQuitar(null)
    if (!/pdf$/i.test(archivo.type || archivo.name)) {
      setErrorCarga('El archivo tiene que ser un PDF: es el documento que genera HETMO.')
      return
    }
    setErrorCarga('')
    setSubiendo(true)
    try {
      const id =
        borrador.ordenId ?? (await abrirOrdenDeObra(obra, m.nroOrden.trim(), responsableId)).id
      await subirEtmoAOrden(id, archivo)
      const { etmo } = await getArchivosOrden(id)
      lectura.limpiar()
      cambiar({ ordenId: id, etmo, aberturas: [], vidrios: [] })
      setIndice(0)
      const fresca = await refrescar().catch(() => null)
      setProponerLectura(!faltaParaLeer(fresca ?? obra, true))
    } catch {
      setErrorCarga('No se pudo guardar el documento en Monday. Probá de nuevo en unos segundos.')
      dispatch({ type: 'errorMonday', accion: 'cargar la orden de HETMO' })
    } finally {
      setSubiendo(false)
    }
  }

  /* Reemplazar o quitar el documento se lleva las observaciones: son las de ESE documento. Si hay
     algo escrito, se pregunta antes. */
  const pedirReemplazo = (archivo: File) => {
    if (escritas > 0) setConfirmarQuitar(archivo)
    else void subir(archivo)
  }

  const quitar = async () => {
    setConfirmarQuitar(null)
    if (!borrador.ordenId) return
    setSubiendo(true)
    try {
      await quitarEtmoDeOrden(borrador.ordenId)
      lectura.limpiar()
      cambiar({ etmo: [], aberturas: [], vidrios: [] })
    } catch {
      dispatch({ type: 'errorMonday', accion: 'quitar el documento' })
    } finally {
      setSubiendo(false)
    }
  }

  const leer = async () => {
    setProponerLectura(false)
    const leidas = await lectura.leer(borrador.ordenId, borrador.etmo[0] ?? null)
    if (borrador.ordenId) {
      void getArchivosOrden(borrador.ordenId)
        .then((a) => dispatch({ type: 'setBorrador', cambios: { etmo: a.etmo } }))
        .catch(() => {})
    }
    if (!leidas) return
    /* Lo ya escrito manda: la lectura aporta la LISTA, no pisa observaciones hechas a mano. */
    cambiar({ aberturas: fusionar(leidas, borrador.aberturas) })
    setIndice(0)
  }

  const continuar = () => {
    /* Con el documento todavía en proceso no se avanza: la lectura de Make llegaría con la etapa 3
       ya armada sin sus observaciones, y la OP final saldría incompleta. */
    if (lectura.leyendo || subiendo) {
      setProcesando(lectura.leyendo ? 'leyendo' : 'subiendo')
      return
    }
    const f = [
      ...(!tieneEtmo ? ['Cargá la orden de producción de HETMO.'] : []),
      ...(!m.nroOrden.trim() ? ['Falta el N° de orden en «Datos de Medición».'] : []),
      ...(faltanDatosObra ? ['La obra no tiene la ubicación o el celular a coordinar.'] : []),
    ]
    if (f.length) {
      setFaltan(f)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  const estadoDrop: EstadoSoltar = subiendo
    ? 'procesando'
    : lectura.leyendo
      ? 'procesando'
      : errorCarga
        ? 'error'
        : tieneEtmo
          ? 'listo'
          : 'vacio'

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Cargar OP Hetmo"
        descripcion="Como la obra seleccionada es PVC, cargá una orden específica de HETMO, indicá si se cargan observaciones y completá los datos de la medición."
      />


      <div className="carga-grid">
        <SoltarArchivo
          id="op-hetmo"
          archivo={borrador.etmo[0]?.nombre ?? null}
          estado={estadoDrop}
          titulo={
            subiendo
              ? 'Guardando el documento…'
              : lectura.leyendo
                ? 'Leyendo el documento…'
                : errorCarga
                  ? 'No se pudo cargar'
                  : tieneEtmo
                    ? 'Orden de HETMO cargada'
                    : undefined
          }
          detalle={
            subiendo
              ? 'Adjuntándolo a la orden de producción'
              : lectura.leyendo
                ? 'La IA está buscando los modelos y las aberturas'
                : errorCarga
                  ? errorCarga
                  : tieneEtmo
                    ? borrador.aberturas.length
                      ? `${borrador.aberturas.length} ${borrador.aberturas.length === 1 ? 'abertura leída' : 'aberturas leídas'}`
                      : 'Sin observaciones cargadas'
                    : 'Soltá en este área el PDF de la orden de HETMO, o hacé click para elegirlo'
          }
          deshabilitado={bloqueado}
          onArchivo={(f) => (tieneEtmo ? pedirReemplazo(f) : void subir(f))}
          onQuitar={tieneEtmo ? () => (escritas > 0 ? setConfirmarQuitar('quitar') : void quitar()) : undefined}
          accion={
            tieneEtmo && !borrador.aberturas.length && !falta
              ? { texto: 'Cargar observaciones', onClick: () => void leer() }
              : undefined
          }
        />

        {/* UNA sola card, fija, con sus dos secciones: los datos de la medición y las observaciones
            por abertura. Es todo lo que la OP lleva además del documento. */}
        <div className="card carga-datos">
          <section className="carga-sec">
            <h3 className="carga-sec-t">
              <i className="fas fa-ruler-combined" /> Datos de la medición
            </h3>
            <DatosMedicion
              valor={m}
              onCambio={(medicion) => cambiar({ medicion })}
              disabled={bloqueado}
              numeroCargando={numero.cargando}
              numeroError={numero.error}
            />
          </section>

          <hr className="carga-sep" />

          <section className="carga-sec">
            <h3 className="carga-sec-t">
              <i className="fas fa-pen-to-square" /> Cargar observaciones
              {borrador.aberturas.length > 0 && (
                <span className="carga-sec-dato">
                  {escritas} de {borrador.aberturas.length} escritas
                </span>
              )}
            </h3>
            {borrador.aberturas.length > 0 ? (
              <ObservacionesAberturas
                aberturas={borrador.aberturas}
                indice={indice}
                onIndice={setIndice}
                disabled={lectura.leyendo || bloqueado}
                onTexto={(i, valor) =>
                  cambiar({ aberturas: borrador.aberturas.map((a, n) => (n === i ? { ...a, texto: valor } : a)) })
                }
              />
            ) : (
              <div className="obs-vacio">
                <i className="fas fa-wand-magic-sparkles" />
                <p>
                  {tieneEtmo
                    ? 'La IA lee el documento y arma una caja por abertura para escribir su observación.'
                    : 'Primero cargá la orden de HETMO: las aberturas salen del documento.'}
                </p>
                {tieneEtmo && (
                  <button
                    type="button"
                    className="btn btn-out btn--sm"
                    disabled={!!falta || lectura.leyendo || bloqueado}
                    title={falta || undefined}
                    onClick={() => void leer()}
                  >
                    {lectura.leyendo ? (
                      <>
                        <i className="fas fa-circle-notch spin" /> Leyendo el documento…
                      </>
                    ) : (
                      <>
                        <i className="fas fa-wand-magic-sparkles" /> Cargar observaciones
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
            {lectura.estado.fase === 'error' && (
              <div style={{ marginTop: 12 }}>
                <Aviso tono="err">{lectura.estado.problema}</Aviso>
              </div>
            )}
            {falta && tieneEtmo && (
              <div style={{ marginTop: 12 }}>
                <Aviso tono="warn">{falta} La lectura de observaciones los necesita.</Aviso>
              </div>
            )}
          </section>
        </div>
      </div>

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', destino, tipoDe(obra))} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {faltanDatosObra && (
        <DatosObraFaltantes
          obra={obra}
          onGuardado={async () => {
            await refrescar()
          }}
          onSalir={() => dispatch({ type: 'goto', paso: 'obra' })}
        />
      )}

      {proponerLectura && (
        <Modal
          title="¿Querés cargar observaciones?"
          icon={<i className="fas fa-wand-magic-sparkles modal-icon--info" />}
          onClose={() => setProponerLectura(false)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setProponerLectura(false)}>
                No cargar observaciones
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void leer()}>
                <i className="fas fa-wand-magic-sparkles" /> Cargar observaciones
              </button>
            </>
          }
        >
          La IA lee el documento y arma una caja por abertura. Si ahora no, lo podés hacer después
          desde «Cargar Observaciones».
        </Modal>
      )}

      {confirmarQuitar && (
        <Modal
          title={confirmarQuitar === 'quitar' ? '¿Quitar el documento?' : '¿Reemplazar el documento?'}
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setConfirmarQuitar(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setConfirmarQuitar(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => (confirmarQuitar === 'quitar' ? void quitar() : void subir(confirmarQuitar))}
              >
                {confirmarQuitar === 'quitar' ? 'Quitar igual' : 'Reemplazar igual'}
              </button>
            </>
          }
        >
          Se borran también las <strong>{escritas} observaciones escritas</strong>: son las de este
          documento. El nuevo puede traer otras aberturas.
        </Modal>
      )}

      {procesando && (
        <AvisoModal
          titulo={procesando === 'leyendo' ? 'Se están leyendo las observaciones' : 'Se está cargando el documento'}
          onClose={() => setProcesando(null)}
        >
          {procesando === 'leyendo'
            ? 'La IA todavía está procesando la orden de HETMO para armar las observaciones por abertura. Esperá a que termine para continuar: si avanzás ahora, la OP final saldría sin ellas.'
            : 'La orden de HETMO todavía se está guardando en el sistema. Esperá a que termine para continuar.'}
        </AvisoModal>
      )}

      {faltan && (
        <AvisoModal titulo="Todavía no se puede continuar" faltantes={faltan} onClose={() => setFaltan(null)}>
          Completá lo siguiente para pasar a emitir la OP:
        </AvisoModal>
      )}
    </section>
  )
}
