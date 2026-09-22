import { useMemo, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useTitulos } from '@/features/shared/useTitulos'
import { TAMANOS_PAGINA } from '@/lib/config'
import { buscarObras, getObra, mondayHabilitado } from '@/services/monday'
import { COL } from '@/services/monday/columns'
import { useDispatch } from '@/state/hooks'
import type { ObraFila } from '@/types'

/**
 * Paso 1 · Elegir la obra.
 *
 * **Acá no se lista ni se precarga el tablero.** No se le pide NADA a Monday hasta que alguien
 * busca: ni al abrir la pantalla ni por detrás. 573 obras ordenadas por lo que el tablero devuelva
 * primero no son una lista —son algo que hay que recorrer— y la obra que se viene a abrir se sabe
 * de antemano.
 *
 * El costo de no tener índice en memoria hay que saberlo: la búsqueda es la del tablero, o sea por
 * NOMBRE (y por id de ítem pegado). Probado contra la API, Monday no acepta `contains_text` sobre
 * la cuenta corriente ni sobre la ubicación, así que buscar por cliente sólo sería posible
 * teniendo el tablero en memoria.
 */
export function ObrasView() {
  const dispatch = useDispatch()
  const titulo = useTitulos()

  const [termino, setTermino] = useState('')
  const [errorInput, setErrorInput] = useState('')
  /** Término con el que se trajo lo que se ve. Vacío = todavía no se buscó nada. */
  const [buscado, setBuscado] = useState('')
  const [resultados, setResultados] = useState<ObraFila[]>([])
  const [tamano, setTamano] = useState<number>(TAMANOS_PAGINA[0])
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState('')

  const sinToken = !mondayHabilitado()

  const visibles = useMemo(
    () => resultados.slice((pagina - 1) * tamano, pagina * tamano),
    [resultados, pagina, tamano],
  )
  const hayMas = pagina * tamano < resultados.length

  const buscar = async (texto: string) => {
    setError('')
    setPagina(1)
    setBuscando(true)
    try {
      const { filas } = await buscarObras(texto, 100)
      setResultados(filas)
      setBuscado(texto)
    } catch {
      setError('No se pudo buscar en Monday. Probá de nuevo en unos segundos.')
      setResultados([])
      setBuscado(texto)
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

  const limpiar = () => {
    setTermino('')
    setBuscado('')
    setResultados([])
    setError('')
    setPagina(1)
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

      <PasoTitulo numero={1} titulo="Seleccionar la obra" />

      {/* Sólo aparece corriendo en tu máquina: en el servidor el token no lo pone el navegador
          sino la función de `api/`, así que `mondayHabilitado()` ya no pregunta por él. */}
      {sinToken && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

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
              placeholder="Buscar obra por nombre o pegando el id del ítem..."
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
          {/* El renglón se monta siempre: reserva su lugar para que el error no empuje lo de abajo. */}
          <span
            className={`search-helper ${errorInput ? 'search-helper--error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {errorInput}
          </span>
        </div>

        <button
          type="button"
          className="btn-buscar"
          onClick={onBuscar}
          disabled={buscando || sinToken}
        >
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

      {error && <Aviso tono="err">{error}</Aviso>}

      {/* Antes de buscar no hay lista: hay una indicación y, debajo, el contorno de lo que va a
          aparecer. Los renglones fantasma no son adorno —ocupan el alto que después va a ocupar el
          resultado, así la pantalla no pega un salto al buscar— y mientras el índice se arma dicen
          que algo está pasando, en vez de dejar medio metro de blanco. */}
      {!buscado && !error && (
        <div className="card obras-arranque">
          <div className="obras-arranque-in">
            <i className="fas fa-magnifying-glass obras-arranque-ic" />
            <p className="obras-arranque-t">Buscá la obra para empezar</p>
            <p className="obras-arranque-s">
              Escribí el nombre de la obra, o pegá el id del ítem, y tocá Buscar.
            </p>
          </div>

          <div className="obras-fantasma" aria-hidden="true">
            {[0, 1, 2].map((i) => (
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
        </div>
      )}

      {buscado && !error && (
        <div className="card">
          <div className="obras-lista-cab">
            <div>
              <div className="obras-lista-t">
                {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}
              </div>
              <div className="obras-lista-sub">
                Para «{buscado}»
                {resultados.length > tamano && ` · página ${pagina}`}
              </div>
            </div>
            <button type="button" className="obras-pager-btn" onClick={limpiar}>
              <i className="fas fa-xmark" /> Limpiar
            </button>
          </div>

          {resultados.length === 0 && !buscando && (
            <div className="obras-vacio">
              Sin resultados. Probá con parte del nombre, con el cliente o con el id.
            </div>
          )}

          {visibles.map((f) => (
            <button key={f.id} type="button" className="obra-row" onClick={() => void abrir(f.id)}>
              <span className="obra-row-main">
                <span className="obra-row-name">{f.nombre}</span>
                <span className="obra-row-meta">
                  <span>
                    <i className="fas fa-hashtag" /> {f.idObra || f.id}
                  </span>
                  {f.ubicacion && (
                    <span>
                      <i className="fas fa-location-dot" /> {f.ubicacion}
                    </span>
                  )}
                </span>
              </span>
              <span className="obra-row-cliente">
                <span className="obra-row-cl-l">{titulo(COL.ctaCteCliente, 'Cliente')}</span>
                <span className="obra-row-cl-v">{f.cliente || 'Sin cuenta corriente'}</span>
              </span>
              <span className="obra-row-chips">
                <EstadoBadge label={titulo(COL.tipo, 'Tipo')} estado={f.tipo} />
                <EstadoBadge
                  label={titulo(COL.etapaProduccion, 'Producción')}
                  estado={f.etapaProduccion}
                />
                <EstadoBadge label={titulo(COL.etapaVenta, 'Venta')} estado={f.etapaVenta} />
              </span>
              <span className="obra-row-ir">
                Abrir <i className="fas fa-arrow-right" />
              </span>
            </button>
          ))}

          {resultados.length > TAMANOS_PAGINA[0] && (
            <div className="obras-pager">
              <span className="obras-page-size">
                Mostrar
                <select
                  value={tamano}
                  onChange={(e) => {
                    setTamano(Number(e.target.value))
                    setPagina(1)
                  }}
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
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
              >
                <i className="fas fa-angle-left" /> Anterior
              </button>
              <button
                type="button"
                className="obras-pager-btn"
                onClick={() => setPagina((p) => p + 1)}
                disabled={!hayMas}
              >
                Siguiente <i className="fas fa-angle-right" />
              </button>
            </div>
          )}
        </div>
      )}

      {abriendo && (
        <ModalCargando titulo="Abriendo la obra" detalle="Leyendo los datos del tablero…" />
      )}
    </section>
  )
}
