import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { DropArchivo } from '@/components/ui/DropArchivo'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { COL, getUrlArchivo, guardarObservaciones, subirArchivo } from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { ArchivoObra } from '@/types'

/** Archivos ya adjuntos en la columna, con el enlace para abrirlos (la URL se pide al tocar). */
function ListaArchivos({ archivos }: { archivos: ArchivoObra[] }) {
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
        </div>
      ))}
    </div>
  )
}

/**
 * Paso 2 · Ingesta de la Orden ETMO y observaciones de producción.
 *
 * Son las dos entradas del escenario que arma la OP final: el PDF que genera el sistema de diseño
 * y las observaciones por ítem. Las dos viven en el tablero —columnas `✋Orden de Prod HETMO` y
 * `Observaciones OP`— y por eso se escriben acá, no en un borrador local: el escenario las lee de
 * ahí cuando se le pide leer el documento.
 */
export function EtmoView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()

  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [observaciones, setObservaciones] = useState(obra.observaciones)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'err'; texto: string } | null>(null)

  /* Si la obra se relee (por ejemplo al volver de otra etapa), el campo toma lo que quedó en el
     tablero. Mientras se está escribiendo no pasa: el efecto sólo mira el valor del tablero. */
  useEffect(() => {
    setObservaciones(obra.observaciones)
  }, [obra.observaciones])

  const sinGuardar = observaciones !== obra.observaciones
  const tieneEtmo = obra.ordenEtmo.length > 0
  /* El visor muestra el ETMO que ya está en la obra; las imágenes no se embeben. */
  const etmoPdf = obra.ordenEtmo.find((a) => !a.esImagen) ?? null

  const adjuntar = async () => {
    if (!archivo) return
    setSubiendo(true)
    setAviso(null)
    try {
      await subirArchivo(obra.id, COL.ordenEtmo, archivo)
      await refrescar()
      setArchivo(null)
      setAviso({ tono: 'ok', texto: 'La Orden ETMO quedó adjunta en la obra.' })
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo adjuntar el archivo en Monday.' })
      dispatch({ type: 'errorMonday', accion: 'adjuntar la Orden ETMO' })
    } finally {
      setSubiendo(false)
    }
  }

  const guardar = async () => {
    setGuardando(true)
    setAviso(null)
    try {
      await guardarObservaciones(obra.id, observaciones)
      await refrescar()
      setAviso({ tono: 'ok', texto: 'Observaciones guardadas en la obra.' })
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudieron guardar las observaciones.' })
      dispatch({ type: 'errorMonday', accion: 'guardar las observaciones' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={2}
        titulo="Orden ETMO y observaciones"
        descripcion={
          <>
            Cargá el PDF original que genera ETMO y escribí las observaciones por ítem. Son los dos
            datos con los que después se arma la Orden de Producción final.
          </>
        }
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-arrow-up" /> Orden de producción ETMO
          </div>
          <p className="panel-d">
            El archivo se adjunta a la columna <strong>✋Orden de Prod HETMO</strong> del tablero,
            que es de donde lo lee la automatización.
          </p>

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
              onClick={() => void adjuntar()}
            >
              {subiendo ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Adjuntando…
                </>
              ) : (
                <>
                  <i className="fas fa-paperclip" /> Adjuntar a la obra
                </>
              )}
            </button>
          </div>

          {tieneEtmo ? (
            <>
              <div className="panel-sep" />
              <span className="campo-l">
                Ya adjunto en la obra
                <span className="campo-col">{COL.ordenEtmo}</span>
              </span>
              <ListaArchivos archivos={obra.ordenEtmo} />
            </>
          ) : (
            <>
              <div className="panel-sep" />
              <Aviso tono="warn">
                Todavía no hay ninguna Orden ETMO adjunta. Sin ella no se puede generar la OP final.
              </Aviso>
            </>
          )}
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-pen-to-square" /> Observaciones por ítem
          </div>
          <p className="panel-d">
            Se vuelcan tal cual en la Orden de Producción final. Escribí una observación por
            renglón, indicando a qué ítem corresponde.
          </p>

          <label className="campo-l" htmlFor="observaciones">
            Observaciones OP
            <span className="campo-col">{COL.observaciones}</span>
          </label>
          <textarea
            id="observaciones"
            className="obs-area"
            value={observaciones}
            placeholder={'Ítem 1: ...\nÍtem 2: ...'}
            onChange={(e) => setObservaciones(e.target.value)}
          />

          <div className="obs-pie">
            <span className={`obs-estado ${sinGuardar ? 'obs-estado--pend' : 'obs-estado--ok'}`}>
              <i className={`fas ${sinGuardar ? 'fa-circle-dot' : 'fa-circle-check'}`} />
              {sinGuardar ? 'Hay cambios sin guardar' : 'Coincide con el tablero'}
            </span>
            <button
              type="button"
              className="btn btn-primary btn--sm"
              disabled={!sinGuardar || guardando}
              onClick={() => void guardar()}
            >
              {guardando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Guardando…
                </>
              ) : (
                <>
                  <i className="fas fa-floppy-disk" /> Guardar observaciones
                </>
              )}
            </button>
          </div>

          {aviso && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="panel-t">
          <i className="fas fa-file-pdf" /> Documento cargado
        </div>
        <p className="panel-d">
          El mismo PDF que va a leer la automatización. Revisalo antes de generar la orden final.
        </p>
        <VisorPdf
          archivo={etmoPdf}
          vacio={
            tieneEtmo
              ? 'El adjunto de la obra es una imagen: se puede abrir desde la lista, pero no se muestra acá.'
              : 'Todavía no hay ninguna Orden ETMO adjunta a esta obra.'
          }
        />
      </div>

      <PasoNav
        siguiente="Generar la OP final"
        bloqueado={!tieneEtmo}
        nota={
          !tieneEtmo
            ? 'Adjuntá la Orden ETMO para poder pedir la generación de la OP final.'
            : sinGuardar
              ? 'Tenés observaciones sin guardar: se generan con lo que esté en el tablero.'
              : undefined
        }
      />

      {subiendo && (
        <ModalCargando
          titulo="Adjuntando la Orden ETMO"
          detalle="Subiendo el archivo a la columna de la obra…"
        />
      )}
    </section>
  )
}
