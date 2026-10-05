import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { MODOS_PRESUPUESTO, type ModoPresupuesto } from '@/lib/presupuesto'
import { useApp, useDispatch } from '@/state/hooks'
import { presupuestoEnCurso } from './borrador'

/**
 * "¿Qué querés hacer?" — la pregunta que abre "Crear y Cargar Presupuestos": crear un presupuesto
 * nuevo (una bolsa nueva para un cliente o constructor) o cargar otro en uno que ya está abierto.
 *
 * Es la misma caja de "¿A quién vas a enviarle la orden?" (`DestinoSelect`). Con algo ya elegido,
 * cambiar la respuesta empieza de nuevo: se pregunta antes.
 */
export function ModoSelect({ falta = false }: { falta?: boolean }) {
  const { presupuesto, accionEnCurso } = useApp()
  const dispatch = useDispatch()
  const [pendiente, setPendiente] = useState<ModoPresupuesto | null>(null)

  const elegir = (m: ModoPresupuesto) => {
    if (m === presupuesto.modo) return
    if (presupuestoEnCurso(presupuesto)) setPendiente(m)
    else dispatch({ type: 'setModoPresupuesto', modo: m })
  }

  return (
    <div className="accion-cfg destino-cfg">
      <div className={`cfgbox ${falta ? 'cfgbox--falta' : ''}`}>
        <div className="cfg-ic">
          <i className={`fas ${presupuesto.modo === 'cargar' ? 'fa-folder-plus' : 'fa-file-circle-plus'}`} />
        </div>
        <div className="cfg-c">
          <div className="cfg-l">¿Qué querés hacer?</div>
          <select
            className="cfg-sel"
            aria-label="¿Qué querés hacer?"
            aria-invalid={falta || undefined}
            value={presupuesto.modo ?? ''}
            disabled={!!accionEnCurso}
            onChange={(e) => elegir(e.target.value as ModoPresupuesto)}
          >
            <option value="" disabled hidden>
              Seleccionar...
            </option>
            {MODOS_PRESUPUESTO.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pendiente && (
        <Modal
          title="¿Cambiar lo que vas a hacer?"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setPendiente(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setPendiente(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const m = pendiente
                  setPendiente(null)
                  dispatch({ type: 'setModoPresupuesto', modo: m })
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Se empieza de nuevo: lo elegido y el PDF cargado se descartan. Lo que ya se guardó en el tablero
          queda como está.
        </Modal>
      )}
    </div>
  )
}
