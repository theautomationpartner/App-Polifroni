import { useState } from 'react'
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
/** Valor del selector que NO es una etapa, sino la consulta de órdenes. */
const LISTADO = '__listado'

export function AccionSelect() {
  const { paso, obra, listado } = useApp()
  const dispatch = useDispatch()
  /* Al arrancar no hay nada elegido y el selector lo dice ("Seleccionar..."). Mostrar "Seleccionar
     Obra" de entrada lo hacía parecer una elección ya hecha por el usuario. */
  const [elegida, setElegida] = useState(paso !== 'obra' || !!obra)
  const valor = listado ? LISTADO : !elegida && paso === 'obra' ? '' : paso

  /* Se puede elegir CUALQUIER etapa. El selector dice a dónde querés ir, no si podés: quien elige
     "Enviar la OP al cliente" está diciendo qué vino a hacer, y frenarlo acá lo deja adivinando
     qué le falta. Lo que falta se dice abajo, y cada etapa valida lo suyo cuando hay que actuar
     —con una ventana que explica, no con una opción apagada—. */
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
            value={valor}
            onChange={(e) => {
              const v = e.target.value
              setElegida(true)
              if (v === LISTADO) dispatch({ type: 'verListado' })
              else dispatch({ type: 'goto', paso: v as Paso })
            }}
          >
            <option value="" disabled hidden>
              Seleccionar...
            </option>
            {/* Sin número: el número ya lo lleva la barra de etapas. */}
            {opciones.map(({ paso: p }) => (
              <option key={p} value={p}>
                {ACCIONES_PASO[p]}
              </option>
            ))}
            {/* No es una etapa: es una consulta. Vive acá y no en la pantalla de operaciones
                porque se la busca DESDE el proceso —"¿cuáles están esperando el OK?"— y no antes
                de entrar a él. */}
            <option value={LISTADO}>Listar Órdenes de Producción</option>
          </select>
        </div>
      </div>

      {/* Por qué la próxima etapa no está disponible. Va afuera de la caja para no desalinear el
          selector, y sólo aparece cuando hay algo que resolver. */}
      {!listado && siguienteBloqueada && (
        <p className="accion-nota">
          <i className="fas fa-lock" /> {siguienteBloqueada.acceso.motivo}
        </p>
      )}
    </div>
  )
}
