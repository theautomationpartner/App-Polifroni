import { useCallback, useEffect, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { AccionSelect } from '@/features/shared/AccionSelect'
import { useTitulos } from '@/features/shared/useTitulos'
import { getEstructuraBoard, listarPorEstado, type EtiquetaBoard } from '@/services/monday'
import { COL } from '@/services/monday/columns'
import { useDispatch } from '@/state/hooks'
import type { ObraFila } from '@/types'

/** Las dos columnas por las que se filtra. El rótulo sale del tablero; acá sólo el orden. */
const COLUMNAS = [COL.confirmacionOp, COL.confirmacionTaller] as const

/**
 * Listado de Órdenes de Producción, filtrado por confirmación.
 *
 * Es una CONSULTA, no un paso del circuito: contesta "¿cuáles están esperando el OK del cliente?"
 * y "¿cuáles ya confirmó el taller?", que es lo que se pregunta cuando hay que perseguir órdenes,
 * no cuando se está trabajando sobre una.
 *
 * El filtro va contra el tablero, no contra una lista en memoria: filtrar acá obligaría a traerse
 * las 573 obras para mostrar cinco. Y va por ÍNDICE de etiqueta, que es lo único que la API acepta
 * y lo único que sobrevive a que alguien renombre una etiqueta en Monday.
 */
export function ListadoView() {
  const dispatch = useDispatch()
  const titulo = useTitulos()

  const [etiquetas, setEtiquetas] = useState<Record<string, EtiquetaBoard[]>>({})
  /** Índices marcados por columna. Vacío = esa columna no filtra nada. */
  const [marcados, setMarcados] = useState<Record<string, number[]>>({})
  const [filas, setFilas] = useState<ObraFila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void getEstructuraBoard()
      .then((e) => {
        setEtiquetas(Object.fromEntries(COLUMNAS.map((c) => [c, e[c]?.etiquetas ?? []])))
      })
      .catch(() => {})
  }, [])

  const traer = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const { filas: encontradas } = await listarPorEstado(
        COLUMNAS.map((c) => ({ columna: c, indices: marcados[c] ?? [] })),
      )
      setFilas(encontradas)
    } catch {
      setError('No se pudo traer el listado desde Monday. Probá de nuevo en unos segundos.')
      setFilas([])
    } finally {
      setCargando(false)
    }
  }, [marcados])

  useEffect(() => {
    void traer()
  }, [traer])

  const alternar = (columna: string, indice: number) =>
    setMarcados((prev) => {
      const actuales = prev[columna] ?? []
      return {
        ...prev,
        [columna]: actuales.includes(indice)
          ? actuales.filter((i) => i !== indice)
          : [...actuales, indice],
      }
    })

  const hayFiltro = COLUMNAS.some((c) => (marcados[c] ?? []).length > 0)

  return (
    <section className="view paso-layout obras-v2">
      <header className="paso-header">
        <div className="paso-header-in">
          <div className="paso-header-sel">
            <div className="topsel">
              <button
                type="button"
                className="marca-btn"
                title="Volver al inicio"
                onClick={() => dispatch({ type: 'reset' })}
              >
                <LogoEmpresa />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* La consulta no tiene pasos, pero sí tiene salida: el mismo selector con el que se entró.
          Sin él, la única forma de volver era la marca, que lleva al principio de todo. */}
      <AccionSelect />

      <header className="header-section">
        <div className="step-indicator-main">
          <div className="step-badge-main">
            <i className="fas fa-table-list" />
          </div>
          <div className="step-details-main">
            <h1 className="step-title-main">Órdenes de Producción</h1>
            <p className="step-desc-main">
              Filtrá por quién confirmó. Sin nada marcado se listan todas.
            </p>
          </div>
        </div>
      </header>

      {/* Cada columna es su PROPIA caja. Sueltos en una fila, los seis botones se leían como un
          solo filtro de seis opciones, y marcar "CONFIRMADO OP" en un lado y en el otro no es lo
          mismo: uno pregunta por el cliente y el otro por el taller. */}
      <div className="card filtros">
        {COLUMNAS.map((columna, n) => (
          <div className="filtro-grupo" key={columna}>
            <div className="filtro-l">
              <i className={`fas ${n === 0 ? 'fa-user-check' : 'fa-screwdriver-wrench'}`} />
              {titulo(columna, 'Confirmación')}
            </div>
            <div className="filtro-ops">
              {(etiquetas[columna] ?? []).map((e) => {
                const activo = (marcados[columna] ?? []).includes(e.indice)
                return (
                  <button
                    key={e.indice}
                    type="button"
                    className={`filtro-op ${activo ? 'filtro-op--on' : ''}`}
                    style={
                      activo
                        ? { borderColor: e.color, background: `${e.color}22`, color: '#0f172a' }
                        : undefined
                    }
                    onClick={() => alternar(columna, e.indice)}
                  >
                    <span className="filtro-punto" style={{ background: e.color }} />
                    {e.texto}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {hayFiltro && (
          <button type="button" className="obras-pager-btn" onClick={() => setMarcados({})}>
            <i className="fas fa-xmark" /> Quitar filtros
          </button>
        )}
      </div>

      {error && <Aviso tono="err">{error}</Aviso>}

      <div className="card">
        <div className="obras-lista-cab">
          <div>
            <div className="obras-lista-t">
              {cargando ? 'Buscando…' : `${filas.length} ${filas.length === 1 ? 'obra' : 'obras'}`}
            </div>
            <div className="obras-lista-sub">
              {hayFiltro ? 'Con los filtros marcados' : 'Todas las obras del tablero'}
            </div>
          </div>
          <button
            type="button"
            className="btn-actualizar"
            disabled={cargando}
            onClick={() => void traer()}
          >
            <i className={`fas fa-rotate ${cargando ? 'spin' : ''}`} /> Actualizar
          </button>
        </div>

        {cargando && (
          <div className="obras-fantasma" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="obra-sk" key={i}>
                <span className="obra-row-main">
                  <span className="sk sk--t" />
                  <span className="sk sk--s" />
                </span>
                <span className="sk sk--m" />
                <span className="obra-row-chips">
                  <span className="sk sk--chip" />
                  <span className="sk sk--chip" />
                </span>
                <span className="sk sk--ir" />
              </div>
            ))}
          </div>
        )}

        {!cargando && filas.length === 0 && !error && (
          <div className="obras-vacio">Ninguna obra cumple con lo marcado.</div>
        )}

        {!cargando &&
          filas.map((f) => (
            <div className="obra-row obra-row--fija" key={f.id}>
              <span className="obra-row-main">
                <span className="obra-row-titulo">
                  <i className="fas fa-helmet-safety obra-row-ic" />
                  <span className="obra-row-name">{f.nombre}</span>
                </span>
                <span className="obra-row-meta">
                  <span className="idobra">
                    <i className="fas fa-hashtag" /> {f.idObra || f.id}
                  </span>
                  {f.ubicacion && (
                    <span>
                      <i className="fas fa-location-dot" /> {f.ubicacion}
                    </span>
                  )}
                  {f.tipo.texto && (
                    <span>
                      <i className="fas fa-layer-group" /> {f.tipo.texto}
                    </span>
                  )}
                </span>
              </span>

              <span className="obra-row-cliente">
                <span className="obra-row-cl-l">
                  <i className="fas fa-user" /> {titulo(COL.ctaCteCliente, 'Cta Cte Cliente')}
                </span>
                <span className="obra-row-cl-v">{f.cliente || 'Sin cuenta corriente'}</span>
                {f.etapaProduccion.texto && (
                  <span className="obra-row-cl-x">
                    <i className="fas fa-industry" /> {f.etapaProduccion.texto}
                  </span>
                )}
              </span>

              <span className="obra-row-chips">
                <EstadoBadge
                  label={titulo(COL.confirmacionOp, 'Confirmacion Op Cliente')}
                  estado={f.confirmacionOp}
                />
                <EstadoBadge
                  label={titulo(COL.confirmacionTaller, 'Confirmacion Op Taller')}
                  estado={f.confirmacionTaller}
                />
              </span>

              <span />
            </div>
          ))}
      </div>
    </section>
  )
}
