import { EstadoBadge } from '@/components/ui/Aviso'
import { importe } from '@/lib/format'
import { useApp } from '@/state/hooks'
import type { Obra } from '@/types'

/** Un dato de la grilla: si no hay valor, se dice que falta en vez de dejar el hueco. */
function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="dato-l">{label}</div>
      <div className={`dato-v ${valor ? '' : 'dato-v--vacio'}`}>{valor || '—'}</div>
    </div>
  )
}

/** Tarjeta de un vínculo de la obra (cuenta corriente del cliente / constructor o arquitecto). */
function Vinculo({
  icono,
  label,
  valor,
  extra,
}: {
  icono: string
  label: string
  valor: string
  extra?: string
}) {
  const falta = !valor
  return (
    <div className={`vinculo ${falta ? 'vinculo--falta' : ''}`}>
      <span className="vinculo-ic">
        <i className={`fas ${icono}`} />
      </span>
      <div>
        <div className="vinculo-l">{label}</div>
        <div className="vinculo-v">{valor || 'Sin vincular'}</div>
        {extra && <div className="vinculo-x">{extra}</div>}
      </div>
    </div>
  )
}

/**
 * Ficha de la obra: está presente en TODAS las etapas del proceso.
 *
 * No es decoración. Las decisiones del circuito dependen de estos datos —a qué cuenta corriente se
 * imputa, a qué celular se manda la OP, si el material es PVC o aluminio— y tenerlos a la vista
 * evita la ida y vuelta al tablero para confirmarlos.
 */
export function ObraFicha({ obra, children }: { obra: Obra; children?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="obra-ficha-cab">
        <div>
          <div className="obra-ficha-id">
            {obra.idObra || `ID ${obra.id}`} · {obra.grupo || 'Obras'}
          </div>
          <h2 className="obra-ficha-name">{obra.nombre}</h2>
          <div className="obra-ficha-badges">
            <EstadoBadge label="Tipo" estado={obra.tipo} />
            <EstadoBadge label="Producción" estado={obra.etapaProduccion} />
            <EstadoBadge label="Venta" estado={obra.etapaVenta} />
            <EstadoBadge label="Premarco" estado={obra.premarco} />
            <EstadoBadge label="OP final" estado={obra.estadoOpFinal} />
            <EstadoBadge label="Confirmación" estado={obra.confirmacionOp} />
          </div>
        </div>
        {children && <div className="obra-ficha-acts">{children}</div>}
      </div>

      <div className="obra-vinculos">
        <Vinculo
          icono="fa-file-invoice-dollar"
          label="Cuenta corriente del cliente"
          valor={obra.ctaCteCliente}
          extra={[obra.celCliente, obra.emailCliente].filter(Boolean).join(' · ')}
        />
        <Vinculo
          icono="fa-compass-drafting"
          label="Constructor / Arquitecto"
          valor={obra.arquitecto}
          extra={obra.celArquitecto}
        />
        <Vinculo icono="fa-user-gear" label="Asignado a" valor={obra.asignado} />
      </div>

      <div className="obra-datos-grid">
        <Dato label="Cel a coordinar" valor={obra.celCoordinar} />
        <Dato label="Ubicación de la obra" valor={obra.ubicacion} />
        <Dato label="Fecha pactada de colocación" valor={obra.fechaColocacion} />
        <Dato label="Coordinar entrega con" valor={obra.coordinarEntrega.texto} />
        <Dato label="Total obra pactado" valor={importe(obra.totalPactado)} />
        <Dato label="Saldo" valor={importe(obra.saldo)} />
        <Dato label="% cancelado" valor={obra.pctCancelado} />
        <Dato label="Registración en cta cte" valor={obra.validacionCtaCte.texto} />
        <Dato label="Creación" valor={obra.creacion} />
        <Dato
          label="Documentos cargados"
          valor={[
            obra.ordenEtmo.length ? `ETMO (${obra.ordenEtmo.length})` : '',
            obra.opFinal.length ? `OP final (${obra.opFinal.length})` : '',
            obra.planoAberturas.length ? 'Plano aberturas' : '',
            obra.planoPlanta.length ? 'Plano planta' : '',
            obra.presupuestoAceptado.length ? 'Presupuesto aceptado' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      </div>
    </div>
  )
}

/** La obra del estado global. Las vistas de paso no se dibujan sin ella, así que acá ya existe. */
export function useObra(): Obra {
  const { obra } = useApp()
  if (!obra) throw new Error('No hay obra seleccionada')
  return obra
}
