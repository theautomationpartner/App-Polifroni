import { useEffect } from 'react'
import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { asegurarCatalogo } from '@/features/obras/catalogoObras'
import { PROCESOS } from '@/lib/procesos'
import { mondayHabilitado } from '@/services/monday'
import { useDispatch } from '@/state/hooks'

/**
 * Pantalla de entrada: qué se va a hacer. Todavía sin autenticación: se entra directo.
 *
 * Deliberadamente escueta. Lo único que hay que decidir acá es el proceso, y explicar de dónde
 * salen los datos no ayuda a decidirlo: alarga la pantalla y hay que leerla entera para llegar al
 * mismo click. Los procesos salen del catálogo único (`lib/procesos`).
 */
export function InicioView() {
  const dispatch = useDispatch()

  /* La lista de obras se empieza a traer ACÁ, mientras se elige el proceso. Son unos segundos de
     lectura que hasta ahora se desperdiciaban, y son justo los que después se esperaban mirando
     una lista vacía. */
  useEffect(() => {
    if (mondayHabilitado()) asegurarCatalogo()
  }, [])

  return (
    <section className="view obras-v2">
      <div className="topsel">
        <LogoEmpresa />
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
