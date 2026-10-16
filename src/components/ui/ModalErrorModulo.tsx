import { useEffect, useRef, useState } from 'react'
import { MOTIVO_GENERAR_OP } from '@/lib/recuperacion'
import { useApp } from '@/state/hooks'
import { Modal } from './Modal'

/** El pedido explícito de mostrar el aviso (ver `abrirModalErrorModulo`). */
const EVENTO_ABRIR = 'polifroni:errorModulo'

/**
 * Muestra el aviso a pedido. Lo usa la generación de la OP final cuando NO puede recuperar la
 * operación sola: ya recargó hace instantes (el módulo sigue sin bajar) o no pudo guardar lo cargado.
 */
export function abrirModalErrorModulo() {
  window.dispatchEvent(new Event(EVENTO_ABRIR))
}

/**
 * Recarga la página de Monday, que es donde vive la app. Desde el iframe no siempre se puede tocar
 * la ventana de arriba (otro origen): si el navegador lo impide, se recarga la propia app, que
 * baja igual el índice y los módulos de la versión vigente.
 */
function recargarMonday() {
  try {
    window.top?.location.reload()
  } catch {
    window.location.reload()
  }
}

/**
 * Avisa que no se pudo descargar un módulo de la app (hoy, el generador de PDFs).
 *
 * Pasa cuando la pestaña quedó abierta con una versión vieja y se publicó una nueva: el navegador
 * pide un archivo con un nombre que el servidor ya no tiene. Vite lo anuncia con `vite:preloadError`.
 * NO se frena el evento: el error sigue su camino y la pantalla que lo disparó muestra también el suyo.
 *
 * Durante la generación de la OP final el evento se ignora: esa pantalla guarda lo cargado, recarga
 * la app y retoma sola (ver `lib/recuperacion`). Si no puede, pide este aviso con `abrirModalErrorModulo`.
 */
export function ModalErrorModulo() {
  const [abierto, setAbierto] = useState(false)
  const { accionEnCurso } = useApp()
  const accionRef = useRef(accionEnCurso)
  accionRef.current = accionEnCurso

  useEffect(() => {
    const alFallar = () => {
      if (accionRef.current !== MOTIVO_GENERAR_OP) setAbierto(true)
    }
    const alPedir = () => setAbierto(true)
    window.addEventListener('vite:preloadError', alFallar)
    window.addEventListener(EVENTO_ABRIR, alPedir)
    return () => {
      window.removeEventListener('vite:preloadError', alFallar)
      window.removeEventListener(EVENTO_ABRIR, alPedir)
    }
  }, [])

  if (!abierto) return null

  return (
    <Modal
      title="Error al cargar el módulo generador de PDFs"
      icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
      onClose={() => setAbierto(false)}
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={recargarMonday}>
            Reintentar
          </button>
          <button type="button" className="btn btn-secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </>
      }
    >
      <p>
        Ocurrió un error al intentar importar el módulo generador de PDFs para generar la OP final en
        el sistema. Es necesario que clickees en el botón Reintentar para refrescar la página de
        Monday y volver a reintentar la carga y envío de la orden de producción.
      </p>
      <p className="modal-advertencia">
        <i className="fas fa-triangle-exclamation" /> Al clickear el botón de Reintentar se perderán
        todos los datos cargados durante la operación.
      </p>
    </Modal>
  )
}
