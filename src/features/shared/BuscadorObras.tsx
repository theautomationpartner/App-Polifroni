import { useEffect, useMemo, useRef, useState } from 'react'
import { sugerir, type EntradaIndice } from '@/lib/busquedaObras'

/** Una obra en el desplegable: el nombre y el id. */
export interface ObraEncontrada {
  id: string
  nombre: string
}

interface Opciones {
  /** El índice del buscador rápido (ver `indexar`). Vacío: sólo busca con el botón. */
  indice: readonly EntradaIndice[]
  /** El botón Buscar: lo que trae Monday para lo escrito. */
  buscarRemoto: (texto: string) => Promise<ObraEncontrada[]>
  /** Leer la obra elegida (con Enter, tocándola o como única coincidencia). */
  abrir: (id: string) => Promise<void>
  /** La búsqueda de Monday no trajo nada. */
  onSinResultados: () => void
  /** Qué pedir cuando se busca con el campo vacío. */
  pedidoVacio: string
}

/**
 * El buscador de obras: el estado y el teclado, compartidos por "Enviar" y "Consultar" para que los
 * dos se comporten igual. Lo que se ve lo dibuja `BuscadorObras`.
 *
 * Mientras se escribe, sugiere desde el índice en memoria, sin pedidos de red. El botón Buscar va a
 * Monday —para la obra que el índice todavía no tiene—: con UNA coincidencia la abre; con varias las
 * despliega para elegir; sin ninguna, avisa. Elegir es obligatorio: nada sigue sin una obra.
 */
export function useBuscadorObras({ indice, buscarRemoto, abrir, onSinResultados, pedidoVacio }: Opciones) {
  const [termino, setTermino] = useState('')
  const [errorInput, setErrorInput] = useState('')
  /** Término con el que se consultó Monday (botón Buscar). Vacío = no se consultó. */
  const [buscado, setBuscado] = useState('')
  /**
   * Lo que trajo la consulta DIRECTA a Monday. `null` = no se consultó, y entonces manda el
   * buscador rápido. Distinguir "no busqué" de "busqué y no hay" es lo que evita que la lista
   * rápida tape un "no encontrado" que se acaba de pedir.
   */
  const [remotos, setRemotos] = useState<ObraEncontrada[] | null>(null)
  /** El desplegable está abierto. Se cierra eligiendo, con Escape o tocando afuera. */
  const [abierto, setAbierto] = useState(false)
  /** Fila resaltada: la que abre el Enter. Arranca en la mejor coincidencia. */
  const [activo, setActivo] = useState(0)
  /** El resaltado se mueve con el teclado: el mouse quieto no se lo roba al scrollear la lista. */
  const conTeclado = useRef(false)
  const listaRef = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')

  /* Buscador rápido: se rearma en cada tecla sobre el índice en memoria, sin un pedido de red. */
  const locales = useMemo(() => sugerir(indice, termino), [indice, termino])
  /** Lo que se ve en la lista: lo de Monday si se apretó Buscar, las sugerencias si no. */
  const filas: ObraEncontrada[] = remotos ?? locales.obras
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

  /* Tocar afuera cierra, pero NO elige: lo buscado sigue ahí y el desplegable se vuelve a abrir.
     Cerrar no es descartar. */
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

  const elegir = async (id: string) => {
    setAbierto(false)
    await abrir(id)
  }

  const buscar = async (texto: string) => {
    setError('')
    setBuscando(true)
    try {
      const encontradas = await buscarRemoto(texto)
      setRemotos(encontradas)
      setBuscado(texto)
      if (encontradas.length === 1) {
        setAbierto(false)
        await abrir(encontradas[0].id)
      } else {
        setAbierto(encontradas.length > 0)
        if (encontradas.length === 0) onSinResultados()
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
      setErrorInput(pedidoVacio)
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

  const escribir = (valor: string) => {
    setTermino(valor)
    if (errorInput) setErrorInput('')
    /* Editar descarta lo que trajo Monday: lo que se ve vuelve a ser la sugerencia sobre lo nuevo
       que se está escribiendo. */
    setRemotos(null)
    setBuscado('')
    setAbierto(true)
  }

  /**
   * Flechas para recorrer, Enter para abrir la resaltada, Escape para replegar. Enter sale a Monday
   * SÓLO cuando no hay ninguna sugerencia para lo escrito. `ocupado`: se está leyendo una obra.
   */
  const alPresionarTecla = (e: React.KeyboardEvent<HTMLDivElement>, ocupado: boolean) => {
    if (buscando || ocupado) return
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
      if (marcada) void elegir(marcada.id)
      else onBuscar()
    }
  }

  return {
    termino,
    escribir,
    errorInput,
    buscado,
    remotos,
    /** Lo que trajo el botón Buscar (vacío si no se buscó). */
    resultados: remotos ?? [],
    locales,
    filas,
    abierto,
    setAbierto,
    desplegado,
    indiceActivo,
    setActivo,
    conTeclado,
    listaRef,
    caja,
    buscando,
    error,
    elegir,
    onBuscar,
    limpiar,
    alPresionarTecla,
  }
}

export type Buscador = ReturnType<typeof useBuscadorObras>

/**
 * El renglón de ayuda del buscador, según lo que pasó. `sinObra` es lo que se pide mientras no hay
 * una obra cargada (va en rojo).
 */
export function ayudaDe(b: Buscador, indiceListo: boolean, hayObra: boolean, sinObra: string): string {
  if (b.buscado && b.resultados.length === 0 && !b.buscando) return 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'
  if (!b.remotos && b.termino.trim() && indiceListo && b.locales.obras.length === 0)
    return 'No está en la lista rápida. Tocá Buscar para buscarla en Monday.'
  if (b.desplegado && !b.remotos && b.locales.truncado)
    return `Se muestran las primeras ${b.locales.obras.length}. Seguí escribiendo para afinar.`
  return hayObra ? '' : sinObra
}

/**
 * La barra del buscador de obras (la de La Batea): el campo con su desplegable, el renglón de ayuda
 * y el botón Buscar. El teclado cuelga del contenedor y no del campo: apretar Buscar con el mouse
 * deja el foco en el botón, y desde ahí un manejador puesto en el input no se enteraría de nada.
 */
export function BuscadorObras({
  b,
  placeholder,
  ayuda,
  ayudaEnRojo,
  deshabilitado = false,
  ocupado = false,
  tituloBuscar = 'Buscar directamente en Monday, por si la obra todavía no está en la lista rápida',
}: {
  b: Buscador
  placeholder: string
  /** El tooltip del botón Buscar: qué se busca (la Agenda busca clientes, no obras). */
  tituloBuscar?: string
  ayuda: string
  /** La ayuda es lo que falta para seguir: va en rojo, con su ícono. */
  ayudaEnRojo: boolean
  deshabilitado?: boolean
  /** Se está leyendo la obra elegida: el botón muestra "Buscando..." igual que al buscar. */
  ocupado?: boolean
}) {
  return (
    <div className="card unified-toolbar" onKeyDown={(e) => b.alPresionarTecla(e, ocupado)}>
      <div className="search-container" ref={b.caja}>
        <div className={`search-wrapper ${b.desplegado ? 'search-wrapper--abierto' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder={placeholder}
            autoComplete="off"
            value={b.termino}
            disabled={deshabilitado}
            role="combobox"
            aria-expanded={b.desplegado}
            aria-controls="obras-listbox"
            aria-activedescendant={b.desplegado && b.indiceActivo >= 0 ? `obra-op-${b.indiceActivo}` : undefined}
            onChange={(e) => b.escribir(e.target.value)}
            onFocus={() => b.setAbierto(true)}
          />
        </div>
        {/* El renglón se monta siempre: reserva su lugar para que el error no empuje lo de abajo. */}
        <span
          className={`search-helper ${b.errorInput || ayudaEnRojo ? 'search-helper--error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {!b.errorInput && ayudaEnRojo && <i className="fas fa-circle-exclamation search-helper-ic" aria-hidden="true" />}
          {b.errorInput || ayuda}
        </span>

        {b.desplegado && (
          <div
            className="results"
            role="listbox"
            id="obras-listbox"
            ref={b.listaRef}
            onMouseMove={() => {
              b.conTeclado.current = false
            }}
          >
            {b.filas.map((f, i) => (
              <button
                key={f.id}
                id={`obra-op-${i}`}
                type="button"
                className={`ritem ${i === b.indiceActivo ? 'ritem--activo' : ''}`}
                role="option"
                aria-selected={i === b.indiceActivo}
                onClick={() => void b.elegir(f.id)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  if (!b.conTeclado.current) b.setActivo(i)
                }}
              >
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
        onClick={b.onBuscar}
        disabled={b.buscando || ocupado || deshabilitado}
        title={tituloBuscar}
      >
        {b.buscando || ocupado ? (
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
  )
}
