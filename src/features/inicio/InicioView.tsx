import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { PROCESOS } from '@/lib/procesos'
import { useDispatch } from '@/state/hooks'

/**
 * Pantalla principal: qué proceso se va a realizar. Todavía sin autenticación: se entra directo.
 *
 * Los procesos salen del mismo catálogo que alimenta al selector del encabezado (`lib/procesos`),
 * así las dos pantallas no pueden decir cosas distintas.
 */
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
            <span className="proceso-card-pasos">{p.detalle}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
