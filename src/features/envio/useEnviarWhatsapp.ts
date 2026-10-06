import { useCallback, useRef, useState } from 'react'
import { htmlATexto } from '@/lib/texto'
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

/** Un destinatario, como lo arma la pantalla de envío. */
export interface DestinoWsp {
  tipo: string
  nombre: string
  whatsapp: string
  confirmador: boolean
  /** Presupuesto: el texto que se le manda a este destinatario (lo arma la app). */
  texto?: string
}

export interface PedidoWsp {
  destinos: DestinoWsp[]
  reenvio: boolean
  /** La OP del tablero. En una orden nueva es `null`: la OP nace al finalizar. */
  ordenId: string | null
  obraId: string
  numero: string
  tipo: string
  /** Qué documento sale. Sin él, la Orden de Producción. */
  documento?: 'presupuesto'
  /**
   * La clave (UUID) del enlace de confirmación (`nuevaClave`). El servidor arma con ella el enlace
   * firmado, y queda guardada en `🤖Clave Confirmacion` de la OP o del presupuesto.
   */
  clave: string
}

export type FaseWsp = 'idle' | 'corriendo' | 'listo' | 'error'

/** Lo que devuelve el envío cuando sale bien. */
export interface RespuestaWsp {
  msj_cliente_arquitecto?: string
  /** El PDF compartido en Google Drive: queda guardado como link de la OP. */
  link_op?: string
}

/* El servidor sube a Drive, manda a cada destinatario y espera la confirmación de la cola (hasta
   75 s): se le da margen de sobra antes de cortar de este lado. */
const ESPERA_MS = 240_000

const ERROR_RED =
  'Ocurrió un error interno al intentar enviar el mensaje en la aplicación. Dale click al botón de Finalizar Operación para registrar la orden y no perder los datos ya cargados. Más tarde intenta enviar la orden ya cargada nuevamente. Si el error persiste, no dude en contactarse con el soporte de TAP.'

/**
 * El envío de la OP al cliente o al constructor por WhatsApp, desde la app (`/api/whatsapp`): el
 * servidor valida los celulares, sube el PDF a Google Drive, manda el texto y el archivo por
 * 360messenger y confirma en su cola que salieron. Ya no pasa por ningún escenario de Make.
 *
 * El final lo dice la respuesta: 200 es enviado; cualquier otra cosa trae `mensajeError`, que se
 * muestra junto al botón (un celular inválido, un mensaje que la cola dio por fallido, …).
 */
export function useEnviarWhatsapp(errorRed: string = ERROR_RED) {
  const [estado, setEstado] = useState<{ fase: FaseWsp; problema: string }>({ fase: 'idle', problema: '' })
  const respuesta = useRef<RespuestaWsp | null>(null)

  const correr = useCallback(async (pedido: PedidoWsp, archivo: Blob, nombreArchivo: string) => {
    respuesta.current = null
    setEstado({ fase: 'corriendo', problema: '' })
    try {
      const form = new FormData()
      form.append('datos', JSON.stringify(pedido))
      form.append('archivo', archivo, nombreArchivo)
      const r = await fetch('/api/whatsapp', {
        method: 'POST',
        /* Sin Content-Type a mano: el navegador lo pone con su boundary. */
        headers: await cabecerasPropias(),
        body: form,
        signal: AbortSignal.timeout(ESPERA_MS),
      })
      if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Envío por WhatsApp')
      const cuerpo = (await r.json().catch(() => ({}))) as RespuestaWsp & { mensajeError?: string }
      if (!r.ok) {
        setEstado({ fase: 'error', problema: htmlATexto(cuerpo.mensajeError || '') || errorRed })
        return
      }
      respuesta.current = cuerpo
      setEstado({ fase: 'listo', problema: '' })
    } catch (e) {
      setEstado({
        fase: 'error',
        problema:
          e instanceof DOMException && e.name === 'TimeoutError'
            ? 'El envío tardó demasiado y no se pudo confirmar. Antes de reenviar, revisá si el mensaje llegó, para no mandarlo dos veces.'
            : errorRed,
      })
    }
  }, [errorRed])

  return {
    estado,
    enCurso: estado.fase === 'corriendo',
    correr,
    /** Lo que devolvió el último envío exitoso. */
    respuesta: () => respuesta.current,
  }
}
