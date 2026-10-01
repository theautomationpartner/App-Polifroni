import { useEffect } from 'react'
import { useDispatch } from '@/state/hooks'

/**
 * Publica en el estado global que hay algo corriendo —una generación, un envío— para que el resto
 * de la app no deje salir a mitad de camino: el selector de acción, la marca y el cambio de obra
 * se frenan mientras dure. Es el mismo mecanismo de La Batea.
 *
 * La marca se baja sola al terminar y también si la vista se desmonta: una bandera que queda
 * prendida dejaría la app trabada.
 */
export function useAccionEnCurso(motivo: string, activo: boolean) {
  const dispatch = useDispatch()
  useEffect(() => {
    if (!activo) return
    dispatch({ type: 'setAccionEnCurso', motivo })
    return () => dispatch({ type: 'setAccionEnCurso', motivo: null })
  }, [motivo, activo, dispatch])
}
