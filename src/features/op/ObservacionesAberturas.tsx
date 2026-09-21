import { useCallback, useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { rotuloAbertura, type Abertura } from './observaciones'

interface Props {
  aberturas: Abertura[]
  /** Cuál se está editando. */
  indice: number
  onIndice: (i: number) => void
  onTexto: (i: number, texto: string) => void
  disabled?: boolean
}

/**
 * Las observaciones, de a una abertura por vez.
 *
 * El documento puede traer diez dibujos: diez cajas abiertas a la vez obligan a barrer la pantalla
 * para encontrar la que se está por escribir. Se muestra una, y para moverse hay las tres formas
 * que se usan sin pensar: las flechas, el desplegable con la lista, y los puntos —que además dicen
 * de un vistazo cuáles ya tienen observación y cuáles no—.
 */
export function ObservacionesAberturas({
  aberturas,
  indice,
  onIndice,
  onTexto,
  disabled = false,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])
  useClickOutside(ref, cerrar, abierto)

  const i = Math.min(Math.max(indice, 0), aberturas.length - 1)
  const actual = aberturas[i]
  if (!actual) return null

  const ir = (destino: number) => {
    setAbierto(false)
    onIndice(Math.min(Math.max(destino, 0), aberturas.length - 1))
  }

  return (
    <div className="abs">
      <div className="abs-nav">
        <button
          type="button"
          className="abs-flecha"
          aria-label="Abertura anterior"
          disabled={i === 0}
          onClick={() => ir(i - 1)}
        >
          <i className="fas fa-chevron-left" />
        </button>

        <div className="abs-sel" ref={ref}>
          <button
            type="button"
            className="abs-sel-btn"
            aria-haspopup="listbox"
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
          >
            <span className="abs-sel-t">{rotuloAbertura(actual.nombre)}</span>
            <span className="abs-sel-x">
              {i + 1} de {aberturas.length}
            </span>
            <i className="fas fa-chevron-down" />
          </button>

          {abierto && (
            <div className="abs-menu" role="listbox">
              {aberturas.map((a, n) => (
                <div
                  key={`${a.nombre}-${n}`}
                  role="option"
                  aria-selected={n === i}
                  className={`abs-op ${n === i ? 'abs-op--act' : ''}`}
                  onClick={() => ir(n)}
                >
                  <span className="abs-op-t">{rotuloAbertura(a.nombre)}</span>
                  {a.texto.trim() ? (
                    <i className="fas fa-circle-check abs-op-ok" />
                  ) : (
                    <span className="abs-op-vacio">sin observación</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="abs-flecha"
          aria-label="Abertura siguiente"
          disabled={i === aberturas.length - 1}
          onClick={() => ir(i + 1)}
        >
          <i className="fas fa-chevron-right" />
        </button>
      </div>

      <textarea
        className="obs-area"
        value={actual.texto}
        disabled={disabled}
        placeholder={`Observación de ${rotuloAbertura(actual.nombre)}…`}
        onChange={(e) => onTexto(i, e.target.value)}
      />

      {/* Los puntos: cuántas aberturas hay y cuáles ya están escritas. */}
      <div className="abs-puntos">
        {aberturas.map((a, n) => (
          <button
            key={`p-${a.nombre}-${n}`}
            type="button"
            title={rotuloAbertura(a.nombre)}
            aria-label={rotuloAbertura(a.nombre)}
            className={`abs-punto ${a.texto.trim() ? 'abs-punto--lleno' : ''} ${
              n === i ? 'abs-punto--act' : ''
            }`}
            onClick={() => ir(n)}
          />
        ))}
      </div>
    </div>
  )
}
