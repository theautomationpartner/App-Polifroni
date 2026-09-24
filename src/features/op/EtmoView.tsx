import { useEffect, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { DropArchivo } from '@/components/ui/DropArchivo'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { datosObservaciones, useGenerarOp } from './useGenerarOp'
import {
  COL,
  getUrlArchivo,
  guardarObservaciones,
  limpiarArchivos,
  limpiarEstado,
  subirArchivo,
} from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { ArchivoObra } from '@/types'
import { ObservacionesAberturas } from './ObservacionesAberturas'
import { DatosMedicion, medicionInicial, type Medicion } from './DatosMedicion'
import { fusionar, parsear, rotuloAbertura, serializar, sinCompletar, type Abertura } from './observaciones'
import { faltaParaLeer } from './requisitos'
import { useLeerObservaciones } from './useLeerObservaciones'

/** Datos de la medición (nro de orden, medido por, fecha). Apagado hasta que se guarden en su tablero. */
const MOSTRAR_MEDICION = false

/** Archivos ya adjuntos en la columna: se abren, y se quitan si se cargó el equivocado. */
function ListaArchivos({
  archivos,
  onQuitar,
  quitando,
}: {
  archivos: ArchivoObra[]
  onQuitar: () => void
  quitando: boolean
}) {
  const [abriendo, setAbriendo] = useState<string | null>(null)

  const abrir = async (a: ArchivoObra) => {
    setAbriendo(a.assetId)
    try {
      const url = await getUrlArchivo(a.assetId)
      window.open(url, '_blank', 'noreferrer')
    } finally {
      setAbriendo(null)
    }
  }

  if (archivos.length === 0) return null

  return (
    <div className="archivo-lista">
      {archivos.map((a) => (
        <div className="archivo-item" key={a.assetId}>
          <i className={`fas ${a.esImagen ? 'fa-file-image' : 'fa-file-pdf'}`} />
          <span className="archivo-item-n">{a.nombre}</span>
          <button type="button" className="archivo-item-a" onClick={() => void abrir(a)}>
            {abriendo === a.assetId ? 'Abriendo…' : 'Ver'}
          </button>
          {/* Quitar vacía la columna ENTERA: Monday no sabe borrar un archivo suelto. Por eso el
              botón está en cada renglón pero avisa de qué se trata antes de tocar nada. */}
          <button
            type="button"
            className="archivo-item-x"
            title="Quitar el documento de la obra"
            aria-label="Quitar el documento de la obra"
            disabled={quitando}
            onClick={onQuitar}
          >
            <i className={`fas ${quitando ? 'fa-circle-notch spin' : 'fa-xmark'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Paso 2 · Orden ETMO y observaciones.
 *
 * Son las dos entradas del escenario que arma la OP final: el PDF que genera el sistema de diseño
 * y las observaciones. Las dos viven en el tablero, y por eso se escriben acá y no en un borrador
 * local: el escenario las lee de ahí.
 *
 * Las observaciones se editan POR ABERTURA, y no se escriben a mano en un campo libre: quién sabe
 * cuántas aberturas tiene el documento es el documento. Por eso cargar el ETMO y leerlo es UN solo
 * gesto, y el panel de observaciones recién se habilita cuando la lectura contestó. Si en el
 * momento se dijo que no, el botón de leer queda ahí para cuando se cambie de idea.
 */
export function EtmoView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()
  const lectura = useLeerObservaciones(obra.id)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [guardado, setGuardado] = useState<'limpio' | 'guardando' | 'guardado' | 'error'>('limpio')
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'err' | 'info'; texto: string } | null>(null)
  /** Se abre al cargar el documento: leerlo es una corrida, se pregunta antes de gastarla. */
  const [proponerLectura, setProponerLectura] = useState(false)
  /** Se abre al quitar el documento CUANDO hay observaciones escritas que se van a perder. */
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  /** Con valor = hay una confirmación abierta. Adentro, las aberturas que quedaron sin escribir. */
  const [confirmarGenerar, setConfirmarGenerar] = useState<string[] | null>(null)
  /* La OP final se genera DESDE ACÁ. Antes había que pasar al paso 3 y apretar otro botón: dos
     pantallas para una decisión que ya se tomó al tocar "Generar la OP final". */
  const generacion = useGenerarOp(obra)
  /* La obra YA tiene una orden final adjunta. No frena nada —rehacerla es una operación normal—
     pero cambia la pregunta: no es "¿generamos?" sino "¿reemplazamos la que ya está?", y eso hay
     que decirlo antes, no después. */
  const yaTieneOp = obra.opFinal.length > 0


  /* Las aberturas salen del propio campo del tablero, que ya guarda una línea por modelo. Así, al
     volver a esta etapa, la lista está sin tener que releer el documento. */
  const [aberturas, setAberturas] = useState<Abertura[]>(() => parsear(obra.observaciones))
  const [indice, setIndice] = useState(0)
  /* Datos de la medición. Todavía no se guardan: van a ir a un tablero propio. */
  const [medicion, setMedicion] = useState<Medicion>(medicionInicial)

  /** Lo último que quedó escrito en el tablero. Es lo que separa "lo mío" de "lo de afuera". */
  const ultimoGuardado = useRef(obra.observaciones)
  /** Lo escrito que todavía no llegó al tablero, para no perderlo al salir de la pantalla. */
  const pendiente = useRef<string | null>(null)
  /**
   * Si en ESTA visita alguien tocó el texto.
   *
   * Sin esto, el guardado al salir depende de comparar dos cadenas, y cualquier camino que deje
   * la lista vacía sin que nadie haya escrito —abrir la obra a medio cargar, un estado que se
   * reinicia— termina escribiendo un campo vacío sobre lo que había. Guardar sólo cuando hubo
   * una edición de verdad hace que ese borrado silencioso no pueda ocurrir.
   */
  const edito = useRef(false)

  /* Si el tablero cambia por afuera (volver de otra etapa, otra persona editando), los campos toman
     lo que quedó ahí. Lo que ACABAMOS de guardar nosotros no cuenta como cambio de afuera: releer
     la obra después de guardar no tiene que pisar lo que se está escribiendo. */
  useEffect(() => {
    if (obra.observaciones === ultimoGuardado.current) return
    ultimoGuardado.current = obra.observaciones
    setAberturas(parsear(obra.observaciones))
  }, [obra.observaciones])

  const tieneAberturas = aberturas.length > 0
  const texto = serializar(aberturas)
  const tieneEtmo = obra.ordenEtmo.length > 0
  /* Lo mismo que filtra el router del escenario. Si falta algo, la corrida se cortaría sin avisar
     —y de paso ya habría tocado el estado de la obra—, así que el botón no se habilita. */
  const falta = faltaParaLeer(obra)
  /* Texto que ya estaba en la columna y NO tiene el formato por abertura: lo escribió alguien a
     mano, o quedó de antes de esta pantalla. No se puede editar acá —no hay aberturas contra las
     cuales ordenarlo— pero tampoco se puede esconder: generar las observaciones lo reemplaza. */
  const textoViejo = tieneAberturas ? '' : obra.observaciones.trim()

  /* Lo escrito NO se guarda mientras se escribe: se completan las que se quieran, en el orden que
     se quiera, y recién al salir del paso se vuelca al tablero. `pendiente` es lo último tecleado,
     y el efecto de abajo lo manda al desmontar la pantalla —se salga por donde se salga—. */
  pendiente.current = edito.current && texto !== ultimoGuardado.current ? texto : null

  useEffect(() => {
    return () => {
      const ultimo = pendiente.current
      if (ultimo !== null) void guardarObservaciones(obra.id, ultimo).catch(() => {})
    }
  }, [obra.id])

  /** Sube el documento a la obra y, con él arriba, ofrece leerlo. */
  const cargar = async () => {
    if (!archivo) return
    setSubiendo(true)
    setAviso(null)
    try {
      await subirArchivo(obra.id, COL.ordenEtmo, archivo)
      const fresca = await refrescar()
      setArchivo(null)
      /* Sólo se ofrece leer si el escenario va a poder: proponerlo para que después falle en su
         filtro es hacerle perder el tiempo a quien dijo que sí. */
      setProponerLectura(fresca ? !faltaParaLeer(fresca) : false)
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo adjuntar el archivo en Monday.' })
      dispatch({ type: 'errorMonday', accion: 'adjuntar la Orden ETMO' })
    } finally {
      setSubiendo(false)
    }
  }

  /**
   * Quita el documento Y las observaciones.
   *
   * Van juntos porque las aberturas SON las de ese documento: la lista la armó su lectura. Dejarlas
   * al cambiar de archivo haría escribir observaciones contra un dibujo que ya no está, y el
   * documento nuevo puede traer otra cantidad y otros nombres.
   */
  const quitar = async () => {
    setConfirmarQuitar(false)
    setQuitando(true)
    setAviso(null)
    try {
      await limpiarArchivos(obra.id, COL.ordenEtmo)
      await guardarObservaciones(obra.id, '')
      ultimoGuardado.current = ''
      pendiente.current = null
      edito.current = false
      setAberturas([])
      setIndice(0)
      setGuardado('limpio')
      lectura.limpiar()
      await refrescar()
      setAviso({
        tono: 'ok',
        texto: 'Se quitó el documento y sus observaciones. Cargá el nuevo y volvé a generarlas.',
      })
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo quitar el documento.' })
      dispatch({ type: 'errorMonday', accion: 'quitar la Orden ETMO' })
    } finally {
      setQuitando(false)
    }
  }

  /* Se pregunta sólo si hay algo escrito que perder. Sacar un archivo recién subido, sin
     observaciones todavía, no necesita una ventana en el medio. */
  const pedirQuitar = () => {
    if (aberturas.some((a) => a.texto.trim())) setConfirmarQuitar(true)
    else void quitar()
  }

  /**
   * Lo que tiene que llegar al tablero y al escenario.
   *
   * Sin aberturas no hay nada que volcar DESDE ACÁ: `serializar([])` da vacío, y tomarlo como "lo
   * escrito" borraría el texto libre que alguien haya cargado a mano en la columna. Con aberturas
   * el vacío sí es una respuesta: significa que se borraron todas las observaciones.
   */
  const observacionesActuales = tieneAberturas ? texto : obra.observaciones

  /** Vuelca al tablero lo que haya escrito. Las aberturas vacías no se escriben. */
  const guardar = async (): Promise<boolean> => {
    if (!tieneAberturas) return true
    if (texto === ultimoGuardado.current) return true
    setGuardado('guardando')
    try {
      await guardarObservaciones(obra.id, texto)
      ultimoGuardado.current = texto
      pendiente.current = null
      edito.current = false
      setGuardado('guardado')
      await refrescar()
      return true
    } catch {
      setGuardado('error')
      dispatch({ type: 'errorMonday', accion: 'guardar las observaciones' })
      return false
    }
  }

  /**
   * Guarda lo escrito y le pide a la automatización la Orden de Producción final.
   *
   * Las observaciones se le pasan A MANO a `correr`. No alcanza con guardarlas antes: el `extra`
   * del hook se armó con la obra de ESTE render, que todavía tiene el texto anterior al guardado.
   * Sin esto el escenario recibía el campo vacío aunque en Monday ya estuviera escrito, y la orden
   * salía sin ninguna observación.
   */
  const generar = async () => {
    setConfirmarGenerar(null)
    if (!(await guardar())) return
    await generacion.correr(datosObservaciones(observacionesActuales))
  }

  /**
   * La orden nueva todavía no se mandó a nadie.
   *
   * Los estados de envío hablan de un documento que ya no existe: dejarlos en "Enviado" después de
   * regenerar hace que la etapa siguiente muestre como hecho algo que hay que volver a hacer, y
   * ése es el tipo de error que se descubre cuando el cliente reclama. Se vacían, que no es lo
   * mismo que ponerles "no enviado": vacío dice "acá todavía no pasó nada".
   */
  useEffect(() => {
    if (generacion.estado.fase !== 'listo') return
    void Promise.all([
      limpiarEstado(obra.id, COL.estadoEnvioOp).catch(() => {}),
      limpiarEstado(obra.id, COL.mjsEnviadoCliente).catch(() => {}),
    ])
  }, [generacion.estado.fase, obra.id])

  /* Generada la orden, se pasa solo al envío: es donde se ve el PDF que acaba de salir y donde
     está lo único que queda por hacer con él.

     Se RELEE la obra antes de saltar. El final de la corrida se detecta leyendo el tablero por
     afuera del estado global, así que la obra en memoria sigue sin el archivo: saltando derecho,
     el paso de envío se abre diciendo "todavía no hay una OP final adjunta" sobre una orden que
     acaba de generarse, y con el botón de enviar apagado. */
  useEffect(() => {
    if (generacion.estado.fase !== 'listo') return
    void (async () => {
      await refrescar().catch(() => {})
      dispatch({ type: 'goto', paso: 'envio' })
    })()
  }, [generacion.estado.fase, dispatch, refrescar])

  /**
   * Qué pasa al tocar "Generar la OP final".
   *
   * Siempre se pregunta antes, incluso con todo completo. No es un paso más del formulario: dispara
   * una automatización de un minuto que REEMPLAZA la orden que la obra tuviera. Y si quedaron
   * aberturas sin escribir se dice CUÁLES en la misma ventana, porque después de generar ya no
   * entran en el documento.
   *
   * Devuelve `false` siempre: al paso 3 se llega cuando la orden está hecha, no al apretar.
   */
  const alAvanzar = (): boolean => {
    setConfirmarGenerar(
      tieneAberturas ? sinCompletar(aberturas).map((a) => rotuloAbertura(a.nombre)) : [],
    )
    return false
  }

  /** Dispara el escenario que lee el documento y arma una caja por abertura. */
  const leerDocumento = async () => {
    setProponerLectura(false)
    setAviso(null)
    const leidas = await lectura.leer()
    if (!leidas) return
    /* Lo ya escrito manda: la lectura aporta la LISTA, no pisa observaciones hechas a mano. */
    edito.current = true
    setAberturas((previas) => fusionar(leidas, previas))
    setIndice(0)
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        titulo="Orden ETMO y observaciones"
        descripcion="Cargá el PDF original que genera ETMO y escribí las observaciones."
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid paso-grid--etmo">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-arrow-up" /> Orden Obtenida ETMO
          </div>

          <DropArchivo
            id="etmo"
            nombre={archivo?.name ?? ''}
            onArchivo={setArchivo}
            disabled={subiendo}
          />

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!archivo || subiendo}
              onClick={() => void cargar()}
            >
              {subiendo ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Cargando…
                </>
              ) : (
                <>
                  <i className="fas fa-file-import" /> Cargar y leer documento
                </>
              )}
            </button>
          </div>

          {tieneEtmo ? (
            <>
              <div className="panel-sep" />
              <ListaArchivos
                archivos={obra.ordenEtmo}
                quitando={quitando}
                onQuitar={pedirQuitar}
              />
              {/* La columna del tablero admite varios archivos, pero el escenario lee UNO. Con más
                  de uno, cuál se lee deja de ser evidente. */}
              {obra.ordenEtmo.length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <Aviso tono="warn">
                    Hay {obra.ordenEtmo.length} documentos adjuntos y la automatización lee uno
                    solo. Quitalos y dejá únicamente el que corresponde.
                  </Aviso>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="panel-sep" />
              <Aviso tono="warn">Sin Orden ETMO adjunta no se puede generar la OP final.</Aviso>
            </>
          )}

          {aviso && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>
            </div>
          )}
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-pen-to-square" /> Observaciones por aberturas
          </div>

          {tieneAberturas ? (
            <ObservacionesAberturas
              aberturas={aberturas}
              indice={indice}
              onIndice={setIndice}
              disabled={lectura.leyendo}
              onTexto={(i, valor) =>
                setAberturas((prev) => {
                  edito.current = true
                  return prev.map((a, n) => (n === i ? { ...a, texto: valor } : a))
                })
              }
            />
          ) : (
            /* Sin leer el documento no se sabe qué aberturas tiene, así que no hay dónde escribir.
               El vacío lo dice y ofrece la única acción que lo destraba. */
            <div className="obs-vacio">
              <i className="fas fa-wand-magic-sparkles" />
              <p>
                {tieneEtmo
                  ? 'Generá las observaciones y se arma una caja por cada abertura.'
                  : 'Primero cargá la Orden ETMO: las aberturas salen del documento.'}
              </p>
            </div>
          )}

          <div className="obs-pie">
            {/* Las observaciones se generan solas al cargar el ETMO. El botón queda sólo para el
                caso en que el documento está cargado y todavía no se generaron (se dijo que no al
                cargarlo, o la lectura falló). Sin documento no hay nada que leer, y con las cajas
                ya armadas su trabajo está hecho: en los dos casos no se muestra. */}
            {tieneEtmo && !tieneAberturas && (
              <button
                type="button"
                className="btn btn-out btn--sm"
                disabled={!!falta || lectura.leyendo}
                title={falta || undefined}
                onClick={() => void leerDocumento()}
              >
                {lectura.leyendo ? (
                  <>
                    <i className="fas fa-circle-notch spin" /> Leyendo el documento…
                  </>
                ) : (
                  <>
                    <i className="fas fa-wand-magic-sparkles" /> Generar observaciones
                  </>
                )}
              </button>
            )}

            {/* Que se guarda solo hay que decirlo: sin botón, el silencio se lee como "no se
                guardó". */}
            {tieneAberturas && guardado !== 'limpio' && (
              <span
                className={`obs-estado ${guardado === 'error' ? 'obs-estado--pend' : 'obs-estado--ok'}`}
              >
                {guardado === 'guardando' && (
                  <>
                    <i className="fas fa-circle-notch spin" /> Guardando…
                  </>
                )}
                {guardado === 'guardado' && (
                  <>
                    <i className="fas fa-circle-check" /> Guardado en la obra
                  </>
                )}
                {guardado === 'error' && (
                  <>
                    <i className="fas fa-triangle-exclamation" /> No se pudo guardar
                  </>
                )}
              </span>
            )}
          </div>

          {textoViejo && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="warn">
                La obra ya tiene esto escrito, sin el formato por abertura:{' '}
                <strong>{textoViejo.length > 120 ? `${textoViejo.slice(0, 120)}…` : textoViejo}</strong>
                . Si generás las observaciones, se reemplaza.
              </Aviso>
            </div>
          )}

          {falta && tieneEtmo && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="warn">{falta} El escenario los necesita para poder leer el documento.</Aviso>
            </div>
          )}

          {lectura.estado.fase === 'error' && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="err">{lectura.estado.problema}</Aviso>
            </div>
          )}

          {/* Oculto por ahora: se muestra cuando exista el tablero donde se van a guardar. */}
          {MOSTRAR_MEDICION && (
            <DatosMedicion valor={medicion} onCambio={setMedicion} disabled={lectura.leyendo} />
          )}
        </div>
      </div>

      <PasoNav
        siguiente="Generar la OP final"
        onSiguiente={alAvanzar}
        bloqueado={!tieneEtmo}
        nota={
          tieneEtmo ? undefined : 'Cargá la Orden ETMO para poder pedir la generación de la OP final.'
        }
      />

      {subiendo && (
        <ModalCargando
          titulo="Cargando la Orden ETMO"
          detalle="Subiendo el archivo a la columna de la obra…"
        />
      )}

      {lectura.leyendo && (
        <ModalCargando
          titulo="Leyendo el documento"
          detalle="Buscando las aberturas del ETMO…"
        />
      )}

      {/* El doble chequeo antes de generar. Lo primero que se lee es QUÉ va a pasar —en negro y
          grande, porque es lo que hay que decidir—, y recién debajo lo que falta, si falta algo. */}
      {confirmarGenerar && (
        <Modal
          title={yaTieneOp ? 'Ya cuenta con OP generadas' : 'Se generará la OP Final'}
          icon={
            yaTieneOp ? (
              <i className="fas fa-triangle-exclamation modal-icon--warn" />
            ) : (
              <i className="fas fa-file-circle-check modal-icon--info" />
            )
          }
          onClose={() => setConfirmarGenerar(null)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => setConfirmarGenerar(null)}
              >
                {yaTieneOp ? 'No generar' : 'Volver'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void generar()}>
                <i className="fas fa-wand-magic-sparkles" />{' '}
                {yaTieneOp ? 'Generar una nueva' : 'Generar la OP final'}
              </button>
            </>
          }
        >
          <p className="modal-clave">
            {/* NO dice "se reemplaza" ni "en lugar de". Una obra puede hacerse por etapas y
                tener varias órdenes: la nueva se SUMA en «OP Final» junto a las que ya hay. */}
            {yaTieneOp
              ? '¿Desea generar una nueva? Queda adjunta en «OP Final» con las que ya tiene generadas.'
              : 'Se genera el documento final de esta obra.'}
          </p>
          {confirmarGenerar.length > 0 && (
            <p className="modal-nota">
              {confirmarGenerar.length === aberturas.length
                ? `No escribiste ninguna de las ${aberturas.length} aberturas: la orden sale sin observaciones.`
                : `Quedan sin escribir ${confirmarGenerar.join(', ')}. No entran en el documento.`}
            </p>
          )}
        </Modal>
      )}

      {generacion.enCurso && (
        <ModalCargando
          titulo="Generando la Orden de Producción final"
          detalle="La automatización está armando el documento…"
        />
      )}

      {generacion.estado.fase === 'error' && (
        <div className="paso-aviso-flot">
          <Aviso tono="err">
            No se pudo generar la Orden de Producción final. Revisá el update que dejó la
            automatización en la obra y volvé a intentar.
          </Aviso>
        </div>
      )}

      {confirmarQuitar && (
        <Modal
          title="¿Quitar el documento?"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setConfirmarQuitar(false)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setConfirmarQuitar(false)}>
                Volver
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void quitar()}>
                Quitar igual
              </button>
            </>
          }
        >
          Se borran también las <strong>observaciones cargadas</strong>: son las de este documento.
          El que cargues después puede traer otras aberturas.
        </Modal>
      )}

      {proponerLectura && (
        <Modal
          title="¿Generar las observaciones?"
          icon={<i className="fas fa-wand-magic-sparkles modal-icon--info" />}
          onClose={() => setProponerLectura(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => setProponerLectura(false)}
              >
                No generar observaciones
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void leerDocumento()}
              >
                <i className="fas fa-wand-magic-sparkles" /> Generar observaciones
              </button>
            </>
          }
        />
      )}
    </section>
  )
}
