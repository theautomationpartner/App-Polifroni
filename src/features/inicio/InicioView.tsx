import { useState } from 'react'
import { PasoHeader } from '@/features/shared/PasoHeader'
import { PROCESOS, procesoDe } from '@/lib/procesos'
import { normalizar } from '@/lib/texto'
import { puedeOperar } from '@/lib/permisos'
import { OPERACIONES, PASOS, areaPermitida, operacionesDe } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Operacion, Proceso, Rol } from '@/types'

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
 * Arriba, el mismo encabezado que adentro de cada área: la marca, el área —sin elegir— y el usuario
 * en uso. Las áreas salen del catálogo único (`lib/procesos`); las que todavía no están se ven
 * apagadas.
 *
 * El buscador filtra en vivo por el nombre del área o de una operación: lo que coincide con un área
 * muestra su tarjeta, y lo que coincide con una operación muestra la tarjeta de esa operación, que
 * entra directo a ella. Sin nada escrito, se ven las áreas.
 */
export function InicioView() {
  const dispatch = useDispatch()
  const { usuario } = useApp()
  const roles = usuario?.roles
  const [busqueda, setBusqueda] = useState('')
  const t = normalizar(busqueda.trim())

  /* Las áreas y operaciones que el team del usuario no habilita no se muestran. Las que todavía no
     están construidas se ven apagadas para todos. */
  const areas = PROCESOS.filter((p) => (!p.id || areaPermitida(p.id, roles)) && (!t || normalizar(p.titulo).includes(t)))
  const operaciones = t
    ? OPERACIONES.filter((o) => puedeOperar(roles, o.id) && normalizar(TARJETA_OPERACION[o.id].titulo).includes(t))
    : []
  const nada = areas.length === 0 && operaciones.length === 0

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      {/* Sólo el campo de búsqueda, sin la card de fondo de los otros buscadores. */}
      <div className="inicio-buscador">
        <div className="search-container">
          <div className="search-wrapper">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              id="inicio-buscar"
              type="search"
              className="search-input"
              placeholder="Buscar área u operación"
              aria-label="Buscar área u operación"
              autoComplete="off"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>
      </div>

      {nada ? (
        <div className="inicio-vacio" role="status">
          <i className="fas fa-magnifying-glass" aria-hidden="true" /> No hay áreas ni operaciones que coincidan con
          «{busqueda.trim()}».
        </div>
      ) : (
        <div className="procesos-grid">
          {areas.map((p) => (
            <Tarjeta
              key={p.titulo}
              icono={p.icono}
              titulo={p.titulo}
              descripcion={p.descripcion}
              detalle={detalleArea(p.id, p.detalle, roles)}
              disponible={!!p.id}
              onElegir={() => p.id && dispatch({ type: 'setProceso', proceso: p.id })}
            />
          ))}
          {/* Elegir una operación entra a su área y a la operación de una vez. */}
          {operaciones.map((o) => {
            const op = TARJETA_OPERACION[o.id]
            return (
              <Tarjeta
                key={o.id}
                icono={op.icono}
                titulo={op.titulo}
                descripcion={`Operación del área ${procesoDe(o.proceso)?.titulo ?? 'Producción'}.`}
                detalle={`${op.etapas} ${op.etapas === 1 ? 'etapa' : 'etapas'}`}
                onElegir={() => {
                  dispatch({ type: 'setProceso', proceso: o.proceso })
                  dispatch({ type: 'setOperacion', operacion: o.id })
                }}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Cómo se presenta cada operación en su tarjeta: el ícono y cuántas etapas tiene. */
const TARJETA_OPERACION: Record<Operacion, { icono: string; titulo: string; etapas: number }> = {
  enviar: { icono: 'fa-paper-plane', titulo: 'Cargar y Enviar Órdenes de Producción', etapas: PASOS.length },
  /* La consulta es una sola pantalla: una etapa. */
  consultar: { icono: 'fa-table-list', titulo: 'Consultar Órdenes de Producción', etapas: 1 },
  vidrios: { icono: 'fa-border-all', titulo: 'Solicitud de Cortes de Vidrio', etapas: PASOS.length },
  /* Una sola pantalla: la tabla de las órdenes enviadas al taller. */
  crearTurno: { icono: 'fa-calendar-plus', titulo: 'Crear Turnos', etapas: PASOS.length },
  /* La gestión es una sola pantalla, como la consulta de órdenes. */
  gestionarTurnos: { icono: 'fa-calendar-check', titulo: 'Consultar y Gestionar Turnos', etapas: 1 },
  /* Dos etapas: a quién es el presupuesto, y el presupuesto con su envío. */
  presupuestos: { icono: 'fa-file-invoice-dollar', titulo: 'Crear y Cargar Presupuestos', etapas: 2 },
}

/** El pie de la tarjeta de un área: cuántas operaciones tiene PARA ESTE USUARIO. */
function detalleArea(id: Proceso | null, detalle: string, roles: readonly Rol[] | undefined): string {
  if (!id) return detalle
  const n = operacionesDe(id, roles).length
  return `${n} ${n === 1 ? 'operación' : 'operaciones'}`
}

/**
 * Producción, antes de elegir la operación: las tarjetas de sus operaciones, con el mismo diseño
 * que las del inicio. Elegir una es lo mismo que elegirla en el selector del encabezado.
 */
export function ProduccionInicioView() {
  const dispatch = useDispatch()
  const { proceso, usuario } = useApp()

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <div className="procesos-intro">
        <h1>Seleccioná una operación:</h1>
      </div>

      <div className="procesos-grid">
        {operacionesDe(proceso, usuario?.roles).map((o) => {
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
