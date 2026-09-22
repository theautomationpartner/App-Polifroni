import { useState, type ReactNode } from 'react'
import { Dropdown } from '@/components/ui/Dropdown'
import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { Modal } from '@/components/ui/Modal'
import { Stepper } from '@/components/ui/Stepper'
import { PROCESOS, procesoDe, type ProcesoDef } from '@/lib/procesos'
import { topePermitido } from '@/lib/pasos'
import { ETIQUETAS_PASO, PASOS, indiceDe } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import { AccionSelect } from './AccionSelect'

/** Etiquetas de las etapas, en el orden del proceso. */
const ETAPAS = PASOS.map((p) => ETIQUETAS_PASO[p])

/** Item de la barra: rótulo arriba, control abajo (mismo patrón que La Batea). */
function TopSel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="topsel-item">
      <span className="topsel-lbl">{label}</span>
      {children}
    </div>
  )
}

/**
 * Selector de PROCESO, el mismo control con el que La Batea elige la operación.
 *
 * Lo que se elige acá es el proceso ENTERO —"Orden de Producción", cinco etapas—, no una de
 * sus etapas: el encabezado dice en qué trabajo estás, y adentro del trabajo se elige la acción
 * (`AccionSelect`). Mezclar las dos cosas en un solo control hacía que el proceso no tuviera nombre.
 *
 * Un proceso que todavía no está construido se lista igual pero no se puede elegir: verlo apagado
 * dice que existe y que no está listo, que es más de lo que diría su ausencia.
 */
function SelectorProceso() {
  const { proceso, obra } = useApp()
  const dispatch = useDispatch()
  const [pendiente, setPendiente] = useState<ProcesoDef | null>(null)
  const actual = procesoDe(proceso)

  const elegir = (p: ProcesoDef) => {
    if (!p.id || p.id === proceso) return
    // Sin obra abierta no hay nada que perder: el cambio va derecho.
    if (!obra) {
      dispatch({ type: 'setProceso', proceso: p.id })
      return
    }
    setPendiente(p)
  }

  return (
    <>
      <Dropdown<ProcesoDef>
        label={
          actual ? (
            <span className="selbox-val">
              <i className={`fas ${actual.icono}`} />
              <span className="selbox-val-txt">{actual.titulo}</span>
            </span>
          ) : (
            <span className="selbox-ph">Seleccionar...</span>
          )
        }
        items={PROCESOS}
        itemKey={(p) => p.titulo}
        renderItem={(p) => (
          <span className={`ddproc ${p.id ? '' : 'ddproc--soon'}`}>
            <i className={`fas ${p.icono}`} />
            <span className="ddproc-t">{p.titulo}</span>
            {!p.id && <span className="ddproc-x">Próximamente</span>}
          </span>
        )}
        onSelect={elegir}
      />

      {pendiente && (
        <Modal
          title="¿Cambiar de proceso?"
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
                  const p = pendiente
                  setPendiente(null)
                  if (p.id) dispatch({ type: 'setProceso', proceso: p.id })
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Vas a salir de <strong>{obra?.nombre}</strong> y empezar de nuevo en otro proceso. Lo que
          ya se guardó en el tablero queda como está.
        </Modal>
      )}
    </>
  )
}

/**
 * Barra de contexto: a la izquierda la marca y las dos cajas —qué proceso y sobre qué obra—; a la
 * derecha, el avance por etapas.
 */
export function PasoHeader({ children }: { children?: ReactNode }) {
  const { paso, obra, entrada } = useApp()
  const dispatch = useDispatch()
  /* La barra muestra DESDE donde se entró, renumerando desde 1: las etapas que quedaron atrás no
     se hicieron, se saltearon, y pintarlas de verde diría que se hicieron. */
  const desde = indiceDe(entrada)

  return (
    <header className="paso-header">
      <div className="paso-header-in">
        <div className="paso-header-sel">
          <div className="topsel">
            {/* La marca es el camino de vuelta al inicio: sin ella no habría ninguno. */}
            <button
              type="button"
              className="marca-btn"
              title="Volver al inicio"
              onClick={() => dispatch({ type: 'reset' })}
            >
              <LogoEmpresa />
            </button>

            <TopSel label="Operación">
              <SelectorProceso />
            </TopSel>

            {/* Quién está usando la app. Todavía no hay sesión, así que la caja existe apagada: es
                el lugar donde va a ir, y verla vacía dice eso mejor que no verla.

                Acá estaba la caja de la obra, que al tocarla volvía a la lista. Se fue: parecía un
                selector y era un "empezar de nuevo", y eso se descubría perdiendo lo que estabas
                haciendo. Para cambiar de obra se vuelve por el pie del paso o por la marca. */}
            <TopSel label="Usuario">
              <div className="selbox selbox--fix selbox--off" aria-disabled="true">
                <span className="selbox-val">
                  <i className="fas fa-user" />
                  <span className="selbox-val-txt">Sin sesión</span>
                </span>
                <span className="selbox-soon">Próximamente</span>
              </div>
            </TopSel>

            {children}
          </div>
        </div>

        {/* La barra de etapas INFORMA, no navega: dice en qué etapa estás y cuánto falta. Moverse
            es tarea del selector de acción, que además puede explicar por qué una etapa no está
            disponible —cosa que un círculo apagado no sabe hacer—. */}
        <div className="paso-header-steps">
          <Stepper
            steps={ETAPAS.slice(desde)}
            current={indiceDe(paso) - desde}
            className="stepper--tight"
            maxReached={topePermitido(obra) - desde}
          />
        </div>
      </div>
    </header>
  )
}

interface PasoTituloProps {
  titulo: string
  /** Bajada. Opcional: cuando el título ya se explica solo, sobra. */
  descripcion?: ReactNode
}

/**
 * Encabezado del paso: número, título y —si hace falta— una línea de bajada, con el selector de
 * acción debajo.
 *
 * El selector viene incluido acá y no lo pone cada vista: es la única forma de moverse por el
 * proceso, así que tiene que estar en las cinco etapas sin excepción y en el mismo lugar.
 */
export function PasoTitulo({ titulo, descripcion }: PasoTituloProps) {
  const { paso, entrada } = useApp()
  const esPrimero = paso === 'obra'
  /* El número SALE del paso, no se lo pasa cada vista.
     Antes era un `numero={4}` escrito a mano en cada pantalla, y esa copia se volvió mentira sola:
     al fusionar dos etapas, el 5 escrito en la última se restaba contra una barra que ahora tiene
     cuatro, y el título mostraba "-2". Calculado acá no puede desincronizarse del stepper. */
  const propio = indiceDe(paso) - indiceDe(entrada) + 1
  /* El selector de acción va SÓLO en el paso 1: ahí es donde se decide qué se viene a hacer. En
     las etapas siguientes esa decisión ya está tomada, y repetir la pregunta en cada pantalla la
     convertía en un control de navegación disfrazado de pregunta.

     Va ARRIBA y el título numerado abajo, en ese orden, porque ese número no titula la pantalla:
     titula el trabajo que viene justo debajo de él. */
  return (
    <>
      {esPrimero && <AccionSelect />}
      <header className="header-section">
        <div className="step-indicator-main">
          <div className="step-badge-main">{propio}</div>
          <div className="step-details-main">
            <h1 className="step-title-main">{titulo}</h1>
            {descripcion && <p className="step-desc-main">{descripcion}</p>}
          </div>
        </div>
      </header>
    </>
  )
}
