import { useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { HistorialActividad } from '@/features/actividad/HistorialActividad'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { ESCENARIO, EscenarioNoConfigurado, dispararEscenario } from '@/services/make'
import {
  ETIQUETA,
  RESPONSABLE_RECHAZO,
  esperarEnTablero,
  registrarActividad,
} from '@/services/monday'
import { useDispatch } from '@/state/hooks'

type Resultado = { tono: 'ok' | 'warn' | 'err'; texto: string } | null

/**
 * Paso 5 · Confirmación del cliente y despacho al taller.
 *
 * La confirmación NO se decide acá: la carga el cliente desde el formulario que le llegó con el
 * mensaje, y el escenario la escribe en el tablero. La app la muestra y, sobre ella, habilita o no
 * el envío al taller. Esa es la regla del proceso: al taller no se manda nada que el cliente no
 * haya confirmado.
 */
export function ConfirmacionView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()

  const [enviando, setEnviando] = useState(false)
  const [refrescando, setRefrescando] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)
  const [refrescoHistorial, setRefrescoHistorial] = useState(0)

  const confirmacion = obra.confirmacionOp.texto
  const confirmada = confirmacion === ETIQUETA.confirmado
  const rechazada = confirmacion === ETIQUETA.noConfirmado
  const yaEnTaller = obra.estadoEnvioTaller.texto === ETIQUETA.tallerEnviado
  /* Ante un rechazo, el escenario menciona a quien sigue el material de la obra. Se anticipa acá
     para que quien está mirando la pantalla sepa a quién le llegó el aviso. */
  const responsable = RESPONSABLE_RECHAZO[obra.tipo.texto] ?? null

  const actualizar = async () => {
    setRefrescando(true)
    try {
      await refrescar()
      setRefrescoHistorial((n) => n + 1)
    } finally {
      setRefrescando(false)
    }
  }

  const enviarAlTaller = async () => {
    setEnviando(true)
    setResultado(null)
    try {
      await dispararEscenario(ESCENARIO.enviarOpTaller, obra.id, {
        obra: obra.nombre,
        tipo: obra.tipo.texto,
        accion: 'enviar-op-taller',
      })
      await registrarActividad(
        obra.id,
        '🏭 <b>Orden de Producción enviada al taller</b> desde la app de Obras, con la OP confirmada por el cliente.',
      ).catch(() => {})

      const { obra: fresca, cumplio } = await esperarEnTablero(
        obra.id,
        (o) =>
          o.estadoEnvioTaller.texto === ETIQUETA.tallerEnviado ||
          o.estadoEnvioTaller.texto === 'Error en Envio',
        { timeoutMs: 120_000, onLatido: (o) => dispatch({ type: 'refrescarObra', obra: o }) },
      )

      setRefrescoHistorial((n) => n + 1)

      if (!cumplio) {
        setResultado({
          tono: 'warn',
          texto: 'El envío al taller quedó en curso. Refrescá en un momento para ver el estado.',
        })
        return
      }
      if (fresca?.estadoEnvioTaller.texto === 'Error en Envio') {
        setResultado({
          tono: 'err',
          texto: 'El escenario no pudo mandar la orden al taller. Revisá el historial.',
        })
        return
      }
      setResultado({ tono: 'ok', texto: 'La orden salió al taller de fabricación.' })
    } catch (e) {
      if (e instanceof EscenarioNoConfigurado) {
        setResultado({
          tono: 'err',
          texto:
            'Falta la URL del escenario de envío al taller en .env.local (MAKE_WEBHOOK_TALLER). Es el único dato que falta para cerrar el circuito.',
        })
        return
      }
      setResultado({
        tono: 'err',
        texto: e instanceof Error ? e.message : 'No se pudo disparar el envío al taller.',
      })
    } finally {
      setEnviando(false)
      void refrescar()
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={5}
        titulo="Confirmación del cliente y taller"
        descripcion={
          <>
            El cliente responde desde el formulario que recibió por WhatsApp. Con la orden
            confirmada se habilita el despacho al taller de fabricación.
          </>
        }
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-clipboard-check" /> Respuesta del cliente
          </div>
          <p className="panel-d">
            Lo que el cliente marcó en el formulario queda en la columna{' '}
            <strong>Confirmacion de la Op</strong>. Esta pantalla la lee del tablero: no se
            completa a mano.
          </p>

          <div className="obs-pie" style={{ marginTop: 0 }}>
            <EstadoBadge label="Confirmación" estado={obra.confirmacionOp} />
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={refrescando}
              onClick={() => void actualizar()}
            >
              {refrescando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Consultando…
                </>
              ) : (
                <>
                  <i className="fas fa-rotate" /> Consultar respuesta
                </>
              )}
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            {confirmada && (
              <Aviso tono="ok">
                El cliente confirmó la Orden de Producción. Ya se puede mandar al taller.
              </Aviso>
            )}
            {rechazada && (
              <Aviso tono="err">
                El cliente rechazó la orden. El motivo que cargó queda en el historial de la obra
                {responsable ? (
                  <>
                    , con la mención automática a <strong>{responsable}</strong> por ser una obra de{' '}
                    {obra.tipo.texto}
                  </>
                ) : null}
                .
              </Aviso>
            )}
            {!confirmada && !rechazada && (
              <Aviso tono="info">
                Todavía sin respuesta. Cuando el cliente complete el formulario, el estado cambia
                solo.
              </Aviso>
            )}
          </div>

          <div className="panel-sep" />

          <div className="panel-t">
            <i className="fas fa-screwdriver-wrench" /> Despacho al taller
          </div>
          <p className="panel-d">
            El botón se habilita únicamente con la orden confirmada por el cliente.
          </p>

          <div className="obs-pie" style={{ marginTop: 0, marginBottom: 12 }}>
            <EstadoBadge label="Envío al taller" estado={obra.estadoEnvioTaller} />
          </div>

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!confirmada || enviando}
              title={
                confirmada ? undefined : 'La orden tiene que estar confirmada por el cliente.'
              }
              onClick={() => void enviarAlTaller()}
            >
              {enviando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Enviando al taller…
                </>
              ) : (
                <>
                  <i className="fas fa-industry" /> Enviar OP al taller
                </>
              )}
            </button>
            {yaEnTaller && (
              <span className="obs-estado obs-estado--ok">
                <i className="fas fa-circle-check" /> Ya enviada al taller
              </span>
            )}
          </div>

          {resultado && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono={resultado.tono}>{resultado.texto}</Aviso>
            </div>
          )}
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-clock-rotate-left" /> Historial de actividades
          </div>
          <p className="panel-d">
            Todo lo que pasó con la obra: adjuntos, generaciones, envíos, la respuesta del cliente y
            las menciones automáticas.
          </p>
          <HistorialActividad itemId={obra.id} recargar={refrescoHistorial} limite={30} />
        </div>
      </div>

      <PasoNav nota="Este es el último paso del proceso de Orden de Producción." />
    </section>
  )
}
