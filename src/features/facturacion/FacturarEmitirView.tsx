import { FinalizarOperacion, type TextosFinalizar } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { etiquetaPaso } from '@/lib/pasos'
import { marcarComprobanteEnviado, registrarFacturaEnObra } from '@/services/monday'
import { useApp } from '@/state/hooks'
import { EnviarFactura } from './EnviarFactura'
import { ResumenFactura } from './ResumenFactura'

const TEXTOS_FINALIZAR: TextosFinalizar = {
  enviado: 'Factura emitida y enviada',
  sinEnviar: 'Operación finalizada',
  preguntaTitulo: 'La factura todavía no se envió',
  pregunta:
    'Si la factura ya se emitió, queda emitida en el sistema aunque no le haya llegado al cliente: podés enviarla después desde el tablero de Facturación obra. Si todavía no se emitió, no se registra nada.',
  registrando: 'Registrando la factura en el sistema...',
  registrandoDetalle: 'Registramos la factura en la obra y dejamos constancia del envío en el comprobante. Esperá unos segundos.',
  errorTitulo: 'No se pudo registrar la factura',
  error:
    'Monday no respondió al intentar registrar la factura. La factura YA se emitió y se envió: reintentá «Finalizar Operación» en unos segundos para no perder el registro. Si la falla persiste, contactate con el soporte de TAP.',
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
  const n = factura.elegidas.length

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2 presupuesto-v2 facturar-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('envio', null, null, 'facturar')}
        descripcion={`Revisá el resumen, emití ${n > 1 ? 'las facturas' : 'la factura'} en ARCA y enviala por WhatsApp.`}
      />

      <div className="emision-grid emision-grid--mitades pres-etapa fac-etapa">
        <ResumenFactura />
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
