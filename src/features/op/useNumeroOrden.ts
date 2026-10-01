import { useEffect, useState } from 'react'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'
import { proximoNumero } from './ordenDeObra'

/**
 * El número que le toca a la OP, cargado en el borrador para que el campo "Nro Orden" arranque
 * lleno. Sólo se pide si el campo está vacío y nadie lo escribió a mano: volver a la etapa no lo
 * vuelve a pedir ni pisa uno corregido con el lápiz.
 */
export function useNumeroOrden(obra: Obra) {
  const { borrador } = useApp()
  const dispatch = useDispatch()
  const [cargando, setCargando] = useState(!borrador.medicion.nroOrden)
  const [error, setError] = useState(false)
  const falta = !borrador.medicion.nroOrden && !borrador.medicion.nroEditado

  useEffect(() => {
    if (!falta) {
      setCargando(false)
      return
    }
    let vivo = true
    setCargando(true)
    void proximoNumero(obra)
      .then((n) => {
        if (!vivo) return
        setError(!n)
        if (n) {
          dispatch({ type: 'setBorrador', cambios: { medicion: { ...borrador.medicion, nroOrden: n } } })
        }
      })
      .catch(() => vivo && setError(true))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
    // Una vez por obra: el resto lo maneja el campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  return { cargando, error }
}
