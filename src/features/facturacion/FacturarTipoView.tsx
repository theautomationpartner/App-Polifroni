import { useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import {
  TIPOS_FACTURACION,
  importeEditable,
  importeEscrito,
  pendienteDeFacturar,
  pesos,
  problemaMonto,
  tipoHabilitado,
  type TipoFacturacion,
} from '@/lib/facturacion'
import { etiquetaPaso } from '@/lib/pasos'
import { useApp, useDispatch } from '@/state/hooks'
import { emisionIniciada } from './borrador'

/**
 * Facturar una Obra · Etapa 2: qué se factura de la obra, y por cuánto.
 *
 * "¿Qué querés facturar?" (la misma caja de "¿Qué querés hacer?" de Presupuesto): Saldo Pend de
 * Facturar, Diferencia o Nota de Crédito. Por ahora sólo el saldo está habilitado; la diferencia queda
 * apagada (regla del usuario, 13/10/2026) y la nota de crédito espera su definición.
 *
 * Con el saldo se ve lo pendiente de facturar y lo ya facturado, y el monto a facturar arranca con todo
 * lo pendiente: se puede bajar, nunca pasar. Si se pasa (o no es un importe), el campo queda con borde
 * rojo y el motivo debajo.
 */
export function FacturarTipoView() {
  const dispatch = useDispatch()
  const { factura } = useApp()
  const { obras, tipo, elegidas } = factura
  const obra = obras[0] ?? null
  const bloqueada = emisionIniciada(factura)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)

  const pend = obra ? pendienteDeFacturar(obra) : 0
  const elegida = elegidas[0] ?? null
  const problema = tipo === 'saldo' && elegida ? problemaMonto(elegida.monto, pend) : null

  const elegirTipo = (t: TipoFacturacion) => {
    if (bloqueada || !obra || !tipoHabilitado(t) || t === tipo) return
    dispatch({
      type: 'setFactura',
      cambios: {
        tipo: t,
        /* El saldo arranca con todo lo pendiente de facturar. */
        elegidas: t === 'saldo' && pend > 0 ? [{ obraId: obra.id, monto: importeEditable(pend) }] : [],
      },
    })
  }

  const cambiarMonto = (monto: string) => obra && dispatch({ type: 'setFactura', cambios: { elegidas: [{ obraId: obra.id, monto }] } })

  const continuar = () => {
    if (!tipo) {
      setAviso({ titulo: 'Falta elegir qué facturar', texto: 'Elegí en «¿Qué querés facturar?» qué se factura de la obra.' })
      return
    }
    if (tipo === 'saldo' && pend <= 0) {
      setAviso({ titulo: 'No hay saldo para facturar', texto: 'La obra no tiene saldo pendiente de facturar.' })
      return
    }
    if (problema || !elegida) {
      setAviso({ titulo: 'Revisá el monto a facturar', texto: problema ?? 'Ingresá el monto a facturar.' })
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  return (
    <section className="view paso-layout obras-v2 facturar-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('carga', null, null, 'facturar')}
        descripcion={`Elegí qué vas a facturar de ${obra?.nombre ?? 'la obra'}${obra?.idObra ? ` (${obra.idObra})` : ''} y por cuánto.`}
      />

      {bloqueada && <Aviso tono="info">La factura ya empezó a emitirse en el sistema: lo que se factura no se puede cambiar.</Aviso>}

      {/* La pregunta, en la misma caja de "¿Qué querés hacer?" de Presupuesto. */}
      <div className="accion-cfg destino-cfg">
        <div className="cfgbox">
          <div className="cfg-ic">
            <i className="fas fa-file-invoice-dollar" />
          </div>
          <div className="cfg-c">
            <div className="cfg-l">¿Qué querés facturar?</div>
            <select
              className="cfg-sel"
              aria-label="¿Qué querés facturar?"
              value={tipo ?? ''}
              disabled={bloqueada}
              onChange={(e) => elegirTipo(e.target.value as TipoFacturacion)}
            >
              <option value="" disabled hidden>
                Seleccionar...
              </option>
              {TIPOS_FACTURACION.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.habilitado}>
                  {t.titulo}
                  {t.habilitado ? '' : ' (próximamente)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {tipo === 'saldo' && obra && (
        <div className="card card--neutral card--flush card-pad fac-saldo">
          <h3 className="resumen-title">Saldo pendiente de facturar</h3>
          <div className="kpi-grid kpi-grid--3">
            <div className="kpi-card">
              <span className="kpi-label">Total de la obra{obra.diferencia ? ' (con diferencias)' : ''}</span>
              <span className="kpi-value">{pesos(obra.total + obra.diferencia)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Facturado</span>
              <span className="kpi-value">{pesos(obra.facturado)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Saldo pendiente de facturar</span>
              <span className={`kpi-value ${pend > 0 ? 'v-red' : 'v-green'}`}>{pesos(pend)}</span>
            </div>
          </div>

          {pend > 0 ? (
            <div className="carga-grid fac-monto">
              <div className="med-campo">
                <label className="med-l" htmlFor="fac-monto">
                  Monto a facturar *
                </label>
                <div className={`med-conic ${problema ? 'fac-monto--falta' : ''}`}>
                  <i className="fas fa-dollar-sign" aria-hidden="true" />
                  <input
                    id="fac-monto"
                    className="med-input"
                    inputMode="decimal"
                    placeholder="Ej: 1.297.684,50"
                    value={elegida?.monto ?? ''}
                    disabled={bloqueada}
                    aria-invalid={!!problema || undefined}
                    aria-describedby="fac-monto-msj"
                    onChange={(e) => cambiarMonto(e.target.value)}
                    onBlur={() => {
                      /* Al salir del campo queda con el formato de la casa. */
                      const n = elegida ? importeEscrito(elegida.monto) : null
                      if (n !== null && n > 0) cambiarMonto(importeEditable(n))
                    }}
                  />
                </div>
                <span id="fac-monto-msj" className={problema ? 'fac-detalle-err fac-monto-msj' : 'fac-monto-msj'}>
                  {problema ? (
                    <>
                      <i className="fas fa-circle-exclamation" aria-hidden="true" /> {problema}
                    </>
                  ) : importeEscrito(elegida?.monto ?? '') === pend ? (
                    'Se factura todo el saldo pendiente.'
                  ) : (
                    `Queda pendiente de facturar: ${pesos(Math.max(0, pend - (importeEscrito(elegida?.monto ?? '') ?? 0)))}.`
                  )}
                </span>
              </div>
            </div>
          ) : (
            <Aviso tono="info">La obra no tiene saldo pendiente de facturar.</Aviso>
          )}
        </div>
      )}

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', null, null, 'facturar')} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
    </section>
  )
}
