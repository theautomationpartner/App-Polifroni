import { useState } from 'react'
import { FinalizarOperacion, type TextosFinalizar } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { etiquetaPaso } from '@/lib/pasos'
import { useApp, useDispatch } from '@/state/hooks'
import { EnviarPresupuesto } from './EnviarPresupuesto'
import { registrarPresupuesto } from './registrar'
import { TablaPresupuestos } from './TablaPresupuestos'

const TEXTOS_FINALIZAR: TextosFinalizar = {
  enviado: 'Presupuestos enviados',
  sinEnviar: 'Operación finalizada',
  preguntaTitulo: 'Los presupuestos todavía no se enviaron',
  pregunta:
    'Los presupuestos se registran en el sistema recién cuando se envían. Si finalizás ahora, no se guarda nada y lo cargado se pierde.',
  registrando: 'Registrando presupuestos y envío en el sistema...',
  registrandoDetalle: 'Guardamos cada presupuesto en Monday con su PDF y dejamos constancia del envío. Esperá unos segundos.',
  errorTitulo: 'No se pudieron registrar los presupuestos',
  error:
    'Monday no respondió al intentar registrar los presupuestos. Los presupuestos YA se enviaron: reintentá «Finalizar Operación» en unos segundos para no perder el registro. Si la falla persiste, contactate con el soporte de TAP.',
}

/**
 * Crear y Cargar Presupuestos · Etapa 3: el envío.
 *
 * A la izquierda, el bloque de envío. A la derecha, "Presupuestos a enviar" sin edición (para
 * corregirlos se vuelve a la etapa 2), con la marca de los que el responsable tiene que confirmar.
 * Apenas salen, "Finalizar Operación" los registra solo (ver `registrarPresupuesto`).
 */
export function EnviarPresupuestosView() {
  const dispatch = useDispatch()
  const { presupuesto, enviado } = useApp()
  const { modo, bolsa, cliente, arquitecto, presupuestos } = presupuesto
  const [aConfirmar, setAConfirmar] = useState<string[]>([])
  const para = modo === 'cargar' ? bolsa?.nombre : [cliente?.nombre, arquitecto?.nombre].filter(Boolean).join(' y ')

  return (
    <section className="view paso-layout obras-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('envio', null, null, 'presupuestos', modo)}
        descripcion={
          <>
            Elegí a quién se envían y, si querés, quién tiene que confirmarlos.{' '}
            {para && (
              <>
                {modo === 'cargar' ? 'Presupuesto: ' : 'Para: '}
                <strong>{para}</strong>
              </>
            )}
          </>
        }
      />

      <div className="emision-grid emision-grid--mitades pres-etapa">
        {/* Primero el envío (pedido del usuario); a su derecha, lo que sale. Con otra bolsa u otros
            contactos, el envío arranca de cero (`key`). */}
        <EnviarPresupuesto key={`${bolsa?.id ?? ''}-${cliente?.id ?? ''}-${arquitecto?.id ?? ''}`} onAConfirmar={setAConfirmar} />
        <TablaPresupuestos presupuestos={presupuestos} aConfirmar={enviado ? (presupuesto.envio?.aConfirmar ?? []) : aConfirmar} />
      </div>

      <PieEtapa>
        <FinalizarOperacion
          detalle={para || undefined}
          textos={TEXTOS_FINALIZAR}
          registrar={
            enviado
              ? () =>
                  registrarPresupuesto({
                    borrador: presupuesto,
                    avanzar: (cambios) => dispatch({ type: 'setPresupuesto', cambios }),
                  })
              : undefined
          }
        />
      </PieEtapa>
    </section>
  )
}
