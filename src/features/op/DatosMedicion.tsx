import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { getMedidores } from '@/services/monday'

/** La opción para quien no figura en el legajo. Al elegirla aparece el campo para escribirlo. */
export const OTRO = 'Otro'

export interface Medicion {
  nroOrden: string
  medidoPor: string
  /** Sólo cuando `medidoPor` es "Otro": el nombre escrito a mano. */
  medidoPorOtro: string
  /** `YYYY-MM-DD`, que es lo que maneja el `<input type="date">`. */
  fecha: string
}

/** Hoy, en la hora LOCAL. `toISOString()` daría el día de Greenwich: pasadas las 21 h, mañana. */
export function hoyLocal(): string {
  const d = new Date()
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

export const medicionInicial = (): Medicion => ({
  nroOrden: '',
  medidoPor: '',
  medidoPorOtro: '',
  fecha: hoyLocal(),
})

/**
 * Selector con buscador. Son veintitantas personas: con una lista a secas hay que leerlas todas
 * para encontrar una, y escribiendo tres letras aparece sola. "Otro" va siempre al final, fuera
 * del filtro, para que no desaparezca justo cuando el nombre buscado no está.
 */
function SelectPersona({
  id,
  valor,
  opciones,
  cargando,
  error,
  onElegir,
}: {
  id: string
  valor: string
  opciones: string[]
  cargando: boolean
  error: boolean
  onElegir: (v: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [activo, setActivo] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])
  useClickOutside(caja, cerrar, abierto)

  const filtradas = useMemo(() => {
    const q = busqueda
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
    const base = q
      ? opciones.filter((o) =>
          o.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q),
        )
      : opciones
    return [...base, OTRO]
  }, [busqueda, opciones])

  useEffect(() => {
    if (!abierto) return
    setBusqueda('')
    const i = filtradas.indexOf(valor)
    setActivo(i >= 0 ? i : 0)
    buscador.current?.focus()
    // Sólo al abrir: mientras se escribe, el activo lo maneja el teclado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  useEffect(() => setActivo(0), [busqueda])

  /* La opción marcada con el teclado siempre a la vista. */
  useEffect(() => {
    lista.current?.children[activo]?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  const elegir = (v: string) => {
    onElegir(v)
    setAbierto(false)
  }

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo((i) => Math.min(i + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtradas[activo]) elegir(filtradas[activo])
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  const deshabilitado = cargando
  return (
    <div className="med-sel" ref={caja}>
      <button
        id={id}
        type="button"
        className={`med-input med-sel-btn ${valor ? '' : 'med-sel-btn--vacio'}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        disabled={deshabilitado}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="med-sel-txt">
          {cargando ? 'Cargando personal…' : valor || 'Elegí quién midió'}
        </span>
        <i className={`fas ${cargando ? 'fa-circle-notch spin' : 'fa-chevron-down'}`} />
      </button>

      {abierto && (
        <div className="med-menu" onKeyDown={teclado}>
          <div className="med-menu-buscar">
            <i className="fas fa-magnifying-glass" />
            <input
              ref={buscador}
              type="text"
              value={busqueda}
              placeholder="Buscar por nombre…"
              aria-label="Buscar por nombre"
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          {error && (
            <p className="med-menu-nota">No se pudo traer el personal. Elegí «Otro» y escribilo.</p>
          )}
          <ul className="med-menu-lista" role="listbox" ref={lista}>
            {filtradas.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={o === valor}
                className={[
                  'med-op',
                  i === activo ? 'med-op--activo' : '',
                  o === valor ? 'med-op--elegido' : '',
                  o === OTRO ? 'med-op--otro' : '',
                ].join(' ')}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(o)}
              >
                {o === OTRO ? (
                  <>
                    <i className="fas fa-user-pen" /> Otro <span>no está en la lista</span>
                  </>
                ) : (
                  <>
                    {o}
                    {o === valor && <i className="fas fa-check" />}
                  </>
                )}
              </li>
            ))}
          </ul>
          {filtradas.length === 1 && busqueda && (
            <p className="med-menu-nota">Nadie coincide con «{busqueda}».</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Los datos de la medición: número de orden, quién midió y cuándo.
 *
 * Por ahora viven sólo en la pantalla —todavía no hay dónde guardarlos: van a ir a un tablero
 * propio—. El componente es controlado para que, cuando exista ese destino, alcance con leer el
 * estado desde la vista que lo usa.
 */
export function DatosMedicion({
  valor,
  onCambio,
  disabled = false,
}: {
  valor: Medicion
  onCambio: (v: Medicion) => void
  disabled?: boolean
}) {
  const uid = useId()
  const [personas, setPersonas] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const otroRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    getMedidores()
      .then((p) => vivo && setPersonas(p))
      .catch(() => vivo && setError(true))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [])

  const esOtro = valor.medidoPor === OTRO
  const set = (parcial: Partial<Medicion>) => onCambio({ ...valor, ...parcial })

  /* Al elegir "Otro" el foco va derecho al campo nuevo: es lo único que queda por hacer. */
  useEffect(() => {
    if (esOtro) otroRef.current?.focus()
  }, [esOtro])

  return (
    <fieldset className="med" disabled={disabled}>
      <legend className="med-t">
        <i className="fas fa-ruler-combined" /> Datos de la medición
      </legend>

      <div className="med-grid">
        <div className="med-campo">
          <label className="med-l" htmlFor={`${uid}-nro`}>
            Nro Orden Producción
          </label>
          <div className="med-conic">
            <i className="fas fa-hashtag" aria-hidden="true" />
            <input
              id={`${uid}-nro`}
              className="med-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej: 1250"
              value={valor.nroOrden}
              onChange={(e) => set({ nroOrden: e.target.value })}
            />
          </div>
        </div>

        <div className="med-campo">
          <label className="med-l" htmlFor={`${uid}-quien`}>
            Medido por
          </label>
          <SelectPersona
            id={`${uid}-quien`}
            valor={valor.medidoPor}
            opciones={personas}
            cargando={cargando}
            error={error}
            onElegir={(v) => set({ medidoPor: v, medidoPorOtro: v === OTRO ? valor.medidoPorOtro : '' })}
          />
        </div>

        <div className="med-campo">
          <label className="med-l" htmlFor={`${uid}-fecha`}>
            Fecha de medición
          </label>
          <div className="med-conic">
            <i className="fas fa-calendar-day" aria-hidden="true" />
            <input
              id={`${uid}-fecha`}
              className="med-input med-fecha"
              type="date"
              max={hoyLocal()}
              value={valor.fecha}
              /* Abre el almanaque al hacer click en cualquier parte del campo, no sólo en el
                 iconito: así nadie tiene que escribir la fecha. */
              onClick={(e) => e.currentTarget.showPicker?.()}
              onChange={(e) => set({ fecha: e.target.value })}
            />
          </div>
        </div>
      </div>

      {esOtro && (
        <div className="med-campo med-otro">
          <label className="med-l" htmlFor={`${uid}-otro`}>
            Observación
            <span className="med-l-sub">quién midió, si no está en la lista</span>
          </label>
          <input
            ref={otroRef}
            id={`${uid}-otro`}
            className="med-input"
            type="text"
            autoComplete="off"
            placeholder="Nombre y apellido de quien midió"
            value={valor.medidoPorOtro}
            onChange={(e) => set({ medidoPorOtro: e.target.value })}
          />
        </div>
      )}
    </fieldset>
  )
}
