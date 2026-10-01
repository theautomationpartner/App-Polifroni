import { useCallback } from 'react'
import { getObra } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'

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
