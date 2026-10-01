import type { ReactNode } from 'react'
import { PASOS, indiceDe } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'

/**
 * Pie de cada etapa (el `footer-acts` de La Batea): "Volver" a la etapa anterior a la izquierda y la
 * acción de la etapa a la derecha —"Continuar", o "Finalizar Operación" en la última—.
 *
 * Mientras hay algo corriendo no se vuelve: salir a mitad de un envío deja la orden sin terminar
 * de escribir.
 */
export function PieEtapa({ children }: { children?: ReactNode }) {
  const { paso, accionEnCurso } = useApp()
  const dispatch = useDispatch()
  const anterior = PASOS[indiceDe(paso) - 1]

  return (
    <div className="footer-acts">
      <button
        type="button"
        className="btn-volver"
        disabled={!anterior || !!accionEnCurso}
        title={accionEnCurso ?? undefined}
        onClick={() => anterior && dispatch({ type: 'goto', paso: anterior })}
      >
        <i className="fas fa-arrow-left" /> Volver
      </button>
      {children}
    </div>
  )
}
