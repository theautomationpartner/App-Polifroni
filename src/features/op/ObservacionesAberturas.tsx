import { useCallback, useEffect, useRef, useState } from 'react'
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

  const area = useRef<HTMLTextAreaElement>(null)

  const i = Math.min(Math.max(indice, 0), aberturas.length - 1)
  const actual = aberturas[i]

  /* Las flechas ← → del teclado pasan de abertura, también mientras se escribe la observación: así
     se escribe una, flecha, y la siguiente, sin ir al mouse. El foco queda en la caja. Con otro
     campo enfocado o una ventana abierta no hacen nada: la flecha es de ese campo o de esa ventana. */
  const ultimo = useRef({ i, total: aberturas.length, onIndice })
  ultimo.current = { i, total: aberturas.length, onIndice }
  useEffect(() => {
    if (disabled) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.defaultPrevented) return
      if (document.querySelector('.modal-overlay, .modal-cargando')) return
      const t = e.target as HTMLElement | null
      if (
        t !== area.current &&
        t?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]')
      )
        return
      const { i: actualI, total, onIndice: mover } = ultimo.current
      const destino = actualI + (e.key === 'ArrowRight' ? 1 : -1)
      if (destino < 0 || destino >= total) return
      e.preventDefault()
      setAbierto(false)
      mover(destino)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [disabled])

  /* Al llegar a otra abertura escribiendo, el cursor va al final de su texto, listo para seguir. */
  useEffect(() => {
    const a = area.current
    if (a && document.activeElement === a) a.setSelectionRange(a.value.length, a.value.length)
  }, [i])

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
        ref={area}
        className="obs-area"
        value={actual.texto}
        disabled={disabled}
        placeholder={`Observación de ${rotuloAbertura(actual.nombre)}…`}
        onChange={(e) => onTexto(i, e.target.value)}
      />

      {/* Los puntos: cuántas aberturas hay y cuáles ya están escritas. Al lado, el atajo. */}
      <div className="abs-pie">
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
        {aberturas.length > 1 && (
          <span className="abs-atajo">
            <kbd>←</kbd> <kbd>→</kbd> para cambiar de abertura
          </span>
        )}
      </div>
    </div>
  )
}
