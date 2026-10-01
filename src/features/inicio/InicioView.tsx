import { PasoHeader } from '@/features/shared/PasoHeader'
import { PROCESOS } from '@/lib/procesos'
import { OPERACIONES, PASOS } from '@/state/appState'
import { useDispatch } from '@/state/hooks'
import type { Operacion } from '@/types'

/** Una tarjeta del inicio: el mismo diseño para las áreas y para las operaciones de un área. */
function Tarjeta({
  icono,
  titulo,
  descripcion,
  detalle,
  disponible = true,
  onElegir,
}: {
  icono: string
  titulo: string
  descripcion?: string
  detalle: string
  disponible?: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      className={`proceso-card ${disponible ? '' : 'proceso-card--soon'}`}
      disabled={!disponible}
      onClick={onElegir}
    >
      <span className="proceso-card-cab">
        <span className="proceso-card-ic">
          <i className={`fas ${icono}`} />
        </span>
        <span className="proceso-card-t">{titulo}</span>
      </span>
      {descripcion && <span className="proceso-card-d">{descripcion}</span>}
      <span className="proceso-card-pasos">{detalle}</span>
    </button>
  )
}

/**
 * Pantalla de entrada: en qué área se va a trabajar —Presupuesto, Obras o Producción—.
 *
 * Arriba, el mismo encabezado que adentro de cada área: la marca, el área —vacía hasta elegir una—
 * y el usuario en uso. Las áreas salen del catálogo único (`lib/procesos`); las que todavía no
 * están se ven apagadas.
 */
export function InicioView() {
  const dispatch = useDispatch()

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <div className="procesos-intro">
        <h1>Seleccioná un área:</h1>
      </div>

      <div className="procesos-grid">
        {PROCESOS.map((p) => (
          <Tarjeta
            key={p.titulo}
            icono={p.icono}
            titulo={p.titulo}
            descripcion={p.descripcion}
            detalle={p.detalle}
            disponible={!!p.id}
            onElegir={() => p.id && dispatch({ type: 'setProceso', proceso: p.id })}
          />
        ))}
      </div>
    </section>
  )
}

/** Cómo se presenta cada operación en su tarjeta: el ícono y cuántas etapas tiene. */
const TARJETA_OPERACION: Record<Operacion, { icono: string; titulo: string; etapas: number }> = {
  enviar: { icono: 'fa-paper-plane', titulo: 'Enviar Orden de Producción', etapas: PASOS.length },
  /* La consulta es una sola pantalla: una etapa. */
  consultar: { icono: 'fa-table-list', titulo: 'Consultar Órdenes de Producción', etapas: 1 },
}

/**
 * Producción, antes de elegir la operación: las tarjetas de sus operaciones, con el mismo diseño
 * que las del inicio. Elegir una es lo mismo que elegirla en el selector del encabezado.
 */
export function ProduccionInicioView() {
  const dispatch = useDispatch()

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <div className="procesos-intro">
        <h1>Seleccioná una operación:</h1>
      </div>

      <div className="procesos-grid">
        {OPERACIONES.map((o) => {
          const t = TARJETA_OPERACION[o.id]
          return (
            <Tarjeta
              key={o.id}
              icono={t.icono}
              titulo={t.titulo}
              detalle={`${t.etapas} ${t.etapas === 1 ? 'etapa' : 'etapas'}`}
              onElegir={() => dispatch({ type: 'setOperacion', operacion: o.id })}
            />
          )
        })}
      </div>
    </section>
  )
}
