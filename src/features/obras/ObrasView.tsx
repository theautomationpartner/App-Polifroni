import { useEffect, useRef, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useTitulos } from '@/features/shared/useTitulos'
import {
  buscarObras,
  getObra,
  guardarObservaciones,
  limpiarArchivos,
  mondayHabilitado,
} from '@/services/monday'
import { COL } from '@/services/monday/columns'
import { ACCIONES_PASO } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra, ObraFila, Paso } from '@/types'
import { validarEntrada, type ValidacionEntrada } from './validaciones'

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
 *
 * Lo que devuelve la búsqueda se despliega SOBRE el campo, como en La Batea, y hay que elegir una:
 * una lista suelta debajo deja seguir sin haber elegido nada, y todo lo que viene después necesita
 * una obra. Elegir es el paso, no un detalle.
 */
export function ObrasView() {
  const dispatch = useDispatch()
  const { paso } = useApp()
  const titulo = useTitulos()

  /* Se eligió una acción pero todavía no hay obra: la app cayó acá sola. Decirlo evita que la
     pantalla se lea como "se perdió lo que elegí" —la acción sigue elegida, y se retoma sola en
     cuanto haya una obra—. */
  const accionPendiente = paso !== 'obra' ? ACCIONES_PASO[paso] : ''
  /** A dónde lleva elegir una obra ahora mismo. Sin acción elegida, a la primera etapa. */
  const destino: Paso = paso === 'obra' ? 'etmo' : paso

  const [termino, setTermino] = useState('')
  const [errorInput, setErrorInput] = useState('')
  /** Término con el que se trajo lo que se ve. Vacío = todavía no se buscó nada. */
  const [buscado, setBuscado] = useState('')
  const [resultados, setResultados] = useState<ObraFila[]>([])
  /** El desplegable está abierto. Se cierra eligiendo, con Escape o tocando afuera. */
  const [abierto, setAbierto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState('')
  /**
   * Obra elegida que todavía NO se abrió porque hay algo que preguntar.
   *
   * Las validaciones del circuito se resuelven acá y no adentro de cada etapa: preguntar al entrar
   * no agrega un paso, reemplaza el momento en que la persona se iba a dar cuenta sola tres
   * pantallas después.
   */
  const [pendiente, setPendiente] = useState<{ obra: Obra; aviso: ValidacionEntrada } | null>(null)

  const sinToken = !mondayHabilitado()

  const caja = useRef<HTMLDivElement>(null)

  /* Tocar afuera cierra, pero NO elige: lo buscado sigue ahí y el desplegable se vuelve a abrir
     desde el renglón de abajo. Cerrar no es descartar. */
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  const buscar = async (texto: string) => {
    setError('')
    setBuscando(true)
    try {
      const { filas } = await buscarObras(texto, 50)
      setResultados(filas)
      setBuscado(texto)
      /* Se abre SIEMPRE, incluso con una sola coincidencia. Abrir la única sin preguntar ahorra un
         click y a cambio arranca el proceso sobre una obra que nadie llegó a mirar. */
      setAbierto(filas.length > 0)
    } catch {
      setError('No se pudo buscar en Monday. Probá de nuevo en unos segundos.')
      setResultados([])
      setBuscado(texto)
      setAbierto(false)
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
    setAbierto(false)
  }

  /** Abre la obra: se trae el ítem COMPLETO, que es lo que necesitan las etapas siguientes. */
  const abrir = async (id: string) => {
    /* Se cierra ANTES de empezar a traer: si no, la lista queda flotando debajo de la ventana de
       "Abriendo la obra" y las dos se pisan. Elegida una, la lista ya no tiene nada que ofrecer. */
    setAbierto(false)
    setAbriendo(true)
    try {
      const obra = await getObra(id)
      if (!obra) {
        setError('Esa obra ya no está en el tablero.')
        return
      }
      const aviso = validarEntrada(destino, obra)
      if (aviso) {
        setPendiente({ obra, aviso })
        return
      }
      entrar(obra, destino)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'abrir la obra' })
    } finally {
      setAbriendo(false)
    }
  }

  /**
   * Abre la obra en una etapa.
   *
   * El `goto` va PRIMERO y con la pantalla todavía en la lista: es lo que fija por dónde se entró
   * al proceso, y de eso depende la numeración de la barra de etapas. Al revés, `setObra` navegaría
   * usando el paso viejo y la barra empezaría a contar desde otro lado.
   */
  const entrar = (obra: Obra, paso: Paso) => {
    dispatch({ type: 'goto', paso })
    dispatch({ type: 'setObra', obra })
  }

  /** Aceptar la pregunta: se aplica lo que haya que aplicar y recién ahí se entra. */
  const confirmar = async () => {
    if (!pendiente) return
    const { obra, aviso } = pendiente
    setPendiente(null)
    if (!aviso.limpiarCiclo) {
      entrar(obra, aviso.destino)
      return
    }
    setAbriendo(true)
    try {
      await limpiarArchivos(obra.id, COL.ordenEtmo)
      await guardarObservaciones(obra.id, '')
      /* Se relee para entrar con la obra como quedó: si se entrara con la copia vieja, la etapa
         mostraría un documento y unas observaciones que en el tablero ya no existen. */
      const fresca = await getObra(obra.id)
      entrar(fresca ?? obra, aviso.destino)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'preparar la obra para una orden nueva' })
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo titulo="Seleccionar la obra" />

      {accionPendiente && (
        <div className="pide-obra">
          <i className="fas fa-arrow-turn-down" />
          <span>
            Seleccioná una obra para continuar con <strong>{accionPendiente}</strong>.
          </span>
        </div>
      )}

      {/* Sólo aparece corriendo en tu máquina: en el servidor el token no lo pone el navegador
          sino la función de `api/`, así que `mondayHabilitado()` ya no pregunta por él. */}
      {sinToken && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <div className="card unified-toolbar">
        <div className="search-container" ref={caja}>
          <div className={`search-wrapper ${abierto ? 'search-wrapper--abierto' : ''}`}>
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
                if (abierto) setAbierto(false)
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
            {errorInput ||
              (buscado && resultados.length === 0 && !buscando
                ? 'Sin resultados. Probá con parte del nombre o pegá el id.'
                : '')}
          </span>

          {abierto && resultados.length > 0 && (
            <div className="results" role="listbox">
              {resultados.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="ritem"
                  role="option"
                  aria-selected="false"
                  onClick={() => void abrir(f.id)}
                >
                  <span className="ritem-main">
                    <span className="ritem-name">{f.nombre}</span>
                    <span className="ritem-sub">
                      <span>
                        <i className="fas fa-hashtag" /> {f.idObra || f.id}
                      </span>
                      {f.cliente && (
                        <span>
                          <i className="fas fa-user" /> {f.cliente}
                        </span>
                      )}
                      {f.ubicacion && (
                        <span>
                          <i className="fas fa-location-dot" /> {f.ubicacion}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="ritem-chips">
                    <EstadoBadge label={titulo(COL.tipo, 'Tipo')} estado={f.tipo} />
                    <EstadoBadge
                      label={titulo(COL.etapaProduccion, 'Etapa de Produccion')}
                      estado={f.etapaProduccion}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
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

      {/* Cuando hay una búsqueda hecha, el recordatorio de abajo deja volver a abrir la lista sin
          tener que buscar otra vez. Elegir sigue siendo obligatorio: no hay ningún camino que siga
          sin una obra. */}
      {buscado && resultados.length > 0 && !abierto && (
        <button type="button" className="card obras-retomar" onClick={() => setAbierto(true)}>
          <i className="fas fa-list-ul" />
          <span>
            <strong>{resultados.length}</strong>{' '}
            {resultados.length === 1 ? 'obra encontrada' : 'obras encontradas'} para «{buscado}» ·
            elegí una para seguir
          </span>
          <span className="obras-retomar-x" onClick={limpiar}>
            Limpiar
          </span>
        </button>
      )}

      {pendiente && (
        <Modal
          title={pendiente.aviso.titulo}
          icon={
            <i
              className={`fas ${pendiente.aviso.tono === 'warn' ? 'fa-triangle-exclamation modal-icon--warn' : 'fa-circle-info modal-icon--info'}`}
            />
          }
          onClose={() => setPendiente(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setPendiente(null)}>
                {pendiente.aviso.cancelar}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirmar()}>
                {pendiente.aviso.aceptar}
              </button>
            </>
          }
        >
          <p className="modal-clave">{pendiente.aviso.clave}</p>
          {pendiente.aviso.nota && <p className="modal-nota">{pendiente.aviso.nota}</p>}
        </Modal>
      )}

      {abriendo && (
        <ModalCargando titulo="Abriendo la obra" detalle="Leyendo los datos del tablero…" />
      )}
    </section>
  )
}
