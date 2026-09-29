import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { SelectorUsuario, TopSel } from '@/features/shared/PasoHeader'
import { PROCESOS } from '@/lib/procesos'
import { useDispatch } from '@/state/hooks'

/**
 * Pantalla de entrada: qué se va a hacer.
 *
 * Arriba, junto a la marca, el usuario en uso —el mismo selector del encabezado de los pasos—: desde
 * el arranque se ve con qué sesión se entró y, si es admin, a nombre de quién se va a emitir.
 *
 * Deliberadamente escueta. Lo único que hay que decidir acá es el proceso, y explicar de dónde
 * salen los datos no ayuda a decidirlo: alarga la pantalla y hay que leerla entera para llegar al
 * mismo click. Los procesos salen del catálogo único (`lib/procesos`).
 */
export function InicioView() {
  const dispatch = useDispatch()

  return (
    <section className="view obras-v2">
      <div className="topsel">
        <LogoEmpresa />
        <TopSel label="Usuario">
          <SelectorUsuario />
        </TopSel>
      </div>

      <div className="procesos-intro">
        <h1>¿Qué vas a hacer?</h1>
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
            <span className="proceso-card-pasos">{p.detalle}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
