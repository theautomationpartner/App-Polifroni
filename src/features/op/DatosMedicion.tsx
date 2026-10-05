import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { getMedidores } from '@/services/monday'

/** La opción para quien no figura en el legajo. Al elegirla aparece el campo para escribirlo. */
export const OTRO = 'Otro'
/** Cuando midió el propio cliente: va al final, junto a "Otro", fuera del legajo. */
export const CLIENTE = 'Cliente'
/** Las opciones fijas del final de la lista, siempre visibles aunque se filtre. */
const FIJAS = [CLIENTE, OTRO]

export interface Medicion {
  nroOrden: string
  /** Se tocó el lápiz y se escribió un número a mano: el automático ya no lo pisa. */
  nroEditado: boolean
  medidoPor: string
  /** Aclaración de la medición. Con "Otro", es donde se escribe quién midió. */
  observacion: string
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
  nroEditado: false,
  medidoPor: '',
  observacion: '',
  fecha: hoyLocal(),
})

/**
 * Selector con buscador. Son veintitantas personas: con una lista a secas hay que leerlas todas
 * para encontrar una, y escribiendo tres letras aparece sola. "Cliente" y "Otro" van siempre al final, fuera
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
    return [...base.filter((o) => !FIJAS.includes(o)), ...FIJAS]
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
                  FIJAS.includes(o) ? 'med-op--otro' : '',
                  o === FIJAS[0] ? 'med-op--primera-fija' : '',
                ].join(' ')}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(o)}
              >
                {o === OTRO ? (
                  <>
                    <i className="fas fa-user-pen" /> Otro <span>no está en la lista</span>
                  </>
                ) : o === CLIENTE ? (
                  <>
                    <i className="fas fa-user-pen" /> Cliente <span>lo midió el cliente</span>
                    {o === valor && <i className="fas fa-check" />}
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
          {filtradas.length === FIJAS.length && busqueda && (
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
 * El componente es controlado: la vista que lo usa (el paso ETMO) lee el estado al generar y lo
 * vuelca en la OP del tablero de órdenes.
 */
export function DatosMedicion({
  valor,
  onCambio,
  disabled = false,
  numeroCargando = false,
  numeroError = false,
}: {
  valor: Medicion
  onCambio: (v: Medicion) => void
  disabled?: boolean
  /** Se está leyendo el próximo número de la numeración. */
  numeroCargando?: boolean
  /** No se pudo leer: el campo queda abierto para escribirlo a mano. */
  numeroError?: boolean
}) {
  const uid = useId()
  const [personas, setPersonas] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const otroRef = useRef<HTMLTextAreaElement>(null)
  /* El número es INFORMATIVO: lo calcula la numeración (el siguiente al último emitido de su tipo)
     y no se edita. Sin número —no se pudo leer— el campo lo dice, en vez de abrirse a mano. */

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
  const hayPersona = !!valor.medidoPor
  const set = (parcial: Partial<Medicion>) => onCambio({ ...valor, ...parcial })

  /* Con "Otro" el foco va derecho a la Observación: ahí se escribe quién midió. */
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
          <div className="med-conic med-nro med-nro--fijo">
            <i className="fas fa-hashtag" aria-hidden="true" />
            <input
              id={`${uid}-nro`}
              className="med-input"
              type="text"
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              placeholder={numeroCargando ? 'Calculando…' : numeroError ? 'No se pudo calcular' : ''}
              value={valor.nroOrden}
              title="Número automático: el siguiente al último emitido. No se edita."
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
            onElegir={(v) => set({ medidoPor: v })}
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

      {/* La Observación aparece apenas se elige quién midió: es la aclaración de ESA medición.
          Con "Otro" pasa a ser obligatoria de hecho, porque es donde se dice quién fue. */}
      {hayPersona && (
        <div className="med-campo med-otro">
          <label className="med-l" htmlFor={`${uid}-obs`}>
            Observación
            <span className="med-l-sub">
              {esOtro ? 'escribí quién midió y cualquier aclaración' : 'aclaración de la medición (opcional)'}
            </span>
          </label>
          <textarea
            ref={otroRef}
            id={`${uid}-obs`}
            className="med-input med-area"
            rows={1}
            placeholder={
              esOtro ? 'Nombre y apellido de quien midió, y lo que haya que aclarar' : 'Ej: medida tomada con el revoque grueso'
            }
            value={valor.observacion}
            onChange={(e) => {
              /* Arranca en un renglón y crece con lo que se escribe: no ocupa lugar hasta que
                 hace falta. */
              e.currentTarget.style.height = 'auto'
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`
              set({ observacion: e.target.value })
            }}
          />
        </div>
      )}
    </fieldset>
  )
}
