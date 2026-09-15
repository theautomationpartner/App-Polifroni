import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { useDispatch } from '@/state/hooks'
import type { Proceso } from '@/types'

interface ProcesoCard {
  id: Proceso | null
  icono: string
  titulo: string
  descripcion: string
  pasos: string
}

/**
 * Los procesos de la empresa. Hoy sólo 🪟 Obras está construido; los demás se muestran apagados
 * —y se dicen— porque la pantalla es el mapa del sistema, no sólo un botón: quien entra ve dónde
 * va a vivir lo que todavía falta.
 */
const PROCESOS: ProcesoCard[] = [
  {
    id: 'obras',
    icono: 'fa-window-maximize',
    titulo: '🪟 Obras',
    descripcion:
      'Orden de producción: ingesta del ETMO, observaciones por ítem, generación de la OP final, envío al cliente y despacho al taller.',
    pasos: '5 etapas',
  },
  {
    id: null,
    icono: 'fa-file-invoice-dollar',
    titulo: 'Cuentas corrientes',
    descripcion: 'Movimientos y saldos de la cuenta corriente del cliente.',
    pasos: 'Próximamente',
  },
  {
    id: null,
    icono: 'fa-truck-fast',
    titulo: 'Entregas y colocación',
    descripcion: 'Coordinación de entrega, premarcos y colocación en obra.',
    pasos: 'Próximamente',
  },
]

/** Pantalla principal: qué proceso se va a realizar. Todavía sin autenticación: se entra directo. */
export function InicioView() {
  const dispatch = useDispatch()

  return (
    <section className="view obras-v2">
      <div className="topsel">
        <LogoEmpresa />
        <div className="topsel-item">
          <span className="topsel-lbl">Sistema de procesos</span>
          <span className="xs">Tablero 🪟 Obras · Monday</span>
        </div>
      </div>

      <div className="procesos-intro">
        <h1>¿Qué proceso vas a realizar?</h1>
        <p>Elegí el proceso para arrancar. Los datos se leen y se escriben en el tablero de Monday.</p>
      </div>

      <div className="procesos-grid">
        {PROCESOS.map((p) => (
          <button
            key={p.titulo}
            type="button"
            className={`proceso-card ${p.id ? '' : 'proceso-card--soon'}`}
            disabled={!p.id}
            onClick={() => p.id && dispatch({ type: 'setProceso', proceso: p.id })}
          >
            <span className="proceso-card-ic">
              <i className={`fas ${p.icono}`} />
            </span>
            <span className="proceso-card-t">{p.titulo}</span>
            <span className="proceso-card-d">{p.descripcion}</span>
            <span className="proceso-card-pasos">{p.pasos}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
