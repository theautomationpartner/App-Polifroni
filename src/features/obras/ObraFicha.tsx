import { EstadoBadge } from '@/components/ui/Aviso'
import { importe } from '@/lib/format'
import { useApp } from '@/state/hooks'
import type { Obra } from '@/types'

/** Un dato de la grilla: si no hay valor, se dice que falta en vez de dejar el hueco. */
function Dato({ icono, label, valor }: { icono: string; label: string; valor: string }) {
  return (
    <div className="dato">
      <span className="dato-ic">
        <i className={`fas ${icono}`} />
      </span>
      <div>
        <div className="dato-l">{label}</div>
        <div className={`dato-v ${valor ? '' : 'dato-v--vacio'}`}>{valor || '—'}</div>
      </div>
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

/** El número detrás de un importe del tablero, o `null` si esa columna no trajo uno. */
function aNumero(texto: string): number | null {
  const limpio = texto.trim()
  if (!limpio) return null
  const n = Number(limpio.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Cuánto de la obra está cancelado, de 0 a 100.
 *
 * Se prefiere calcularlo sobre los importes antes que confiar en la columna fórmula: esa columna
 * devuelve texto ("2%", vacío, a veces nada) y de ella depende el largo de la barra.
 */
function porcentaje(obra: Obra): number | null {
  const total = aNumero(obra.totalPactado)
  const saldo = aNumero(obra.saldo)
  if (total !== null && saldo !== null && total > 0) {
    return Math.max(0, Math.min(100, ((total - saldo) / total) * 100))
  }
  const suelto = aNumero(obra.pctCancelado)
  return suelto === null ? null : Math.max(0, Math.min(100, suelto))
}

/**
 * Ficha de la obra: está presente en TODAS las etapas del proceso.
 *
 * No es decoración. Las decisiones del circuito dependen de estos datos —a qué cuenta corriente se
 * imputa, a qué celular se manda la OP, cuánto falta cobrar— y tenerlos a la vista evita la ida y
 * vuelta al tablero.
 *
 * Se muestra lo que se MIRA para decidir. La fecha de creación y el inventario de adjuntos estaban
 * y se sacaron: nadie decide nada con ellos y empujaban hacia abajo lo que sí importa.
 */
export function ObraFicha({ obra, children }: { obra: Obra; children?: React.ReactNode }) {
  const total = aNumero(obra.totalPactado)
  const saldo = aNumero(obra.saldo)
  const cancelado = total !== null && saldo !== null ? total - saldo : null
  const pct = porcentaje(obra)

  return (
    <div className="card obra-ficha">
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
            <EstadoBadge label="Cta cte" estado={obra.validacionCtaCte} />
            {/* El estado de la OP final NO va acá: es el estado de una corrida, y en las otras
                etapas dice cosas ("Generando") que no describen a la obra sino a lo que está
                pasando en otro lado. Se muestra donde se opera, en el paso 3. */}
            <EstadoBadge label="Confirmación" estado={obra.confirmacionOp} />
          </div>
        </div>
        {children && <div className="obra-ficha-acts">{children}</div>}
      </div>

      {/* La plata, que es lo primero que se mira al abrir una obra. */}
      <div className="plata">
        <div className="plata-cards">
          <div className="plata-card">
            <div className="plata-l">Total obra pactado</div>
            <div className="plata-v">{importe(obra.totalPactado) || '—'}</div>
          </div>
          <div className="plata-card">
            <div className="plata-l">Cancelado</div>
            <div className="plata-v plata-v--ok">
              {cancelado === null ? '—' : importe(String(cancelado))}
            </div>
          </div>
          <div className="plata-card">
            <div className="plata-l">Saldo</div>
            <div className="plata-v plata-v--deuda">{importe(obra.saldo) || '—'}</div>
          </div>
        </div>

        {pct !== null && (
          <div className="plata-barra">
            <span className="plata-barra-l">Cancelado</span>
            {/* La barra y su número van en la MISMA línea: el porcentaje pegado al final del
                relleno se lee de un vistazo, sin tener que buscarlo en la otra punta. */}
            <div className="plata-track">
              <div
                className={`plata-fill ${pct >= 99.5 ? 'plata-fill--full' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`plata-pct ${pct >= 99.5 ? 'plata-pct--full' : ''}`}>
              {pct.toFixed(pct % 1 === 0 ? 0 : 1)}%
            </span>
          </div>
        )}
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
        <Dato icono="fa-location-dot" label="Ubicación de la obra" valor={obra.ubicacion} />
        <Dato icono="fa-phone" label="Cel a coordinar" valor={obra.celCoordinar} />
        <Dato icono="fa-calendar-check" label="Colocación pactada" valor={obra.fechaColocacion} />
        <Dato icono="fa-truck" label="Coordinar entrega con" valor={obra.coordinarEntrega.texto} />
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
