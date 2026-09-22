import { useEffect, useMemo, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useTitulos } from '@/features/shared/useTitulos'
import { TAMANOS_PAGINA } from '@/lib/config'
import { buscarObras, getObra, mondayHabilitado } from '@/services/monday'
import { COL } from '@/services/monday/columns'
import { useDispatch } from '@/state/hooks'
import type { ObraFila } from '@/types'
import { asegurarCatalogo, conPrioridad, useCatalogoObras } from './catalogoObras'

/** Sin acentos y en minúsculas, para que "Peru" encuentre "Perú". */
const plano = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Paso 1 · Elegir la obra.
 *
 * **Acá no se lista el tablero.** Hasta que no se busca algo, no hay resultados en pantalla: 573
 * obras ordenadas por lo que el tablero devuelva primero no son una lista, son un ruido que hay
 * que recorrer, y la obra que se viene a abrir se sabe de antemano.
 *
 * Lo que sí sigue pasando por detrás es la carga del catálogo (`catalogoObras`), que ahora tiene un
 * solo propósito: ser el ÍNDICE de la búsqueda. Con el tablero en memoria se busca sin pedirle nada
 * a Monday —el resultado aparece mientras se escribe— y además se puede buscar por cosas por las
 * que la consulta del tablero no filtra: el cliente, la ubicación o el ID de obra. Mientras el
 * índice todavía se está armando, la búsqueda va al tablero como antes, así nunca se pierde nada.
 */
export function ObrasView() {
  const dispatch = useDispatch()
  const catalogo = useCatalogoObras()
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

  useEffect(() => {
    if (!sinToken) asegurarCatalogo()
  }, [sinToken])

  const visibles = useMemo(
    () => resultados.slice((pagina - 1) * tamano, pagina * tamano),
    [resultados, pagina, tamano],
  )
  const hayMas = pagina * tamano < resultados.length

  /** Contra el índice en memoria: nombre, cliente, ubicación, id de ítem o de obra. */
  const enElIndice = (texto: string): ObraFila[] => {
    const t = plano(texto)
    return catalogo.filas.filter(
      (f) =>
        plano(f.nombre).includes(t) ||
        plano(f.cliente).includes(t) ||
        plano(f.ubicacion).includes(t) ||
        f.id.includes(t) ||
        plano(f.idObra).includes(t),
    )
  }

  const buscar = async (texto: string) => {
    setError('')
    setPagina(1)
    setBuscado(texto)

    /* Con el índice completo no se le pide nada a Monday: el resultado es inmediato y encuentra
       por campos que la consulta del tablero no sabe filtrar. */
    if (catalogo.completo) {
      setResultados(enElIndice(texto))
      return
    }

    setBuscando(true)
    try {
      const { filas } = await conPrioridad(() => buscarObras(texto, 100))
      /* Se suma lo que el índice ya tenga: la consulta del tablero filtra sólo por nombre, así que
         sin esto una búsqueda por cliente no encontraría nada hasta que termine de cargar. */
      const porId = new Map(filas.map((f) => [f.id, f]))
      for (const f of enElIndice(texto)) porId.set(f.id, f)
      setResultados([...porId.values()])
    } catch {
      setError('No se pudo buscar en Monday. Probá de nuevo en unos segundos.')
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  const onBuscar = () => {
    const t = termino.trim()
    if (!t) {
      setErrorInput('Escribí el nombre de la obra, el cliente o el id.')
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
              placeholder="Buscar obra por nombre, cliente, ubicación o id..."
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

      {/* Antes de buscar no hay lista, hay una indicación. */}
      {!buscado && !error && (
        <div className="card obras-arranque">
          <i className="fas fa-magnifying-glass obras-arranque-ic" />
          <p className="obras-arranque-t">Buscá la obra para empezar</p>
          <p className="obras-arranque-s">
            Por nombre, por cliente, por ubicación o pegando el id del ítem.
          </p>
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
