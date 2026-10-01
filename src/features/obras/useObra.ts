import { useApp } from '@/state/hooks'
import type { Obra } from '@/types'

/** La obra del estado global. Las vistas de etapa no se dibujan sin ella, así que acá ya existe. */
export function useObra(): Obra {
  const { obra } = useApp()
  if (!obra) throw new Error('No hay obra seleccionada')
  return obra
}
