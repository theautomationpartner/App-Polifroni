import { useCallback } from 'react'
import { registrarEnvioLocal } from '@/features/op/registrarEnvioLocal'
import type { TextosFinalizar } from '@/features/shared/FinalizarOperacion'
import { useApp, useDispatch } from '@/state/hooks'
import { registrarEdicion } from './registrarEdicion'

/** Lo que dicen el cierre de la edición y sus ventanas (`FinalizarOperacion`). */
export const TEXTOS_FINALIZAR_EDICION: TextosFinalizar = {
  enviado: 'Orden editada y enviada',
  sinEnviar: 'Orden editada',
  preguntaTitulo: 'La orden nueva todavía no se envió',
  pregunta:
    'La orden nueva ya quedó registrada con el mismo estado de la anterior, pero no le llegó a nadie. Si está «Generada Pend de Enviar», podés enviarla después desde «Consultar órdenes de producción» con «Completar Carga».',
  registrando: 'Registrando el envío en el sistema...',
  registrandoDetalle: 'Dejamos constancia del envío en la orden nueva. Esperá unos segundos.',
  errorTitulo: 'No se pudo registrar la orden editada',
  error:
    'Monday no respondió al intentar registrar la edición. Reintentá en unos segundos con «Finalizar Edición»: se completa la misma orden nueva, no se crea otra. Si la falla persiste, contactate con el soporte de TAP.',
}

/**
 * El cierre de la edición, para `FinalizarOperacion`. La OP nueva ya quedó registrada al generar la
 * OP final (si eso falló, se registra acá). Con el envío confirmado (lo dejó `EnviarOp` en el
 * borrador), se registra el envío en la OP nueva; sin enviar, no hay nada más que escribir.
 */
export function useRegistrarEdicion(): () => Promise<void> {
  const { edicion, enviado, borrador } = useApp()
  const dispatch = useDispatch()
  return useCallback(async () => {
    const id =
      edicion.nuevaId ??
      (await registrarEdicion(edicion, (nueva) => dispatch({ type: 'setEdicion', cambios: { nuevaId: nueva } })))
    if (!edicion.nuevaId) dispatch({ type: 'setEdicion', cambios: { nuevaId: id } })
    if (enviado && borrador.envio && edicion.obra) await registrarEnvioLocal(edicion.obra, id, borrador.envio)
  }, [edicion, enviado, borrador.envio, dispatch])
}

let url: string | null = null
/** Abre el PDF (todavía en la app) en otra pestaña. */
export function verPdf(archivo: File): void {
  if (url) URL.revokeObjectURL(url)
  url = URL.createObjectURL(archivo)
  window.open(url, '_blank', 'noopener')
}
