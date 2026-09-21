import { useEffect, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { DropArchivo } from '@/components/ui/DropArchivo'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import {
  COL,
  getUrlArchivo,
  guardarObservaciones,
  limpiarArchivos,
  subirArchivo,
} from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { ArchivoObra } from '@/types'
import { ObservacionesAberturas } from './ObservacionesAberturas'
import { fusionar, parsear, serializar, type Abertura } from './observaciones'
import { useLeerObservaciones } from './useLeerObservaciones'

/** Los segundos como "1:05", que es como se lee una espera. */
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'err'; texto: string } | null>(null)
  /** Se abre al cargar el documento: leerlo es una corrida, se pregunta antes de gastarla. */
  const [proponerLectura, setProponerLectura] = useState(false)

  /* Las aberturas salen del propio campo del tablero, que ya guarda una línea por modelo. Así, al
     volver a esta etapa, la lista está sin tener que releer el documento. */
  const [aberturas, setAberturas] = useState<Abertura[]>(() => parsear(obra.observaciones))
  const [indice, setIndice] = useState(0)

  /** Lo último que quedó escrito en el tablero. Es lo que separa "lo mío" de "lo de afuera". */
  const ultimoGuardado = useRef(obra.observaciones)

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

  /* Se guarda solo. No hay botón: guardar no es una decisión —nadie escribe una observación para
     descartarla— y un botón de guardar sólo sirve para olvidarse de apretarlo. Se espera a que la
     escritura se frene para no mandar una consulta por tecla. */
  useEffect(() => {
    if (!tieneAberturas || texto === ultimoGuardado.current) return
    const t = setTimeout(() => {
      void (async () => {
        setGuardado('guardando')
        try {
          await guardarObservaciones(obra.id, texto)
          ultimoGuardado.current = texto
          setGuardado('guardado')
          await refrescar()
        } catch {
          setGuardado('error')
          dispatch({ type: 'errorMonday', accion: 'guardar las observaciones' })
        }
      })()
    }, 900)
    return () => clearTimeout(t)
  }, [texto, tieneAberturas, obra.id, dispatch, refrescar])

  /** Sube el documento a la obra y, con él arriba, ofrece leerlo. */
  const cargar = async () => {
    if (!archivo) return
    setSubiendo(true)
    setAviso(null)
    try {
      await subirArchivo(obra.id, COL.ordenEtmo, archivo)
      await refrescar()
      setArchivo(null)
      setProponerLectura(true)
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo adjuntar el archivo en Monday.' })
      dispatch({ type: 'errorMonday', accion: 'adjuntar la Orden ETMO' })
    } finally {
      setSubiendo(false)
    }
  }

  const quitar = async () => {
    setQuitando(true)
    setAviso(null)
    try {
      await limpiarArchivos(obra.id, COL.ordenEtmo)
      await refrescar()
      setAviso({ tono: 'ok', texto: 'Se quitó el documento de la obra.' })
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo quitar el documento.' })
      dispatch({ type: 'errorMonday', accion: 'quitar la Orden ETMO' })
    } finally {
      setQuitando(false)
    }
  }

  /** Dispara el escenario que lee el documento y arma una caja por abertura. */
  const leerDocumento = async () => {
    setProponerLectura(false)
    setAviso(null)
    const leidas = await lectura.leer()
    if (!leidas) return
    /* Lo ya escrito manda: la lectura aporta la LISTA, no pisa observaciones hechas a mano. */
    setAberturas((previas) => fusionar(leidas, previas))
    setIndice(0)
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={2}
        titulo="Orden ETMO y observaciones"
        descripcion="Cargá el PDF original que genera ETMO y escribí las observaciones."
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
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
                onQuitar={() => void quitar()}
              />
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
                setAberturas((prev) => prev.map((a, n) => (n === i ? { ...a, texto: valor } : a)))
              }
            />
          ) : (
            /* Sin leer el documento no se sabe qué aberturas tiene, así que no hay dónde escribir.
               El vacío lo dice y ofrece la única acción que lo destraba. */
            <div className="obs-vacio">
              <i className="fas fa-wand-magic-sparkles" />
              <p>
                {tieneEtmo
                  ? 'Leé el documento y se arma una caja por cada abertura.'
                  : 'Primero cargá la Orden ETMO: las aberturas salen del documento.'}
              </p>
            </div>
          )}

          <div className="obs-pie">
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={!tieneEtmo || lectura.leyendo}
              title={tieneEtmo ? undefined : 'Primero cargá la Orden ETMO.'}
              onClick={() => void leerDocumento()}
            >
              {lectura.leyendo ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Leyendo… {reloj(lectura.estado.segundos)}
                </>
              ) : (
                <>
                  <i className="fas fa-wand-magic-sparkles" />{' '}
                  {tieneAberturas ? 'Volver a leer' : 'Leer documento'}
                </>
              )}
            </button>

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

          {lectura.estado.fase === 'error' && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="err">{lectura.estado.problema}</Aviso>
            </div>
          )}
        </div>
      </div>

      <PasoNav
        siguiente="Generar la OP final"
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
          detalle={`Buscando las aberturas del ETMO… ${reloj(lectura.estado.segundos)}`}
        />
      )}

      {proponerLectura && (
        <Modal
          title="¿Agregar observaciones?"
          icon={<i className="fas fa-wand-magic-sparkles modal-icon--info" />}
          onClose={() => setProponerLectura(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => setProponerLectura(false)}
              >
                Ahora no
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void leerDocumento()}
              >
                <i className="fas fa-wand-magic-sparkles" /> Leer documento
              </button>
            </>
          }
        >
          El documento ya está en la obra. Si lo leemos, te dejamos una caja por abertura para
          escribir las observaciones. Podés hacerlo más tarde.
        </Modal>
      )}
    </section>
  )
}
