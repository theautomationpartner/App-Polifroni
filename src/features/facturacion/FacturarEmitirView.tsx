import { FinalizarOperacion, type TextosFinalizar } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { nombreComprobante } from '@/lib/facturacion'
import { etiquetaPaso } from '@/lib/pasos'
import { marcarComprobanteEnviado, registrarFacturaEnObra } from '@/services/monday'
import { useApp } from '@/state/hooks'
import { EnviarFactura } from './EnviarFactura'
import { ResumenFactura } from './ResumenFactura'

const TEXTOS_FINALIZAR: TextosFinalizar = {
  enviado: 'Comprobante emitido y enviado',
  sinEnviar: 'Operación finalizada',
  preguntaTitulo: 'El comprobante todavía no se envió',
  pregunta:
    'Si el comprobante ya se emitió, queda emitido en el sistema aunque no le haya llegado al cliente: podés enviarlo después desde el tablero de Facturación obra. Si todavía no se emitió, no se registra nada.',
  registrando: 'Registrando el comprobante en el sistema...',
  registrandoDetalle: 'Registramos el comprobante en la obra y dejamos constancia del envío. Esperá unos segundos.',
  errorTitulo: 'No se pudo registrar el comprobante',
  error:
    'Monday no respondió al intentar registrar el comprobante. YA se emitió y se envió: reintentá «Finalizar Operación» en unos segundos para no perder el registro. Si la falla persiste, contactate con el soporte de TAP.',
}

/**
 * Facturar una Obra · Etapa 3: la emisión y el envío.
 *
 * A la izquierda, el resumen de la facturación con "Ver factura" y "Confirmar y emitir factura". A la
 * derecha, "Enviar Factura": el bloque de envío de la OP, sin responsable de confirmar, que se habilita
 * con los comprobantes emitidos. Apenas el envío sale, "Finalizar Operación" registra la factura en la obra
 * (`registrarFacturaEnObra`) y deja constancia en cada
 * comprobante (`🤖Estado Envio` → "Enviado").
 */
export function FacturarEmitirView() {
  const { factura, enviado } = useApp()

  return (
    <section className="view paso-layout obras-v2 facturar-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('envio', null, null, 'facturar')}
        descripcion={`Revisá el resumen, emití ${nombreComprobante(factura.tipo).articulo} en ARCA y enviala por WhatsApp.`}
      />

      {/* El mismo armado de "Emitir y Enviar OP" (PVC): el resumen a la izquierda, el envío a la derecha. */}
      <div className="emision-grid">
        <div className="emision-col">
          <ResumenFactura />
        </div>
        <EnviarFactura key={factura.cuenta?.id ?? ''} />
      </div>

      <PieEtapa>
        <FinalizarOperacion
          detalle={factura.cuenta?.nombre}
          textos={TEXTOS_FINALIZAR}
          registrar={
            enviado
              ? async () => {
                  /* Por comprobante: el movimiento en la obra (con el comprobante vinculado) y la constancia
                     del envío. Las dos cosas se pueden repetir sin duplicar: un reintento sigue de largo. */
                  for (const c of factura.comprobantes) {
                    if (!c.facturaId) continue
                    await registrarFacturaEnObra({
                      obraId: c.obraId,
                      facturaId: c.facturaId,
                      nombre: c.leido?.nombre ?? '',
                      monto: c.leido?.monto ?? c.monto,
                      /* La nota de crédito va en negativo: anula lo facturado. */
                      notaCredito: factura.tipo === 'notaCredito',
                    })
                    await marcarComprobanteEnviado(c.facturaId)
                  }
                }
              : undefined
          }
        />
      </PieEtapa>
    </section>
  )
}
