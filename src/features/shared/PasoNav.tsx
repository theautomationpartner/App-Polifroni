import { useCallback } from 'react'
import { getObra } from '@/services/monday'
import { PASOS, indiceDe } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra, Paso } from '@/types'

/**
 * Relee la obra del tablero y la vuelca en el estado global.
 *
 * Se usa después de CADA escritura y de cada escenario de Make: lo que vale es lo que quedó en
 * Monday, no lo que la app cree haber dejado. Devuelve la obra fresca por si quien la pidió
 * necesita mirarla en el acto.
 */
export function useRefrescarObra(): () => Promise<Obra | null> {
  const { obra } = useApp()
  const dispatch = useDispatch()
  const id = obra?.id

  return useCallback(async () => {
    if (!id) return null
    const fresca = await getObra(id)
    if (fresca) dispatch({ type: 'refrescarObra', obra: fresca })
    return fresca
  }, [dispatch, id])
}

interface PasoNavProps {
  /** Texto del botón que avanza. Sin `siguiente`, sólo se dibuja el de volver. */
  siguiente?: string
  /** Bloquea el avance (todavía falta algo). El motivo va en `nota`. */
  bloqueado?: boolean
  /** Por qué no se puede avanzar, o qué conviene hacer antes. */
  nota?: string
  /**
   * Se ejecuta al tocar "siguiente", ANTES de navegar.
   *
   * Devolver `false` frena la navegación: el paso se queda a cargo de ella. Lo usa la etapa que
   * necesita preguntar algo antes de dejar pasar —o guardar primero y navegar después—, que es
   * algo que no se puede hacer si el pie navega igual apenas se lo llama.
   */
  onSiguiente?: () => boolean | void
}

/** Pie de cada etapa: volver a la anterior y avanzar a la siguiente. */
export function PasoNav({ siguiente, bloqueado = false, nota, onSiguiente }: PasoNavProps) {
  const { paso } = useApp()
  const dispatch = useDispatch()
  const idx = indiceDe(paso)
  const anterior: Paso | undefined = PASOS[idx - 1]
  const proximo: Paso | undefined = PASOS[idx + 1]

  return (
    <div className="paso-nav">
      <button
        type="button"
        className="btn btn-out btn-volver"
        onClick={() => anterior && dispatch({ type: 'goto', paso: anterior })}
        disabled={!anterior}
      >
        <i className="fas fa-arrow-left" /> Volver
      </button>

      <div className="paso-nav-right">
        {nota && <span className="paso-nav-nota">{nota}</span>}
        {siguiente && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={bloqueado || !proximo}
            onClick={() => {
              if (onSiguiente?.() === false) return
              if (proximo) dispatch({ type: 'goto', paso: proximo })
            }}
          >
            {siguiente} <i className="fas fa-arrow-right" />
          </button>
        )}
      </div>
    </div>
  )
}
