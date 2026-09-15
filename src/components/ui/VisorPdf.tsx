import { useEffect, useState } from 'react'
import { getUrlArchivo } from '@/services/monday'
import type { ArchivoObra } from '@/types'

interface VisorPdfProps {
  /** Archivo del tablero a mostrar. `null` deja el visor vacío con su mensaje. */
  archivo: ArchivoObra | null
  /** Qué decir cuando no hay archivo todavía. */
  vacio: string
  /** Mensaje del velo: hay un proceso en curso sobre este documento. */
  trabajando?: string | null
}

/**
 * Visor del documento, calcado del de la emisión de La Batea: barra oscura con el nombre y el
 * enlace para abrirlo aparte, y el PDF embebido debajo.
 *
 * La dirección se pide EN EL MOMENTO: la URL que firma Monday vence en una hora, así que guardarla
 * en el estado de la obra sólo serviría para que el visor deje de andar a mitad de la jornada.
 */
export function VisorPdf({ archivo, vacio, trabajando = null }: VisorPdfProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!archivo) {
      setUrl(null)
      return
    }
    let vivo = true
    setCargando(true)
    setError(false)
    getUrlArchivo(archivo.assetId)
      .then((u) => {
        if (vivo) setUrl(u)
      })
      .catch(() => {
        if (vivo) setError(true)
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [archivo])

  return (
    <div className="pdfv">
      <div className="pdftool">
        <span className="pdftool-n">
          <i className="fas fa-file-pdf" /> {archivo ? archivo.nombre : 'Sin documento'}
        </span>
        {url && (
          <a className="pdf-open" href={url} target="_blank" rel="noreferrer">
            Abrir en otra pestaña <i className="fas fa-arrow-up-right-from-square" />
          </a>
        )}
      </div>

      {url && !error ? (
        /* `#toolbar=0` saca la barra del visor del navegador: el documento se lee sin dos barras
           encimadas, y la que queda es la nuestra. */
        <iframe className="pdfframe" src={`${url}#toolbar=0`} title={archivo?.nombre ?? 'Documento'} />
      ) : (
        <div className="pdf-empty">
          <i className={`fas ${error ? 'fa-triangle-exclamation' : 'fa-file-circle-plus'}`} />
          <p>
            {error
              ? 'No se pudo abrir el documento desde Monday. Probá recargar la obra.'
              : cargando
                ? 'Abriendo el documento…'
                : vacio}
          </p>
        </div>
      )}

      {trabajando && (
        <div className="pdf-overlay">
          <i className="fas fa-circle-notch spin pdf-overlay-icon" />
          <span className="pdf-overlay-msg">{trabajando}</span>
        </div>
      )}
    </div>
  )
}
