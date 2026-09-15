import { useCallback, useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { OBRAS_DESTACADAS, TAMANOS_PAGINA } from '@/lib/config'
import {
  buscarObras,
  getFilasPorId,
  getObra,
  mondayHabilitado,
  siguientePaginaObras,
} from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { ObraFila } from '@/types'

type Modo = 'destacadas' | 'listado'

/**
 * Paso 1 · Elegir la obra.
 *
 * Arranca mostrando la obra de trabajo (ver `OBRAS_DESTACADAS`): el tablero tiene cientos de ítems
 * y traerlos todos al abrir no le sirve a nadie. El buscador de arriba sí va al tablero —por
 * nombre o por id de ítem— y trae los resultados de a una página, como la lista de Monday.
 */
export function ObrasView() {
  const dispatch = useDispatch()

  const [termino, setTermino] = useState('')
  const [errorInput, setErrorInput] = useState('')
  const [modo, setModo] = useState<Modo>('destacadas')
  /** Término con el que se trajo lo que se está viendo (no el que se está tecleando). */
  const [terminoActivo, setTerminoActivo] = useState('')
  const [filas, setFilas] = useState<ObraFila[]>([])
  const [tamano, setTamano] = useState<number>(TAMANOS_PAGINA[0])
  /** Cursor de la página SIGUIENTE; `null` = no hay más. */
  const [cursor, setCursor] = useState<string | null>(null)
  /** Cursores de las páginas ya vistas, para poder volver. */
  const [historial, setHistorial] = useState<string[]>([])
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState('')

  const sinToken = !mondayHabilitado()

  /** La obra de arranque: una consulta puntual por id, sin recorrer el tablero. */
  const cargarDestacadas = useCallback(() => {
    setCargando(true)
    setError('')
    getFilasPorId(OBRAS_DESTACADAS)
      .then((f) => {
        setFilas(f)
        setModo('destacadas')
        setTerminoActivo('')
        setCursor(null)
        setHistorial([])
        setPagina(1)
      })
      .catch(() => setError('No se pudo leer la obra en Monday. Revisá el token en .env.local.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    if (sinToken) {
      setCargando(false)
      return
    }
    cargarDestacadas()
  }, [cargarDestacadas, sinToken])

  /** Primera página de una búsqueda (o del tablero entero, si el término está vacío). */
  const buscar = async (texto: string, limite = tamano) => {
    setCargando(true)
    setError('')
    try {
      const { filas: encontradas, cursor: proximo } = await buscarObras(texto, limite)
      setFilas(encontradas)
      setCursor(proximo)
      setHistorial([])
      setPagina(1)
      setModo('listado')
      setTerminoActivo(texto)
    } catch {
      setError('No se pudo buscar en Monday. Probá de nuevo en unos segundos.')
    } finally {
      setCargando(false)
    }
  }

  const onBuscar = () => {
    const t = termino.trim()
    if (!t) {
      setErrorInput('Escribí el nombre de la obra o su id para buscar.')
      return
    }
    setErrorInput('')
    void buscar(t)
  }

  const irSiguiente = async () => {
    if (!cursor) return
    setCargando(true)
    try {
      const actual = cursor
      const { filas: siguientes, cursor: proximo } = await siguientePaginaObras(actual, tamano)
      setHistorial((h) => [...h, actual])
      setFilas(siguientes)
      setCursor(proximo)
      setPagina((p) => p + 1)
    } catch {
      setError('No se pudo traer la página siguiente.')
    } finally {
      setCargando(false)
    }
  }

  /* Monday pagina hacia adelante con cursores de un solo uso: no hay "cursor anterior". Volver a
     la página 1 se hace rehaciendo la búsqueda, que es exactamente lo que ya sabe hacer `buscar`.
     Para las intermedias no hay atajo honesto, así que el botón sólo vuelve al principio. */
  const volverAlPrincipio = () => {
    if (modo === 'destacadas') return
    void buscar(terminoActivo)
  }

  const cambiarTamano = (nuevo: number) => {
    setTamano(nuevo)
    if (modo === 'listado') void buscar(terminoActivo, nuevo)
  }

  /** Abre la obra: se trae el ítem COMPLETO, que es lo que necesitan las etapas siguientes. */
  const abrir = async (id: string) => {
    setAbriendo(true)
    try {
      const obra = await getObra(id)
      if (!obra) {
        setError('Esa obra ya no está en el tablero.')
        return
      }
      dispatch({ type: 'setObra', obra })
    } catch {
      dispatch({ type: 'errorMonday', accion: 'abrir la obra' })
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={1}
        titulo="Seleccionar la obra"
        descripcion={
          <>
            Buscá la obra por nombre o por su id de ítem. Desde ella se cargan la Orden ETMO, las
            observaciones y todo el circuito de la Orden de Producción.
          </>
        }
      />

      {sinToken && (
        <Aviso tono="err">
          Falta el token de Monday. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      {/* Buscador: mismo patrón que el de cliente en La Batea (campo ancho + botón sólido). */}
      <div className="card unified-toolbar">
        <div className="search-container">
          <div className="search-wrapper">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar obra por nombre o id de ítem..."
              autoComplete="off"
              value={termino}
              disabled={cargando || sinToken}
              onChange={(e) => {
                setTermino(e.target.value)
                if (errorInput) setErrorInput('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && !cargando && onBuscar()}
            />
          </div>
          <span
            className={`search-helper ${errorInput ? 'search-helper--error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {errorInput}
          </span>
        </div>

        <button type="button" className="btn-buscar" onClick={onBuscar} disabled={cargando || sinToken}>
          {cargando ? (
            <>
              <i className="fas fa-spinner fa-spin" /> Buscando...
            </>
          ) : (
            <>
              <i className="fas fa-search" /> Buscar
            </>
          )}
        </button>
      </div>

      <div className="card">
        <div className="obras-lista-cab">
          <div>
            <div className="obras-lista-t">
              {modo === 'destacadas' ? 'Obra de trabajo' : `Resultados de "${terminoActivo}"`}
            </div>
            <div className="obras-lista-sub">
              {modo === 'destacadas'
                ? 'La lista completa del tablero se consulta desde el buscador.'
                : `Página ${pagina} · ${filas.length} obra${filas.length === 1 ? '' : 's'} en esta página`}
            </div>
          </div>
          {modo === 'listado' && (
            <button type="button" className="obras-pager-btn" onClick={cargarDestacadas}>
              <i className="fas fa-rotate-left" /> Volver a la obra de trabajo
            </button>
          )}
        </div>

        {error && <Aviso tono="err">{error}</Aviso>}

        {filas.length === 0 && !cargando && !error && (
          <div className="obras-vacio">
            No hay obras para mostrar. Probá con otro nombre, o pegá el id del ítem.
          </div>
        )}

        {filas.map((f) => (
          <button key={f.id} type="button" className="obra-row" onClick={() => void abrir(f.id)}>
            <span className="obra-row-main">
              <span className="obra-row-name">{f.nombre}</span>
              <span className="obra-row-meta">
                <span>
                  <i className="fas fa-hashtag" /> {f.id}
                </span>
                {f.etapaProduccion && (
                  <span>
                    <i className="fas fa-industry" /> {f.etapaProduccion}
                  </span>
                )}
              </span>
            </span>
            <span className="obra-row-cliente">
              <i className="fas fa-user" /> {f.cliente || 'Sin cuenta corriente'}
            </span>
            <span className="sbadge">{f.tipo || 'Sin tipo'}</span>
            <span />
            <span className="obra-row-ir">
              Abrir <i className="fas fa-arrow-right" />
            </span>
          </button>
        ))}

        <div className="obras-pager">
          <span className="obras-page-size">
            Mostrar
            <select
              value={tamano}
              onChange={(e) => cambiarTamano(Number(e.target.value))}
              disabled={cargando}
            >
              {TAMANOS_PAGINA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            por página
          </span>

          <button
            type="button"
            className="obras-pager-btn"
            onClick={volverAlPrincipio}
            disabled={modo === 'destacadas' || historial.length === 0 || cargando}
          >
            <i className="fas fa-angles-left" /> Primera página
          </button>
          <button
            type="button"
            className="obras-pager-btn"
            onClick={() => void irSiguiente()}
            disabled={!cursor || cargando}
          >
            Siguiente <i className="fas fa-angle-right" />
          </button>
        </div>
      </div>

      {abriendo && (
        <ModalCargando titulo="Abriendo la obra" detalle="Leyendo los datos del tablero…" />
      )}
    </section>
  )
}
