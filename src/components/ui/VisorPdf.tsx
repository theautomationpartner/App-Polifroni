import { useEffect, useRef, useState } from 'react'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
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

/** Ancho al que se dibuja cada página. El alto sale de la proporción del PDF. */
const ANCHO = 900

/**
 * Visor del documento.
 *
 * Dibuja el PDF con pdf.js sobre un canvas, en vez de embeberlo en un `<iframe>`. La diferencia
 * importa: la app corre DENTRO del iframe de Monday, y ahí el visor de PDF del navegador no está
 * disponible —lo que se veía era el ícono de documento roto—. Un canvas se dibuja igual en
 * cualquier contexto, sandbox incluido.
 *
 * La dirección se pide EN EL MOMENTO: la URL que firma Monday vence en una hora, así que guardarla
 * en el estado de la obra sólo serviría para que el visor deje de andar a mitad de la jornada.
 */
export function VisorPdf({ archivo, vacio, trabajando = null }: VisorPdfProps) {
  const hojas = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [paginas, setPaginas] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!archivo) {
      setUrl(null)
      setPaginas(0)
      setError(null)
      return
    }

    let vivo = true
    setCargando(true)
    setError(null)
    setPaginas(0)

    void (async () => {
      try {
        const direccion = await getUrlArchivo(archivo.assetId)
        if (!vivo) return
        setUrl(direccion)

        /* pdf.js se carga recién cuando hay algo que mostrar: son ~300 KB que no tienen por qué
           viajar en el arranque de una pantalla que quizá no abra ningún documento. */
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const doc = await pdfjs.getDocument({ url: direccion }).promise
        if (!vivo) return
        setPaginas(doc.numPages)

        const contenedor = hojas.current
        if (!contenedor) return
        contenedor.replaceChildren()

        /* Se dibuja al doble de resolución y se muestra al ancho pedido: en pantallas normales se
           ve nítido, y el PDF de una orden de producción es todo texto chico y medidas. */
        const escala = Math.min(2, window.devicePixelRatio || 1) * 1.5

        for (let n = 1; n <= doc.numPages; n++) {
          const pagina = await doc.getPage(n)
          if (!vivo) return
          const base = pagina.getViewport({ scale: 1 })
          const viewport = pagina.getViewport({ scale: (ANCHO / base.width) * escala })

          const canvas = document.createElement('canvas')
          canvas.className = 'pdf-hoja'
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${ANCHO}px`
          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          contenedor.appendChild(canvas)
          await pagina.render({ canvas, canvasContext: ctx, viewport }).promise
        }
      } catch (e) {
        if (!vivo) return
        /* Un asset que ya no existe (el archivo se reemplazó en el tablero) da este mismo camino:
           el mensaje invita a refrescar, que es lo que lo resuelve. */
        setError(
          e instanceof Error && /no devolvió la dirección/i.test(e.message)
            ? 'El archivo ya no está en el tablero (lo habrán reemplazado). Refrescá la obra.'
            : 'No se pudo mostrar el documento. Probá abrirlo en otra pestaña.',
        )
      } finally {
        if (vivo) setCargando(false)
      }
    })()

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
        <span className="pdftool-der">
          {paginas > 0 && (
            <span className="pdftool-pags">
              {paginas} {paginas === 1 ? 'página' : 'páginas'}
            </span>
          )}
          {url && (
            <a className="pdf-open" href={url} target="_blank" rel="noreferrer">
              Abrir en otra pestaña <i className="fas fa-arrow-up-right-from-square" />
            </a>
          )}
        </span>
      </div>

      {/* Las hojas dibujadas. Se mantiene montado aunque esté vacío: es el destino de los canvas. */}
      <div className="pdfscroll" ref={hojas} hidden={paginas === 0} />

      {paginas === 0 && (
        <div className="pdf-empty">
          <i className={`fas ${error ? 'fa-triangle-exclamation' : 'fa-file-circle-plus'}`} />
          <p>{error ?? (cargando ? 'Abriendo el documento…' : vacio)}</p>
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
