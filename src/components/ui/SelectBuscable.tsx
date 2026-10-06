import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export interface OpcionBuscable {
  valor: string
  texto: string
}

/**
 * El desplegable de los formularios de la app: el mismo de "Medido por" (`SelectPersona` de
 * `DatosMedicion`), con su botón, su chevron, el buscador arriba de la lista y el teclado (flechas,
 * Enter, Escape). Dentro de una `carga-grid` toma los colores de la marca.
 *
 * Se usa en lugar del `<select>` nativo, que dibuja la flecha del navegador y no sigue el diseño.
 */
export function SelectBuscable({
  id,
  valor,
  opciones,
  placeholder,
  cargando = false,
  textoCargando = 'Cargando…',
  disabled = false,
  falta = false,
  onElegir,
}: {
  id: string
  valor: string
  opciones: readonly OpcionBuscable[]
  placeholder: string
  cargando?: boolean
  textoCargando?: string
  disabled?: boolean
  /** Falta elegir: el borde rojo de los campos obligatorios. */
  falta?: boolean
  onElegir: (valor: string) => void
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
    const q = sinTildes(busqueda)
    return q ? opciones.filter((o) => sinTildes(o.texto).includes(q)) : [...opciones]
  }, [busqueda, opciones])

  useEffect(() => {
    if (!abierto) return
    setBusqueda('')
    const i = opciones.findIndex((o) => o.valor === valor)
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
      if (filtradas[activo]) elegir(filtradas[activo].valor)
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  const elegido = opciones.find((o) => o.valor === valor)

  return (
    <div className={`med-sel ${falta ? 'med-sel--falta' : ''}`} ref={caja}>
      <button
        id={id}
        type="button"
        className={`med-input med-sel-btn ${elegido ? '' : 'med-sel-btn--vacio'}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-invalid={falta || undefined}
        disabled={disabled || cargando}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="med-sel-txt">{cargando ? textoCargando : (elegido?.texto ?? placeholder)}</span>
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
              placeholder="Buscar…"
              aria-label="Buscar"
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <ul className="med-menu-lista" role="listbox" ref={lista}>
            {filtradas.map((o, i) => (
              <li
                key={o.valor}
                role="option"
                aria-selected={o.valor === valor}
                className={['med-op', i === activo ? 'med-op--activo' : '', o.valor === valor ? 'med-op--elegido' : ''].join(' ')}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(o.valor)}
              >
                {o.texto}
                {o.valor === valor && <i className="fas fa-check" />}
              </li>
            ))}
          </ul>
          {filtradas.length === 0 && <p className="med-menu-nota">Nada coincide con «{busqueda}».</p>}
        </div>
      )}
    </div>
  )
}
