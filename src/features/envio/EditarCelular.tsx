import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { celularValido, formatoMonday, normalizarCelular, type Rol } from '@/lib/destinatario'
import { actualizarCelular } from '@/services/monday'
import type { Obra } from '@/types'

/** Cuánto queda a la vista el "Confirmado" antes de cerrar la ventana. */
const MOSTRAR_OK_MS = 1200

/**
 * Corregir el celular de un destinatario sin salir del envío.
 *
 * Muestra el número cargado y deja cambiarlo. Sólo si se cambió, "Confirmar" lo escribe en el ítem
 * de la persona —el cliente en el tablero de clientes, el constructor en el de constructores (ver
 * `actualizarCelular`)— y la app sigue con el número nuevo (`onActualizado`). Sin cambios, confirmar
 * sólo cierra: no se escribe nada.
 */
export function EditarCelular({
  obra,
  rol,
  nombre,
  actual,
  onCerrar,
  onActualizado,
}: {
  obra: Obra
  rol: Rol
  nombre: string
  /** El celular de hoy, en dígitos. */
  actual: string
  onCerrar: () => void
  onActualizado: (celular: string) => void
}) {
  const [texto, setTexto] = useState(actual ? formatoMonday(actual) : '')
  const [fase, setFase] = useState<'editando' | 'confirmando' | 'confirmado'>('editando')
  const [error, setError] = useState('')
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (cierre.current) clearTimeout(cierre.current)
  }, [])

  const nuevo = normalizarCelular(texto)
  const cambio = nuevo !== normalizarCelular(actual)
  const ocupado = fase !== 'editando'

  const confirmar = async () => {
    if (ocupado) return
    if (!cambio) {
      onCerrar()
      return
    }
    if (!celularValido(nuevo)) {
      setError('El celular no es válido. Escribí la característica y el número, sin el 0 ni el 15 (ej.: 249 436-9123).')
      return
    }
    setError('')
    setFase('confirmando')
    try {
      await actualizarCelular(obra, rol, nuevo)
      setFase('confirmado')
      onActualizado(nuevo)
      cierre.current = setTimeout(onCerrar, MOSTRAR_OK_MS)
    } catch (e) {
      console.warn('[celular] no se pudo actualizar', e)
      setFase('editando')
      setError(
        'Monday no respondió al intentar actualizar el celular. Reintentá en unos segundos; si la falla persiste, contactate con el soporte de TAP.',
      )
    }
  }

  return (
    <Modal
      title={`Editar celular del ${rol === 'Cliente' ? 'cliente' : 'constructor'}`}
      icon={<i className="fab fa-whatsapp modal-icon--info" />}
      onClose={onCerrar}
      cerrable={!ocupado}
      actions={
        <>
          <button type="button" className="btn btn-out" disabled={ocupado} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn btn-primary btn-marca btn-celular ${fase === 'confirmado' ? 'btn-celular--ok' : ''}`}
            disabled={ocupado}
            aria-busy={fase === 'confirmando'}
            onClick={() => void confirmar()}
          >
            {fase === 'confirmando' ? (
              <>
                <i className="fas fa-circle-notch spin" /> Confirmando...
              </>
            ) : fase === 'confirmado' ? (
              <>
                <i className="fas fa-check" /> Confirmado
              </>
            ) : (
              'Confirmar'
            )}
          </button>
        </>
      }
    >
      <p className="modal-clave">{nombre || rol}</p>
      <p className="modal-nota">
        El número se actualiza en Monday, en la ficha del {rol === 'Cliente' ? 'cliente' : 'constructor'}, y la orden
        se envía a ese número.
      </p>
      <label className="campo-l" htmlFor="celular-nuevo">
        Cel-WhatsApp
      </label>
      <input
        id="celular-nuevo"
        className={`celular-in ${error ? 'celular-in--error' : ''}`}
        type="tel"
        inputMode="tel"
        autoFocus
        disabled={ocupado}
        value={texto}
        placeholder="Ej.: +54 9 249 436 9123"
        onChange={(e) => {
          setTexto(e.target.value)
          if (error) setError('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void confirmar()
          }
        }}
      />
      {error && (
        <p className="celular-error" role="alert">
          <i className="fas fa-circle-exclamation" /> {error}
        </p>
      )}
    </Modal>
  )
}
