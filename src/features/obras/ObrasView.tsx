import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { TAMANOS_PAGINA } from '@/lib/config'
import { buscarObras, getObra, mondayHabilitado, siguientePaginaObras } from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { ObraFila } from '@/types'
import {
  asegurarCatalogo,
  conPrioridad,
  refrescarCatalogo,
  useCatalogoObras,
} from './catalogoObras'

type Modo = 'catalogo' | 'busqueda'

/**
 * Paso 1 · Elegir la obra.
 *
 * La lista es el tablero ENTERO, pero no se espera a tenerlo entero para mostrar algo: el catálogo
 * (`catalogoObras`) trae lotes y la pantalla los va dibujando a medida que llegan. Lo que se pagina
 * acá es lo ya traído, así que pasar de página es instantáneo.
 *
 * El buscador sí va al tablero —encuentra obras que todavía no llegaron, y por id de ítem también—
 * y se dispara con prioridad sobre la carga de fondo.
 */
export function ObrasView() {
  const dispatch = useDispatch()
  const catalogo = useCatalogoObras()

  const [termino, setTermino] = useState('')
  const [errorInput, setErrorInput] = useState('')
  const [modo, setModo] = useState<Modo>('catalogo')
  /** Término con el que se trajo lo que se está viendo (no el que se está tecleando). */
  const [terminoActivo, setTerminoActivo] = useState('')
  const [resultados, setResultados] = useState<ObraFila[]>([])
  /** Cursor de la página SIGUIENTE de la búsqueda; `null` = no hay más. */
  const [cursor, setCursor] = useState<string | null>(null)
  const [tamano, setTamano] = useState<number>(TAMANOS_PAGINA[0])
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState('')

  const sinToken = !mondayHabilitado()

  useEffect(() => {
    if (!sinToken) asegurarCatalogo()
  }, [sinToken])

  /* Lo que se ve: el catálogo se pagina en memoria; la búsqueda, como la trae el tablero. */
  const filas = modo === 'catalogo' ? catalogo.filas : resultados
  const total = filas.length
  const visibles = useMemo(() => {
    if (modo === 'busqueda') return resultados
    const desde = (pagina - 1) * tamano
    return catalogo.filas.slice(desde, desde + tamano)
  }, [modo, resultados, catalogo.filas, pagina, tamano])

  const hayMasLocal = modo === 'catalogo' && pagina * tamano < total
  const hayMas = modo === 'catalogo' ? hayMasLocal : !!cursor
  const cargando = modo === 'catalogo' ? catalogo.cargando : buscando

  /** Primera página de una búsqueda. Le gana a la carga de fondo. */
  const buscar = async (texto: string, limite = tamano) => {
    setBuscando(true)
    setError('')
    try {
      const { filas: encontradas, cursor: proximo } = await conPrioridad(() =>
        buscarObras(texto, limite),
      )
      setResultados(encontradas)
      setCursor(proximo)
      setPagina(1)
      setModo('busqueda')
      setTerminoActivo(texto)
    } catch {
      setError('No se pudo buscar en Monday. Probá de nuevo en unos segundos.')
    } finally {
      setBuscando(false)
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

  const volverAlCatalogo = () => {
    setModo('catalogo')
    setTerminoActivo('')
    setResultados([])
    setCursor(null)
    setPagina(1)
    setTermino('')
    /* Por si la carga quedó a medio camino o venció mientras se buscaba. */
    asegurarCatalogo()
  }

  const irSiguiente = async () => {
    if (modo === 'catalogo') {
      setPagina((p) => p + 1)
      return
    }
    if (!cursor) return
    setBuscando(true)
    try {
      const { filas: siguientes, cursor: proximo } = await conPrioridad(() =>
        siguientePaginaObras(cursor, tamano),
      )
      setResultados(siguientes)
      setCursor(proximo)
      setPagina((p) => p + 1)
    } catch {
      setError('No se pudo traer la página siguiente.')
    } finally {
      setBuscando(false)
    }
  }

  /* Monday pagina hacia adelante con cursores de un solo uso: en una BÚSQUEDA no hay "anterior",
     y volver a la primera se hace rehaciendo la consulta. En el catálogo, en cambio, todo lo
     traído está en memoria, así que se retrocede sin pedir nada. */
  const irAnterior = () => {
    if (modo === 'catalogo') {
      setPagina((p) => Math.max(1, p - 1))
      return
    }
    void buscar(terminoActivo)
  }

  const cambiarTamano = (nuevo: number) => {
    setTamano(nuevo)
    setPagina(1)
    if (modo === 'busqueda') void buscar(terminoActivo, nuevo)
  }

  /** Abre la obra: se trae el ítem COMPLETO, que es lo que necesitan las etapas siguientes. */
  const abrir = async (id: string) => {
    setAbriendo(true)
    try {
      const obra = await conPrioridad(() => getObra(id))
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

      <PasoTitulo numero={1} titulo="Seleccionar la obra" />

      {/* Sólo aparece corriendo en tu máquina: en el servidor el token no lo pone el navegador
          sino la función de `api/`, así que `mondayHabilitado()` ya no pregunta por él. */}
      {sinToken && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
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
              placeholder="Buscar obra por nombre o id..."
              autoComplete="off"
              value={termino}
              disabled={sinToken}
              onChange={(e) => {
                setTermino(e.target.value)
                if (errorInput) setErrorInput('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && !buscando && onBuscar()}
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

        <button type="button" className="btn-buscar" onClick={onBuscar} disabled={buscando || sinToken}>
          {buscando ? (
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
              {modo === 'catalogo' ? 'Obras' : `Resultados de "${terminoActivo}"`}
            </div>
            <div className="obras-lista-sub">
              {modo === 'catalogo' ? (
                <>
                  {total} obra{total === 1 ? '' : 's'}
                  {catalogo.cargando && (
                    <>
                      {' '}
                      <i className="fas fa-circle-notch spin" /> trayendo el resto…
                    </>
                  )}
                </>
              ) : (
                `Página ${pagina} · ${visibles.length} obra${visibles.length === 1 ? '' : 's'}`
              )}
            </div>
          </div>
          {modo === 'busqueda' ? (
            <button type="button" className="obras-pager-btn" onClick={volverAlCatalogo}>
              <i className="fas fa-rotate-left" /> Ver todas
            </button>
          ) : (
            <button
              type="button"
              className="obras-pager-btn"
              disabled={catalogo.cargando}
              onClick={() => {
                setPagina(1)
                refrescarCatalogo()
              }}
            >
              <i className="fas fa-rotate" /> Actualizar
            </button>
          )}
        </div>

        {(error || catalogo.error) && <Aviso tono="err">{error || catalogo.error}</Aviso>}

        {visibles.length === 0 && !cargando && !error && !catalogo.error && (
          <div className="obras-vacio">
            {modo === 'busqueda'
              ? 'Sin resultados. Probá con otro nombre o con el id.'
              : 'El tablero no tiene obras.'}
          </div>
        )}

        {visibles.map((f) => (
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
            <select value={tamano} onChange={(e) => cambiarTamano(Number(e.target.value))}>
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
            onClick={irAnterior}
            disabled={pagina === 1 || buscando}
          >
            <i className="fas fa-angle-left" /> {modo === 'catalogo' ? 'Anterior' : 'Primera página'}
          </button>
          <button
            type="button"
            className="obras-pager-btn"
            onClick={() => void irSiguiente()}
            disabled={!hayMas || buscando}
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
