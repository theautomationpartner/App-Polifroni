import { Aviso } from '@/components/ui/Aviso'
import type { Corrida } from '@/features/shared/useCorrida'
import { fechaHora, htmlATexto } from '@/lib/texto'

/**
 * Cómo terminó un envío, dicho para quien lo manda.
 *
 * Sin nombrar procesos, automatizaciones ni tableros: a quien aprieta el botón sólo le importa si
 * salió o no. Mientras se envía no se muestra nada acá —el botón ya dice "Enviando…"—; al terminar,
 * un tilde con "Enviado".
 */
export function ResultadoEnvio({
  estado,
  seguirEsperando,
}: {
  estado: Corrida
  seguirEsperando: () => void
}) {
  return (
    <div className="resultado">
      {estado.fase === 'listo' && <Aviso tono="ok">Enviado</Aviso>}
      {estado.fase === 'demorado' && (
        <>
          <Aviso tono="warn">Está tardando más de lo normal.</Aviso>
          <div className="acciones-fila">
            <button type="button" className="btn btn-out btn--sm" onClick={seguirEsperando}>
              <i className="fas fa-hourglass-half" /> Seguir esperando
            </button>
          </div>
        </>
      )}
      {estado.fase === 'error' && (
        <>
          <Aviso tono="err">No se pudo enviar.</Aviso>
          {estado.updateError && (
            <article className="update-corrida">
              <div className="hist-cab">
                <span className="hist-autor">{estado.updateError.autor}</span>
                <span className="hist-fecha">{fechaHora(estado.updateError.fecha)}</span>
              </div>
              <p className="hist-txt" style={{ whiteSpace: 'pre-wrap' }}>
                {htmlATexto(estado.updateError.body)}
              </p>
            </article>
          )}
        </>
      )}
    </div>
  )
}
