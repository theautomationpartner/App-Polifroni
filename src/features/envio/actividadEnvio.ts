import { armarActividadEnvio } from '@/lib/actividadEnvio'
import { destinoDe, type Rol } from '@/lib/destinatario'
import { itemDe, registrarActividad } from '@/services/monday'
import type { Obra } from '@/types'

export interface EnvioConfirmado {
  roles: Rol[]
  /** El N° de la OP. */
  numero: string
  reenvio: boolean
  /** El nombre del PDF que salió: es el nombre visible del link. */
  archivo: string
  /** El PDF compartido en Google Drive (`link_op` de la respuesta). */
  link: string
  /** Lo que confirmó el envío, en el mismo orden que `roles`: el celular al que salió cada uno. */
  resultados?: { nombre?: string; phonenumber?: string }[]
}

/**
 * Con el envío por WhatsApp ya confirmado, registra en Emails & Activities del ítem de CADA
 * destinatario (el cliente en Clientes, el constructor en Constructor/Arquitecto) la actividad del
 * envío, armada como el módulo del escenario de Make (`armarActividadEnvio`).
 *
 * Se dispara y NO se espera: el envío ya salió y se registró; si una actividad no se puede
 * escribir, queda en la consola y no frena nada.
 */
export function registrarActividadesEnvio(obra: Obra, e: EnvioConfirmado): void {
  e.roles.forEach((rol, i) => {
    const d = destinoDe(obra, rol)
    const telefono = e.resultados?.[i]?.phonenumber || d.whatsapp
    const nombre = d.nombre || rol
    const actividad = armarActividadEnvio({
      title: `${e.reenvio ? 'Reenvio' : 'Envio'} de Orden de Produccion N° ${e.numero} - ${obra.nombre} para ${nombre}`,
      documentos_enlaces: e.link,
      wsp: telefono,
      contactos: nombre,
      documentos: e.archivo ? [e.archivo] : [],
    })
    void itemDe(obra, rol)
      .then((item) => registrarActividad(item.id, actividad))
      .catch((err) => console.warn(`[envio] no se pudo registrar la actividad del envío en el ${rol.toLowerCase()}`, err))
  })
}
