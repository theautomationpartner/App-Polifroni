import { useEffect, useMemo, useRef, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useTitulos } from '@/features/shared/useTitulos'
import { indexar, sugerir, type EntradaIndice } from '@/lib/busquedaObras'
import {
  buscarObras,
  getIndiceObras,
  getObra,
  guardarObservaciones,
  mondayHabilitado,
} from '@/services/monday'
import { COL } from '@/services/monday/columns'
import { ACCIONES_PASO } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra, ObraFila, Paso } from '@/types'
import { iniciarOrdenDeObra } from '@/features/op/ordenDeObra'
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
  /** Término con el que se consultó Monday (botón Buscar). Vacío = no se consultó. */
  const [buscado, setBuscado] = useState('')
  /**
   * Lo que trajo la consulta DIRECTA a Monday. `null` = no se consultó, y entonces manda el
   * buscador rápido. Distinguir "no busqué" de "busqué y no hay" es lo que evita que la lista
   * rápida tape un "no encontrado" que se acaba de pedir.
   */
  const [remotos, setRemotos] = useState<ObraFila[] | null>(null)
  const resultados = remotos ?? []
  /** El índice del buscador rápido (id + nombre de cada obra), bajado una vez por sesión. */
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  /** El desplegable está abierto. Se cierra eligiendo, con Escape o tocando afuera. */
  const [abierto, setAbierto] = useState(false)
  /** Fila resaltada: la que abre el Enter. Arranca en la mejor coincidencia. */
  const [activo, setActivo] = useState(0)
  /** El resaltado se mueve con el teclado: el mouse quieto no se lo roba al scrollear la lista. */
  const conTeclado = useRef(false)
  const listaRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    let vivo = true
    getIndiceObras()
      .then((obras) => vivo && setIndice(indexar(obras)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  /* Buscador rápido: se rearma en cada tecla sobre el índice en memoria, sin un pedido de red. */
  const locales = useMemo(() => sugerir(indice, termino), [indice, termino])
  /** Lo que se ve en la lista: lo de Monday si se apretó Buscar, las sugerencias si no. */
  const filas: { id: string; nombre: string; fila?: ObraFila }[] = remotos
    ? remotos.map((f) => ({ id: f.id, nombre: f.nombre, fila: f }))
    : locales.obras
  const desplegado = abierto && filas.length > 0
  const indiceActivo = filas.length > 0 ? Math.min(activo, filas.length - 1) : -1

  useEffect(() => setActivo(0), [termino, remotos])

  /* La fila resaltada, siempre a la vista. A mano y no con `scrollIntoView`, que movería la página. */
  useEffect(() => {
    if (!desplegado || indiceActivo < 0) return
    const cont = listaRef.current
    const fila = cont?.children[indiceActivo] as HTMLElement | undefined
    if (!cont || !fila) return
    const c = cont.getBoundingClientRect()
    const f = fila.getBoundingClientRect()
    if (f.top < c.top) cont.scrollTop -= c.top - f.top
    else if (f.bottom > c.bottom) cont.scrollTop += f.bottom - c.bottom
  }, [desplegado, indiceActivo])

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
      setRemotos(filas)
      setBuscado(texto)
      /* Se abre SIEMPRE, incluso con una sola coincidencia. Abrir la única sin preguntar ahorra un
         click y a cambio arranca el proceso sobre una obra que nadie llegó a mirar. */
      setAbierto(filas.length > 0)
    } catch {
      setError('No se pudo buscar en Monday. Probá de nuevo en unos segundos.')
      setRemotos([])
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
    setRemotos(null)
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
    /* Elegir la obra para emitir —"Generar una nueva", o una obra que todavía no tiene OP— crea
       SIEMPRE una OP nueva en el tablero de órdenes. Arranca acá, en el click, y la etapa la toma
       cuando se abre. */
    if (paso === 'etmo') void iniciarOrdenDeObra(obra).catch(() => {})
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
      /* La Orden HETMO ya no vive en la obra: cada OP tiene la suya. Sólo se vacían las
         observaciones, que son las de la orden anterior. */
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

  /**
   * Flechas para recorrer, Enter para abrir la resaltada, Escape para replegar. Enter sale a
   * Monday SÓLO cuando no hay ninguna sugerencia para lo escrito.
   */
  const alPresionarTecla = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (buscando || abriendo) return
    const navegar = (delta: number) => {
      if (filas.length === 0) return
      e.preventDefault()
      conTeclado.current = true
      if (!abierto) {
        setAbierto(true)
        return
      }
      setActivo((i) => Math.min(filas.length - 1, Math.max(0, i + delta)))
    }
    if (e.key === 'ArrowDown') return navegar(1)
    if (e.key === 'ArrowUp') return navegar(-1)
    if (e.key === 'Escape' && abierto) {
      e.preventDefault()
      setAbierto(false)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const marcada = desplegado && indiceActivo >= 0 ? filas[indiceActivo] : null
      if (marcada) void abrir(marcada.id)
      else onBuscar()
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo titulo="Seleccionar Obra" />

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

      {/* El teclado cuelga del contenedor y no del campo: apretar Buscar con el mouse deja el foco
          en el botón, y desde ahí un manejador puesto en el input no se enteraría de nada. */}
      <div className="card unified-toolbar" onKeyDown={alPresionarTecla}>
        <div className="search-container" ref={caja}>
          <div className={`search-wrapper ${desplegado ? 'search-wrapper--abierto' : ''}`}>
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
              role="combobox"
              aria-expanded={desplegado}
              aria-controls="obras-listbox"
              aria-activedescendant={desplegado && indiceActivo >= 0 ? `obra-op-${indiceActivo}` : undefined}
              onChange={(e) => {
                setTermino(e.target.value)
                if (errorInput) setErrorInput('')
                /* Editar descarta lo que trajo Monday: lo que se ve vuelve a ser la sugerencia
                   sobre lo nuevo que se está escribiendo. */
                setRemotos(null)
                setBuscado('')
                setAbierto(true)
              }}
              onFocus={() => setAbierto(true)}
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
                ? 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'
                : !remotos && termino.trim() && indice.length > 0 && locales.obras.length === 0
                  ? 'No está en la lista rápida. Tocá Buscar para buscarla en Monday.'
                  : desplegado && !remotos && locales.truncado
                    ? `Se muestran las primeras ${locales.obras.length}. Seguí escribiendo para afinar.`
                    : '')}
          </span>

          {desplegado && (
            <div
              className="results"
              role="listbox"
              id="obras-listbox"
              ref={listaRef}
              onMouseMove={() => {
                conTeclado.current = false
              }}
            >
              {filas.map((f, i) => (
                <button
                  key={f.id}
                  id={`obra-op-${i}`}
                  type="button"
                  className={`ritem ${i === indiceActivo ? 'ritem--activo' : ''}`}
                  role="option"
                  aria-selected={i === indiceActivo}
                  onClick={() => void abrir(f.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    if (!conTeclado.current) setActivo(i)
                  }}
                >
                  <span className="ritem-main">
                    <span className="ritem-name">{f.nombre}</span>
                    {f.fila && (
                      <span className="ritem-sub">
                        <span>
                          <i className="fas fa-hashtag" /> {f.fila.idObra || f.id}
                        </span>
                        {f.fila.cliente && (
                          <span>
                            <i className="fas fa-user" /> {f.fila.cliente}
                          </span>
                        )}
                        {f.fila.ubicacion && (
                          <span>
                            <i className="fas fa-location-dot" /> {f.fila.ubicacion}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {f.fila ? (
                    <span className="ritem-chips">
                      <EstadoBadge label={titulo(COL.tipo, 'Tipo')} estado={f.fila.tipo} />
                      <EstadoBadge
                        label={titulo(COL.etapaProduccion, 'Etapa de Produccion')}
                        estado={f.fila.etapaProduccion}
                      />
                    </span>
                  ) : (
                    <span className="ritem-code">{f.id}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* El botón dejó de ser el único camino: es la salida para la obra que la lista rápida
            todavía no tiene (dada de alta hace un rato). */}
        <button
          type="button"
          className="btn-buscar"
          onClick={onBuscar}
          disabled={buscando || sinToken}
          title="Buscar directamente en Monday, por si la obra todavía no está en la lista rápida"
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
              Empezá a escribir el nombre y elegí la obra de la lista.
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
