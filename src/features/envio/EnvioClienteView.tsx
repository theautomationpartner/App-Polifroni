import { useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Dropdown } from '@/components/ui/Dropdown'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { ESCENARIO, EscenarioNoConfigurado, dispararEscenario } from '@/services/make'
import { COL, ETIQUETA, esperarEnTablero, registrarActividad, setEstado } from '@/services/monday'
import { useDispatch } from '@/state/hooks'

type Resultado = { tono: 'ok' | 'warn' | 'err'; texto: string } | null

/** Opciones de las dos columnas de status que deciden a quién y por dónde se manda la orden. */
const DESTINATARIOS = ['Cliente', 'Constructor', 'Ambos'] as const
const VIAS = ['Whatsapp', 'Email', 'Ambos'] as const

/**
 * Paso 4 · Envío de la OP final al cliente.
 *
 * El escenario de Make manda el documento por WhatsApp junto con el enlace al formulario donde el
 * cliente confirma o rechaza el pedido. La app elige destinatario y vía —dos columnas del
 * tablero—, toca el timbre y después sigue el estado del envío en el propio tablero.
 */
export function EnvioClienteView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()

  const [enviando, setEnviando] = useState(false)
  const [cambiando, setCambiando] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)

  const opPdf = obra.opFinal.find((a) => !a.esImagen) ?? null
  const hayOp = obra.opFinal.length > 0
  const destinatario = obra.opDestinatario.texto
  const via = obra.opVia.texto
  /* A quién le llega el mensaje según el destinatario elegido: es el dato que hay que mirar ANTES
     de mandar, porque el número sale de la cuenta corriente o del arquitecto, no de la obra. */
  const telefonos = [
    destinatario !== 'Constructor' && obra.celCliente ? `Cliente: ${obra.celCliente}` : '',
    destinatario !== 'Cliente' && obra.celArquitecto ? `Constructor: ${obra.celArquitecto}` : '',
  ].filter(Boolean)
  const sinTelefono = telefonos.length === 0
  const puedeEnviar = hayOp && !!destinatario && !sinTelefono && !enviando

  const cambiarColumna = async (columna: string, etiqueta: string) => {
    setCambiando(true)
    try {
      await setEstado(obra.id, columna, etiqueta)
      await refrescar()
    } catch {
      dispatch({ type: 'errorMonday', accion: 'cambiar la configuración del envío' })
    } finally {
      setCambiando(false)
    }
  }

  const enviar = async () => {
    setEnviando(true)
    setResultado(null)
    try {
      await dispararEscenario(ESCENARIO.enviarOpCliente, obra.id, {
        obra: obra.nombre,
        destinatario,
        via,
        celCliente: obra.celCliente,
        celArquitecto: obra.celArquitecto,
        accion: 'enviar-op-cliente',
      })
      await registrarActividad(
        obra.id,
        `📲 <b>Envío de la OP final solicitado</b> desde la app de Obras.<br>Destinatario: ${destinatario || 'sin definir'} · Vía: ${via || 'sin definir'}`,
      ).catch(() => {})

      const { obra: fresca, cumplio } = await esperarEnTablero(
        obra.id,
        (o) =>
          o.estadoEnvioOp.texto === ETIQUETA.envioEnviado ||
          o.estadoEnvioOp.texto === ETIQUETA.envioError ||
          o.mjsEnviadoCliente.texto === ETIQUETA.envioEnviado,
        { timeoutMs: 120_000, onLatido: (o) => dispatch({ type: 'refrescarObra', obra: o }) },
      )

      if (!cumplio) {
        setResultado({
          tono: 'warn',
          texto:
            'El envío quedó en curso: el tablero todavía no confirma el resultado. Refrescá en un momento.',
        })
        return
      }
      if (fresca?.estadoEnvioOp.texto === ETIQUETA.envioError) {
        setResultado({
          tono: 'err',
          texto: 'El escenario no pudo enviar el mensaje. Revisá el historial de la obra.',
        })
        return
      }
      setResultado({
        tono: 'ok',
        texto:
          'Mensaje enviado. El cliente recibe la OP final y el enlace al formulario para confirmar o rechazar.',
      })
    } catch (e) {
      if (e instanceof EscenarioNoConfigurado) {
        setResultado({
          tono: 'err',
          texto:
            'Falta la URL del escenario en .env.local (MAKE_WEBHOOK_ENVIAR_OP). Cargala y reiniciá npm run dev.',
        })
        return
      }
      setResultado({
        tono: 'err',
        texto: e instanceof Error ? e.message : 'No se pudo disparar el envío.',
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
        numero={4}
        titulo="Enviar la OP al cliente"
        descripcion={
          <>
            Se manda la Orden de Producción final por WhatsApp, con el enlace al formulario donde el
            cliente la confirma o la rechaza.
          </>
        }
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-paper-plane" /> Envío del documento
          </div>
          <p className="panel-d">
            El destinatario y la vía se guardan en el tablero (columnas{' '}
            <strong>✋ Orden de Produccion a:</strong> y{' '}
            <strong>✋Enviar Orden de Produccion x:</strong>), que es de donde los lee el escenario.
          </p>

          <div className="obra-vinculos" style={{ marginTop: 0 }}>
            <div className="vinculo">
              <span className="vinculo-ic">
                <i className="fas fa-user-check" />
              </span>
              <div>
                <div className="vinculo-l">
                  Orden de producción a<span className="campo-col">{COL.opDestinatario}</span>
                </div>
                <Dropdown<string>
                  label={
                    destinatario ? (
                      <span className="selbox-val">
                        <span className="selbox-val-txt">{destinatario}</span>
                      </span>
                    ) : (
                      <span className="selbox-ph">Seleccionar...</span>
                    )
                  }
                  items={DESTINATARIOS as readonly string[]}
                  itemKey={(d) => d}
                  renderItem={(d) => d}
                  disabled={cambiando || enviando}
                  onSelect={(d) => void cambiarColumna(COL.opDestinatario, d)}
                />
              </div>
            </div>

            <div className="vinculo">
              <span className="vinculo-ic">
                <i className="fab fa-whatsapp" />
              </span>
              <div>
                <div className="vinculo-l">
                  Enviar por<span className="campo-col">{COL.opVia}</span>
                </div>
                <Dropdown<string>
                  label={
                    via ? (
                      <span className="selbox-val">
                        <span className="selbox-val-txt">{via}</span>
                      </span>
                    ) : (
                      <span className="selbox-ph">Seleccionar...</span>
                    )
                  }
                  items={VIAS as readonly string[]}
                  itemKey={(v) => v}
                  renderItem={(v) => v}
                  disabled={cambiando || enviando}
                  onSelect={(v) => void cambiarColumna(COL.opVia, v)}
                />
              </div>
            </div>
          </div>

          <div className="panel-sep" />

          <span className="campo-l">Destinos del mensaje</span>
          {sinTelefono ? (
            <Aviso tono="warn">
              No hay un celular de WhatsApp para el destinatario elegido. Se toma de la cuenta
              corriente del cliente y del constructor/arquitecto vinculados a la obra.
            </Aviso>
          ) : (
            telefonos.map((t) => (
              <div className="archivo-item" key={t}>
                <i className="fab fa-whatsapp" style={{ color: '#25d366' }} />
                <span className="archivo-item-n">{t}</span>
              </div>
            ))
          )}

          {!hayOp && (
            <div style={{ marginTop: 12 }}>
              <Aviso tono="warn">
                Todavía no hay una OP final adjunta: generala en el paso anterior antes de enviarla.
              </Aviso>
            </div>
          )}

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-green"
              disabled={!puedeEnviar}
              onClick={() => void enviar()}
            >
              {enviando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Enviando…
                </>
              ) : (
                <>
                  <i className="fab fa-whatsapp" /> Enviar OP por WhatsApp
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={enviando}
              onClick={() => void refrescar()}
            >
              <i className="fas fa-rotate" /> Refrescar estado
            </button>
          </div>

          <div className="obs-pie">
            <EstadoBadge label="Estado de envío" estado={obra.estadoEnvioOp} />
            <EstadoBadge label="Mensaje al cliente" estado={obra.mjsEnviadoCliente} />
          </div>

          {resultado && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono={resultado.tono}>{resultado.texto}</Aviso>
            </div>
          )}
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-pdf" /> Documento que se envía
          </div>
          <p className="panel-d">
            Es el archivo adjunto en <strong>🤖OP Final</strong>. Si tenés que corregirlo, volvé al
            paso anterior y generalo de nuevo.
          </p>
          <VisorPdf
            archivo={opPdf}
            vacio="Todavía no hay una OP final generada para esta obra."
            trabajando={enviando ? 'Enviando la Orden de Producción al cliente…' : null}
          />
        </div>
      </div>

      <PasoNav
        siguiente="Ver confirmación del cliente"
        nota="El cliente confirma o rechaza desde el formulario que le llega en el mensaje."
      />
    </section>
  )
}
