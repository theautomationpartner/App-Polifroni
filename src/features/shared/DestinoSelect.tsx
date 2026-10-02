import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { DESTINOS } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Destino } from '@/types'

/**
 * "¿A quién vas a enviarle la orden?" — la pregunta que abre "Cargar y Enviar Órdenes de Producción".
 *
 * Es la misma caja de configuración de La Batea (ícono en pastilla, la pregunta arriba y el
 * selector debajo). La respuesta decide el recorrido: al cliente o constructor se le CARGA una OP
 * nueva para que la confirme; al taller se le manda una que ya está confirmada.
 *
 * Con una obra ya elegida, cambiar la respuesta empieza de nuevo: se pregunta antes.
 */
export function DestinoSelect({ falta = false }: { falta?: boolean }) {
  const { destino, obra, accionEnCurso } = useApp()
  const dispatch = useDispatch()
  const [pendiente, setPendiente] = useState<Destino | null>(null)

  const elegir = (d: Destino) => {
    if (d === destino) return
    if (obra) setPendiente(d)
    else dispatch({ type: 'setDestino', destino: d })
  }

  return (
    <div className="accion-cfg destino-cfg">
      {/* `falta`: se intentó seguir sin contestar. El borde rojo dice DÓNDE está lo que falta; la
          ventana, qué es. */}
      <div className={`cfgbox ${falta ? 'cfgbox--falta' : ''}`}>
        <div className="cfg-ic">
          <i className="fas fa-paper-plane" />
        </div>
        <div className="cfg-c">
          <div className="cfg-l">¿A quién vas a enviarle la orden?</div>
          <select
            className="cfg-sel"
            aria-label="¿A quién vas a enviarle la orden?"
            aria-invalid={falta || undefined}
            value={destino ?? ''}
            disabled={!!accionEnCurso}
            onChange={(e) => elegir(e.target.value as Destino)}
          >
            <option value="" disabled hidden>
              Seleccionar...
            </option>
            {DESTINOS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pendiente && (
        <Modal
          title="¿Cambiar a quién se envía?"
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
                  const d = pendiente
                  setPendiente(null)
                  dispatch({ type: 'setDestino', destino: d })
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Se empieza de nuevo desde la selección de la obra. Lo que ya se guardó en el tablero queda
          como está.
        </Modal>
      )}
    </div>
  )
}
