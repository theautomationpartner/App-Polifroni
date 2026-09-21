import { accesoAlPaso } from '@/lib/pasos'
import { ACCIONES_PASO, PASOS } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Paso } from '@/types'

/**
 * Qué acción del proceso se va a realizar.
 *
 * Es la MISMA caja de configuración que usa La Batea para el tipo de operación (ícono en pastilla,
 * la pregunta arriba y el selector debajo, sin chrome propio), adaptada a este circuito: allá se
 * elige qué se cobra, acá qué etapa de la Orden de Producción se trabaja.
 *
 * Desde que el stepper dejó de navegar, ESTE es el control con el que se recorre el proceso. La
 * barra de etapas quedó para lo que sabe hacer bien —decir dónde estás y cuánto falta—, y el moverse
 * pasó a un lugar donde además se puede explicar por qué una etapa no está disponible: una opción
 * bloqueada se ve apagada y el aviso de abajo dice qué falta.
 */
export function AccionSelect() {
  const { paso, obra } = useApp()
  const dispatch = useDispatch()

  /* El estado del tablero manda: una etapa a la que la obra todavía no llegó se lista, pero no se
     puede elegir. Listarla igual es a propósito: dice que existe y que falta algo para llegar. */
  const opciones = PASOS.map((p) => ({ paso: p, acceso: accesoAlPaso(p, obra) }))
  const siguienteBloqueada = opciones.find((o) => !o.acceso.ok)

  return (
    <div className="accion-cfg">
      <div className="cfgbox">
        <div className="cfg-ic">
          <i className="fas fa-list-check" />
        </div>
        <div className="cfg-c">
          <div className="cfg-l">¿Qué acción vas a realizar?</div>
          <select
            className="cfg-sel"
            aria-label="¿Qué acción vas a realizar?"
            value={paso}
            onChange={(e) => {
              const destino = e.target.value as Paso
              if (accesoAlPaso(destino, obra).ok) dispatch({ type: 'goto', paso: destino })
            }}
          >
            {opciones.map(({ paso: p, acceso }, i) => (
              /* El candado y no la palabra "bloqueada": un `option` no admite íconos, y el
                 símbolo se lee de un vistazo sin alargar el renglón. */
              <option key={p} value={p} disabled={!acceso.ok}>
                {`${i + 1}. ${ACCIONES_PASO[p]}${acceso.ok ? '' : '  🔒'}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Por qué la próxima etapa no está disponible. Va afuera de la caja para no desalinear el
          selector, y sólo aparece cuando hay algo que resolver. */}
      {siguienteBloqueada && (
        <p className="accion-nota">
          <i className="fas fa-lock" /> {siguienteBloqueada.acceso.motivo}
        </p>
      )}
    </div>
  )
}
