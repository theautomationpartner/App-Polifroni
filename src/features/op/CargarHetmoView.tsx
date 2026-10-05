import { useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { SoltarArchivo, type EstadoSoltar } from '@/components/ui/SoltarArchivo'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useRefrescarObra } from '@/features/shared/PasoNav'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { ArchivoMuyPesado, esImagen, prepararArchivoParaSubir } from '@/services/monday'
import { ErrorLecturaIA, aAberturasOp, aVidriosOp, leerHetmo } from '@/services/ia/hetmo'
import { imagenAPdf } from '@/lib/imagenAPdf'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { useApp, useDispatch } from '@/state/hooks'
import { DatosMedicion } from './DatosMedicion'
import { DatosObraFaltantes } from './DatosObraFaltantes'
import { LecturaHetmoModal, type FaseLecturaHetmo } from './LecturaHetmoModal'
import { ObservacionesAberturas } from './ObservacionesAberturas'
import { fusionar } from './observaciones'
import { reservarNumeroDeCarga } from './ordenDeObra'
import { useNumeroOrden } from './useNumeroOrden'

/**
 * Etapa 2 · Cargar OP Hetmo (obras de PVC, envío al cliente o constructor).
 *
 * Es un formulario de tres partes:
 *  1. CARGAR la orden de producción de HETMO, en el recuadro de arrastrar y soltar del cobro
 *     CONTADO de La Batea. El documento queda EN LA APP: en Monday no se crea nada hasta "Finalizar
 *     Operación", que crea la OP y le sube este original (ver `registrarPvc`). Al cargarlo sólo se
 *     reserva el N° de orden en la base, porque va impreso en la OP final que se envía.
 *  2. La lectura con IA (Claude, vía `/api/hetmo`): al soltar el documento se buscan sus vidrios y
 *     se muestran en una ventana. La IA recibe el PDF directo de la app. La ventana que ofrece generar las observaciones —una caja por abertura—. Si
 *     ahí se dice que no, la sección de observaciones lo ofrece de nuevo. También se acepta una foto
 *     del listado: se convierte a PDF antes de subirla.
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
  const { borrador, enviado, destino } = useApp()
  const numero = useNumeroOrden(obra)

  const [subiendo, setSubiendo] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  /** La IA está leyendo el documento: los vidrios (al soltarlo) o las observaciones. */
  const [leyendo, setLeyendo] = useState<'vidrios' | 'observaciones' | null>(null)
  const [ventana, setVentana] = useState<FaseLecturaHetmo | null>(null)
  const [confirmarQuitar, setConfirmarQuitar] = useState<File | 'quitar' | null>(null)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const [indice, setIndice] = useState(0)
  const [procesando, setProcesando] = useState<'leyendo' | 'subiendo' | null>(null)

  /* Enviada la orden, la carga queda de consulta: lo que se mandó no se cambia. */
  const bloqueado = enviado
  useAccionEnCurso('Esperá a que termine de procesarse el documento.', subiendo || !!leyendo)

  /** El PDF de HETMO cargado en la app (todavía no está en Monday). */
  const documento = borrador.hetmo
  const tieneDocumento = !!documento
  const faltanDatosObra = !obra.ubicacion.trim() || !obra.celCoordinar.trim()
  const escritas = borrador.aberturas.filter((a) => a.texto.trim()).length
  const m = borrador.medicion

  /** Cambiar algo de la carga invalida la OP final que ya se hubiera generado. */
  const cambiar = (cambios: Partial<typeof borrador>) =>
    dispatch({ type: 'setBorrador', cambios: { ...cambios, generada: false } })

  const problemaDe = (e: unknown) =>
    e instanceof ErrorLecturaIA ? e.message : 'No se pudo procesar el documento. Probá de nuevo en unos segundos.'

  /**
   * Primera lectura: los vidrios. Van con la OP (subelementos), así que se guardan en el borrador, y
   * se muestran en la ventana —aunque no haya ninguno: eso también hay que verlo—.
   */
  const buscarVidrios = async (pdf: File) => {
    setLeyendo('vidrios')
    try {
      const lectura = await leerHetmo(pdf, 'vidrios')
      dispatch({ type: 'setBorrador', cambios: { vidrios: aVidriosOp(lectura.vidrios), generada: false } })
      setVentana({ fase: 'vidrios' })
    } catch (e) {
      setVentana({ fase: 'error', problema: problemaDe(e), reintentar: () => void buscarVidrios(pdf) })
    } finally {
      setLeyendo(null)
    }
  }

  /**
   * Segunda lectura: las observaciones, en la misma ventana. Lo que importa son las ABERTURAS (los
   * modelos del documento): con ellas se arma una caja por abertura y la ventana se cierra sola,
   * aunque el PDF no traiga ninguna observación escrita —las cajas quedan vacías para que el usuario
   * las cargue—. Sólo se avisa si el documento no tiene ninguna abertura.
   */
  const generarObservaciones = async () => {
    if (!tieneDocumento) return
    setVentana({ fase: 'leyendoObs' })
    setLeyendo('observaciones')
    try {
      const lectura = await leerHetmo(documento!, 'observaciones')
      const leidas = aAberturasOp(lectura.observaciones)
      /* Lo ya escrito manda: la lectura aporta la LISTA, no pisa observaciones hechas a mano. */
      if (leidas.length) cambiar({ aberturas: fusionar(leidas, borrador.aberturas) })
      setIndice(0)
      setVentana(leidas.length ? null : { fase: 'sinObs' })
    } catch (e) {
      setVentana({ fase: 'error', problema: problemaDe(e), reintentar: () => void generarObservaciones() })
    } finally {
      setLeyendo(null)
    }
  }

  /**
   * Toma el documento: lo deja en la app, se lo pasa a la IA para buscar sus vidrios y reserva el
   * N° de orden. A Monday no va nada: eso pasa al finalizar.
   */
  const subir = async (elegido: File) => {
    let archivo = elegido
    setConfirmarQuitar(null)
    const pdf = /pdf$/i.test(archivo.type || archivo.name)
    if (!pdf && !esImagen(archivo)) {
      setErrorCarga('El archivo tiene que ser el PDF que genera HETMO, o una foto del listado.')
      return
    }
    setErrorCarga('')
    setSubiendo(true)
    let lectura: Promise<void> | null = null
    try {
      /* Una foto se convierte en un PDF de una hoja: la OP guarda siempre un PDF. */
      if (!pdf) {
        try {
          archivo = await imagenAPdf(archivo)
        } catch {
          setErrorCarga('No se pudo convertir la imagen a PDF. Probá con otra foto o con el PDF de HETMO.')
          return
        }
      }
      /* El mismo filtro que se aplica al subir: un archivo que no entra en el tope de Vercel se
         rechaza AHORA, no al finalizar. */
      archivo = await prepararArchivoParaSubir(archivo)
      /* Otro documento: los vidrios y las observaciones del anterior ya no valen. */
      cambiar({ hetmo: archivo, hetmoDeFoto: !pdf, aberturas: [], vidrios: [] })
      setIndice(0)
      lectura = buscarVidrios(archivo)
      /* Si otra persona tomó el número que se mostraba, el campo pasa al que quedó reservado. Si la
         base no contesta, se sigue: el número se reserva al finalizar. */
      const reservado = await reservarNumeroDeCarga(obra, m, borrador.numeroReservado).catch((e) => {
        console.warn('[numeración] no se pudo reservar el número al cargar', e)
        return null
      })
      if (reservado) cambiar({ medicion: { ...m, nroOrden: reservado }, numeroReservado: true })
    } catch (e) {
      if (e instanceof ArchivoMuyPesado) {
        setErrorCarga(e.message)
        return
      }
      setErrorCarga('No se pudo preparar el documento. Probá de nuevo en unos segundos.')
    } finally {
      setSubiendo(false)
    }
    await lectura
  }

  /* Reemplazar o quitar el documento se lleva las observaciones: son las de ESE documento. Si hay
     algo escrito, se pregunta antes. */
  const pedirReemplazo = (archivo: File) => {
    if (escritas > 0) setConfirmarQuitar(archivo)
    else void subir(archivo)
  }

  /* El documento vive en la app: quitarlo no toca Monday. */
  const quitar = () => {
    setConfirmarQuitar(null)
    cambiar({ hetmo: null, aberturas: [], vidrios: [] })
  }

  const continuar = () => {
    /* Con el documento todavía en proceso no se avanza: la lectura llegaría con la etapa 3 ya
       armada sin sus vidrios ni sus observaciones, y la OP final saldría incompleta. */
    if (leyendo || subiendo) {
      setProcesando(leyendo ? 'leyendo' : 'subiendo')
      return
    }
    const f = [
      ...(!tieneDocumento ? ['Cargá la orden de producción de HETMO.'] : []),
      ...(!m.nroOrden.trim() ? ['Falta el N° de orden en «Datos de Medición».'] : []),
      ...(faltanDatosObra ? ['La obra no tiene la ubicación o el celular a coordinar.'] : []),
    ]
    if (f.length) {
      setFaltan(f)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  const estadoDrop: EstadoSoltar =
    subiendo || leyendo ? 'procesando' : errorCarga ? 'error' : tieneDocumento ? 'listo' : 'vacio'

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
          archivo={documento?.name ?? null}
          estado={estadoDrop}
          titulo={
            subiendo || leyendo
              ? 'Procesando documento…'
              : errorCarga
                  ? 'No se pudo cargar'
                  : tieneDocumento
                    ? 'Orden de HETMO cargada'
                    : undefined
          }
          detalle={
            leyendo
              ? leyendo === 'vidrios'
                ? 'La IA está buscando los vidrios de la orden'
                : 'La IA está leyendo las observaciones de cada modelo'
              : subiendo
                ? 'Preparando el documento'
                : errorCarga
                  ? errorCarga
                  : tieneDocumento
                    ? borrador.aberturas.length
                      ? `${borrador.aberturas.length} ${borrador.aberturas.length === 1 ? 'abertura leída' : 'aberturas leídas'}`
                      : 'Sin observaciones cargadas'
                    : 'Soltá en este área el PDF de la orden de HETMO (o una foto del listado), o hacé click para elegirlo'
          }
          accept="application/pdf,.pdf,image/*"
          formatos="PDF o imagen"
          deshabilitado={bloqueado}
          onArchivo={(f) => (tieneDocumento ? pedirReemplazo(f) : void subir(f))}
          onQuitar={tieneDocumento ? () => (escritas > 0 ? setConfirmarQuitar('quitar') : quitar()) : undefined}
          accion={
            tieneDocumento && !borrador.aberturas.length && !leyendo
              ? { texto: 'Cargar observaciones', onClick: () => void generarObservaciones() }
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
                disabled={!!leyendo || bloqueado}
                onTexto={(i, valor) =>
                  cambiar({ aberturas: borrador.aberturas.map((a, n) => (n === i ? { ...a, texto: valor } : a)) })
                }
              />
            ) : (
              <div className="obs-vacio">
                <i className="fas fa-wand-magic-sparkles" />
                <p>
                  {tieneDocumento
                    ? 'La IA lee el documento y arma una caja por abertura para escribir su observación.'
                    : 'Primero cargá la orden de HETMO: las aberturas salen del documento.'}
                </p>
                {tieneDocumento && (
                  <button
                    type="button"
                    className="btn btn-out btn--sm"
                    disabled={!!leyendo || bloqueado}
                    onClick={() => void generarObservaciones()}
                  >
                    {leyendo === 'observaciones' ? (
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

      {ventana && (
        <LecturaHetmoModal
          vidrios={borrador.vidrios}
          estado={ventana}
          onGenerarObservaciones={() => void generarObservaciones()}
          onClose={() => setVentana(null)}
        />
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
                onClick={() => (confirmarQuitar === 'quitar' ? quitar() : void subir(confirmarQuitar))}
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
          titulo={procesando === 'leyendo' ? 'Se está procesando el documento' : 'Se está cargando el documento'}
          onClose={() => setProcesando(null)}
        >
          {procesando === 'leyendo'
            ? 'La IA todavía está procesando la orden de HETMO para leer sus vidrios y observaciones. Esperá a que termine para continuar: si avanzás ahora, la OP final saldría sin ellos.'
            : 'La orden de HETMO todavía se está preparando. Esperá a que termine para continuar.'}
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
