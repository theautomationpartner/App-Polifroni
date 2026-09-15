import { type ReactNode } from 'react'
import { Stepper } from '@/components/ui/Stepper'
import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { ETIQUETAS_PASO, PASOS, indiceDe } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'

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
 * Barra de contexto del proceso: a la izquierda la marca, el proceso y la obra en la que se está
 * trabajando; a la derecha, el avance por etapas.
 *
 * Los círculos navegan a etapas YA alcanzadas. Las que todavía no se tocaron quedan bloqueadas:
 * mandar la OP antes de generarla no es una navegación, es un error.
 */
export function PasoHeader({ children }: { children?: ReactNode }) {
  const { paso, pasoMaxIdx, obra } = useApp()
  const dispatch = useDispatch()

  return (
    <header className="paso-header">
      <div className="paso-header-in">
        <div className="paso-header-sel">
          <div className="topsel">
            <LogoEmpresa />

            <TopSel label="Proceso">
              <span className="selbox selbox--fix">
                <span className="selbox-val">
                  <i className="fas fa-window-maximize" />
                  <span className="selbox-val-txt">Obras</span>
                </span>
              </span>
            </TopSel>

            <TopSel label="Obra">
              {/* Es un botón: desde cualquier etapa se vuelve a la lista para cambiar de obra. */}
              <button
                type="button"
                className="selbox selbox--fix selbox--btn"
                title={obra ? 'Volver a la lista de obras' : 'Elegí una obra para empezar'}
                onClick={() => dispatch({ type: 'salirDeLaObra' })}
              >
                {obra ? (
                  <span className="selbox-val">
                    <i className="fas fa-helmet-safety" />
                    <span className="selbox-val-txt">{obra.nombre}</span>
                  </span>
                ) : (
                  <span className="selbox-ph">Seleccionar...</span>
                )}
                <i className="fas fa-rotate-left" />
              </button>
            </TopSel>

            {children}
          </div>
        </div>

        {/* La barra de etapas se ve SIEMPRE, también antes de elegir la obra: dice de entrada de
            qué se compone el proceso. Lo que cambia es si se puede navegar —sin obra no hay a
            dónde ir— y hasta dónde: sólo a etapas ya alcanzadas. */}
        <div className="paso-header-steps">
          <Stepper
            steps={ETAPAS}
            current={indiceDe(paso)}
            className="stepper--tight"
            maxReached={obra ? pasoMaxIdx : 0}
            onStep={obra ? (i) => dispatch({ type: 'goto', paso: PASOS[i] ?? 'obra' }) : undefined}
          />
        </div>
      </div>
    </header>
  )
}

interface PasoTituloProps {
  /** El mismo número que marca el stepper. */
  numero: number
  titulo: string
  descripcion: ReactNode
}

/** Encabezado del paso: número, título y bajada. */
export function PasoTitulo({ numero, titulo, descripcion }: PasoTituloProps) {
  return (
    <header className="header-section">
      <div className="step-indicator-main">
        <div className="step-badge-main">{numero}</div>
        <div className="step-details-main">
          <h1 className="step-title-main">{titulo}</h1>
          <p className="step-desc-main">{descripcion}</p>
        </div>
      </div>
    </header>
  )
}
