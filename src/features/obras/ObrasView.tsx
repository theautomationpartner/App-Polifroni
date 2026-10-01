import { useEffect, useMemo, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { Modal } from '@/components/ui/Modal'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, sugerir, type EntradaIndice } from '@/lib/busquedaObras'
import {
  buscarObras,
  getIndiceObras,
  getObra,
  mondayHabilitado,
} from '@/services/monday'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { DestinoSelect } from '@/features/shared/DestinoSelect'
import { useApp, useDispatch } from '@/state/hooks'
import type { Destino, Obra, ObraFila } from '@/types'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { ObraFichaCliente } from './ObraFichaCliente'
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
/** Lo que falta mientras no hay obra: va en rojo debajo del buscador, hasta que se carga una. */
const AYUDA_SIN_OBRA = 'Buscá y cargá una obra para continuar'

export function ObrasView() {
  const dispatch = useDispatch()
  const { destino, obra: obraElegida } = useApp()

  /** Se tocó una obra sin haber contestado a quién se envía: se pide primero eso. */
  const [sinDestino, setSinDestino] = useState(false)
  /** Se intentó continuar sin contestar a quién se envía: la pregunta queda marcada en rojo. */
  const [marcarDestino, setMarcarDestino] = useState(false)
  /**
   * La obra leída de Monday, a la vista en la ficha. Todavía NO es la obra de la operación: lo es
   * recién al tocar "Continuar". Volviendo a esta etapa con el stepper, arranca en la ya elegida.
   */
  const [vista, setVista] = useState<Obra | null>(obraElegida)
  const [cargandoObra, setCargandoObra] = useState(false)
  const [sinObra, setSinObra] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState(false)

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
  const filas: { id: string; nombre: string }[] = remotos
    ? remotos.map((f) => ({ id: f.id, nombre: f.nombre }))
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
      /* Buscar es leer la obra: con UNA coincidencia se trae de Monday y se muestra en la ficha, que
         es donde se la mira antes de seguir. Con varias se despliegan para elegir; sin ninguna, se
         avisa. Nada de esto la elige todavía: eso es "Continuar". */
      if (filas.length === 1) {
        setAbierto(false)
        await abrir(filas[0].id)
      } else {
        setAbierto(filas.length > 0)
        if (filas.length === 0) setNoEncontrada(true)
      }
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

  /**
   * Lee la obra COMPLETA de Monday y la muestra en la ficha. Sin ventana en el medio: mientras se
   * consulta, la ficha queda en esqueleto en su lugar, como la del cliente de La Batea.
   */
  const abrir = async (id: string) => {
    setAbierto(false)
    setCargandoObra(true)
    setError('')
    try {
      const obra = await getObra(id)
      if (!obra) {
        setVista(null)
        setNoEncontrada(true)
        return
      }
      setVista(obra)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'buscar la obra' })
    } finally {
      setCargandoObra(false)
    }
  }

  /**
   * Continuar con la obra de la ficha. El botón queda SIEMPRE a la vista: si falta algo, la ventana
   * lo explica al tocarlo. Recién acá se valida (¿ya tiene órdenes?, ¿tiene el tipo?) y se entra.
   */
  const continuar = () => {
    if (!vista || cargandoObra) {
      setSinObra(true)
      return
    }
    if (!destino) {
      setMarcarDestino(true)
      setSinDestino(true)
      return
    }
    const aviso = validarEntrada(destino, vista)
    if (aviso) {
      setPendiente({ obra: vista, aviso })
      return
    }
    entrar(vista, destino)
  }

  /** Lo que viene después de la obra, para anticiparlo en el pie. */
  const siguiente = destino ? etiquetaPaso('carga', destino, tipoDe(vista)) : ''
  /* Sin obra no se anticipa nada en el pie: lo que falta se dice debajo del buscador, que es
     donde se resuelve. */
  const motivoBloqueo = vista && !destino ? 'Elegí a quién vas a enviarle la orden' : ''

  /**
   * Abre la obra en la pantalla de una acción. La acción va PRIMERO: `setObra` entra a la pantalla
   * de la acción que esté elegida.
   */
  const entrar = (obra: Obra, d: Destino, existente = false) => {
    /* Elegir la obra NO crea nada en el tablero: la OP nace recién cuando se carga su documento.
       Entrar a mirar una obra y salir no deja ítems vacíos. */
    if (d !== destino) dispatch({ type: 'setDestino', destino: d })
    dispatch({ type: 'setObra', obra, existente })
  }

  /** Aceptar la pregunta: se aplica lo que haya que aplicar y recién ahí se entra. */
  const confirmar = (existente = false) => {
    if (!pendiente) return
    const { obra, aviso } = pendiente
    setPendiente(null)
    if (existente) {
      entrar(obra, aviso.destino, true)
      return
    }
    /* La OP nueva arranca vacía por sí sola: el documento y las observaciones son de cada OP, así
       que no hay nada de la orden anterior que limpiar en la obra. */
    entrar(obra, aviso.destino)
  }

  /**
   * Flechas para recorrer, Enter para abrir la resaltada, Escape para replegar. Enter sale a
   * Monday SÓLO cuando no hay ninguna sugerencia para lo escrito.
   */
  const alPresionarTecla = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (buscando || cargandoObra) return
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

  /** El renglón de ayuda del buscador. Sin obra cargada —y sin otra cosa que decir— pide la obra. */
  const ayuda =
    buscado && resultados.length === 0 && !buscando
      ? 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'
      : !remotos && termino.trim() && indice.length > 0 && locales.obras.length === 0
        ? 'No está en la lista rápida. Tocá Buscar para buscarla en Monday.'
        : desplegado && !remotos && locales.truncado
          ? `Se muestran las primeras ${locales.obras.length}. Seguí escribiendo para afinar.`
          : !vista && !cargandoObra
            ? AYUDA_SIN_OBRA
            : ''

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      {/* La pregunta que decide el recorrido va ANTES de elegir la obra: de ella depende qué se
          hace en las etapas que siguen. */}
      {/* La marca roja se va sola apenas se contesta: la condición mira el destino, no un reset. */}
      <DestinoSelect falta={marcarDestino && !destino} />

      <PasoTitulo
        titulo="Seleccionar Obra"
        descripcion="Buscá y seleccioná la obra a la cual pertenece la orden de producción que querés enviar."
      />



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
              placeholder="Buscar obra por nombre"
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
            className={`search-helper ${errorInput || ayuda === AYUDA_SIN_OBRA ? 'search-helper--error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {!errorInput && ayuda === AYUDA_SIN_OBRA && <i className="fas fa-circle-exclamation search-helper-ic" aria-hidden="true" />}
            {errorInput || ayuda}
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
                  {/* Una sola forma de mostrar la obra, venga de la lista rápida o de la búsqueda
                      en Monday: el nombre y el id. */}
                  <span className="ritem-main">
                    <span className="ritem-name">{f.nombre}</span>
                  </span>
                  <span className="ritem-code">{f.id}</span>
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
          /* Leer la obra elegida (con Enter o tocando una sugerencia) es la misma espera que buscar:
             el botón muestra "Buscando..." en los dos casos. */
          disabled={buscando || cargandoObra || sinToken}
          title="Buscar directamente en Monday, por si la obra todavía no está en la lista rápida"
        >
          {buscando || cargandoObra ? (
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

      {/* La ficha se muestra SIEMPRE: en esqueleto mientras no hay obra o se consulta Monday, y
          con los datos reales al resolver la búsqueda (la `ClienteFicha` de La Batea). */}
      <ObraFichaCliente obra={cargandoObra ? null : vista} cargando={cargandoObra} />

      {/* El avance queda SIEMPRE a la vista: si falta algo, la ventana lo explica al tocarlo. */}
      <div className="actions-footer">
        <span className={`paso-siguiente ${motivoBloqueo ? 'paso-siguiente--bloqueo' : ''}`}>
          {motivoBloqueo ? (
            <>
              <i className="fas fa-circle-exclamation" /> {motivoBloqueo}
            </>
          ) : vista && siguiente ? (
            <>
              <i className="fas fa-arrow-turn-up paso-siguiente-ic" /> Siguiente: {siguiente}
            </>
          ) : null}
        </span>
        <button type="button" className="btn btn-primary" disabled={cargandoObra} onClick={continuar}>
          Continuar{siguiente ? ` a ${siguiente}` : ''} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {/* Cuando hay una búsqueda hecha, el recordatorio de abajo deja volver a abrir la lista sin
          tener que buscar otra vez. Elegir sigue siendo obligatorio: no hay ningún camino que siga
          sin una obra. */}
      {/* Sólo con varias coincidencias y ninguna cargada todavía: con la obra en la ficha, la lista
          ya no tiene nada que pedir. */}
      {buscado && resultados.length > 1 && !abierto && !vista && !cargandoObra && (
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
              {pendiente.aviso.aceptar && (
                <button type="button" className="btn btn-primary btn-marca" onClick={() => confirmar()}>
                  {pendiente.aviso.aceptar}
                </button>
              )}
              {/* El segundo camino: mandar una de las órdenes que la obra ya tiene cargadas. */}
              {pendiente.aviso.alternativa && (
                <button type="button" className="btn btn-primary btn-marca" onClick={() => confirmar(true)}>
                  {pendiente.aviso.alternativa}
                </button>
              )}
            </>
          }
        >
          <p className="modal-clave">{pendiente.aviso.clave}</p>
          {pendiente.aviso.nota && <p className="modal-nota">{pendiente.aviso.nota}</p>}
        </Modal>
      )}

      {sinDestino && (
        <AvisoModal titulo="Elegí a quién vas a enviarle la orden" onClose={() => setSinDestino(false)}>
          Contestá arriba «¿A quién vas a enviarle la orden?»: de eso depende qué se hace con la obra.
        </AvisoModal>
      )}

      {sinObra && (
        <AvisoModal titulo="Falta cargar una obra" onClose={() => setSinObra(false)}>
          Para continuar tenés que buscar y cargar una obra. Usá el buscador de arriba y volvé a
          intentar.
        </AvisoModal>
      )}

      {noEncontrada && (
        <AvisoModal titulo="Obra no encontrada" onClose={() => setNoEncontrada(false)}>
          La obra que buscaste no está en el tablero de Obras. Probá con parte del nombre o pegá el
          id del ítem.
        </AvisoModal>
      )}
    </section>
  )
}
