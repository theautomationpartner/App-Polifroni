import { useEffect, useState } from 'react'
import { EnviarOp, type OrdenLocal } from '@/features/envio/EnviarOp'
import { FinalizarOperacion } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { ROLES, type Rol } from '@/lib/destinatario'
import { destinatariosDeOrden } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { TEXTOS_FINALIZAR_EDICION, useRegistrarEdicion, verPdf } from './finalizarEdicion'

/**
 * Editar Órdenes de Producción · Etapa 3: enviar la OP final nueva.
 *
 * Es el mismo envío de "Cargar y Enviar" (`EnviarOp`), con una orden que todavía no está en Monday:
 * el PDF va en el pedido y lo que salió queda en el borrador. Arranca con los destinatarios y el
 * responsable de confirmar de la OP anterior (se pueden cambiar).
 *
 * La OP nueva ("… V2") ya quedó registrada al generar la OP final, con la anterior cancelada.
 * Apenas se confirma el envío, `FinalizarOperacion` registra el envío en la nueva. Sin enviar,
 * "Finalizar Edición" cierra: la nueva queda con el estado de la anterior (una "Generada Pend de
 * Enviar" se completa después desde "Consultar órdenes").
 */
export function EditarEnviarView() {
  const dispatch = useDispatch()
  const { edicion, enviado } = useApp()
  const orden = edicion.orden!
  const generada = edicion.generada!
  const obra = edicion.obra!
  const registrar = useRegistrarEdicion()
  const confirmador = (ROLES as readonly string[]).includes(orden.confirmador.trim()) ? (orden.confirmador.trim() as Rol) : null
  /** Los destinatarios de la OP anterior. `null` mientras se leen. */
  const [destinatarios, setDestinatarios] = useState<Rol[] | null>(null)

  useEffect(() => {
    let vivo = true
    destinatariosDeOrden(orden.id, obra.arquitectoIds.map(String))
      .then((roles) => vivo && setDestinatarios(roles))
      .catch(() => vivo && setDestinatarios([]))
    return () => {
      vivo = false
    }
  }, [orden.id, obra.arquitectoIds])

  const local: OrdenLocal = {
    ordenId: edicion.nuevaId,
    archivo: generada.archivo,
    numero: orden.numero,
    tipo: 'PVC',
    medidoPor: orden.medidoPor,
    fecha: orden.fechaMedicion.slice(0, 10),
    observacion: orden.observacion,
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Enviar Nueva OP Final"
        descripcion={`Enviá la OP final de ${generada.nombreNuevo}. Arranca con los destinatarios y el responsable de confirmar de la orden anterior.`}
      />

      <div className="ed-envio">
        {destinatarios === null ? (
          <div className="card ed-cargando-envio">
            <i className="fas fa-spinner fa-spin" /> Leyendo los destinatarios de la orden anterior...
          </div>
        ) : (
          <EnviarOp
            modo="cliente"
            orden={null}
            local={local}
            listo
            destinatariosIniciales={destinatarios}
            confirmadorInicial={confirmador}
            edicion
            contexto={{
              obra,
              enviado,
              onEnviado: () => dispatch({ type: 'setEnviado' }),
              onObra: (o) => dispatch({ type: 'setEdicion', cambios: { obra: o } }),
            }}
          />
        )}
      </div>

      <PieEtapa>
        {/* Las acciones juntas a la derecha; "Volver" queda solo a la izquierda. */}
        <div className="ed-pie-acc">
          <button type="button" className="btn btn-out" onClick={() => verPdf(generada.archivo)}>
            <i className="fas fa-eye" /> Ver OP final
          </button>
          <FinalizarOperacion
            etiqueta="Finalizar Edición"
            textos={TEXTOS_FINALIZAR_EDICION}
            detalle={generada.nombreNuevo}
            registrar={registrar}
          />
        </div>
      </PieEtapa>
    </section>
  )
}
