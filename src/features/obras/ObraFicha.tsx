import { EstadoBadge } from '@/components/ui/Aviso'
import { useTitulos } from '@/features/shared/useTitulos'
import { importe } from '@/lib/format'
import { COL } from '@/services/monday/columns'
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
 * Ficha de la obra. Va SÓLO en la etapa donde se elige y se carga (la 2).
 *
 * En las etapas 3, 4 y 5 no aparece, y es a propósito: ahí ya está decidido sobre qué obra se
 * trabaja —el encabezado la nombra— y repetir la ficha entera en cada pantalla es medio metro de
 * texto que hay que saltear para llegar al único botón que importa.
 *
 * Se muestra lo que se MIRA para decidir. La fecha de creación y el inventario de adjuntos estaban
 * y se sacaron: nadie decide nada con ellos y empujaban hacia abajo lo que sí importa.
 */
export function ObraFicha({ obra, children }: { obra: Obra; children?: React.ReactNode }) {
  const titulo = useTitulos()
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
          {/* Los rótulos son el NOMBRE REAL de la columna en el tablero. Quien ve algo raro acá
              lo siguiente que hace es ir a buscarlo a Monday, y un sinónimo propio convierte ese
              viaje en una adivinanza. */}
          <div className="obra-ficha-badges">
            <EstadoBadge label={titulo(COL.tipo, 'Tipo')} estado={obra.tipo} />
            <EstadoBadge label={titulo(COL.etapaProduccion, 'Producción')} estado={obra.etapaProduccion} />
            <EstadoBadge label={titulo(COL.etapaVenta, 'Venta')} estado={obra.etapaVenta} />
            <EstadoBadge label={titulo(COL.premarco, 'Premarco')} estado={obra.premarco} />
            <EstadoBadge label={titulo(COL.validacionCtaCte, 'Cta cte')} estado={obra.validacionCtaCte} />
            {/* El estado de la OP final NO va acá: es el estado de una corrida, y en las otras
                etapas dice cosas ("Generando") que no describen a la obra sino a lo que está
                pasando en otro lado. Se muestra donde se opera, en el paso 3. */}
            <EstadoBadge label={titulo(COL.confirmacionOp, 'Confirmación')} estado={obra.confirmacionOp} />
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

      {/* Primero el CLIENTE y después la obra: la pregunta que se hace al abrir una obra es "¿de
          quién es?", y recién con eso resuelto importa dónde queda y cuándo se coloca. */}
      <section className="obra-bloque">
        <h3 className="obra-bloque-t">Datos del cliente</h3>
        <div className="obra-vinculos">
          <Vinculo
            icono="fa-file-invoice-dollar"
            label={titulo(COL.ctaCteCliente, 'Cuenta corriente del cliente')}
            valor={obra.ctaCteCliente}
            extra={[obra.celCliente, obra.emailCliente].filter(Boolean).join(' · ')}
          />
          <Vinculo
            icono="fa-compass-drafting"
            label={titulo(COL.arquitecto, 'Constructor / Arquitecto')}
            valor={obra.arquitecto}
            extra={obra.celArquitecto}
          />
        </div>
      </section>

      <section className="obra-bloque">
        <h3 className="obra-bloque-t">Datos de la obra</h3>
        <div className="obra-datos-grid">
          <Dato
            icono="fa-location-dot"
            label={titulo(COL.ubicacion, 'Ubicación de la obra')}
            valor={obra.ubicacion}
          />
          <Dato
            icono="fa-phone"
            label={titulo(COL.celCoordinar, 'Cel a coordinar')}
            valor={obra.celCoordinar}
          />
          <Dato
            icono="fa-calendar-check"
            label={titulo(COL.fechaColocacion, 'Colocación pactada')}
            valor={obra.fechaColocacion}
          />
          <Dato
            icono="fa-truck"
            label={titulo(COL.coordinarEntrega, 'Coordinar entrega con')}
            valor={obra.coordinarEntrega.texto}
          />
          {/* Quién de Polifroni tiene la obra a cargo: es una columna de PERSONAS del tablero, o
              sea un usuario del sistema, no el cliente. Por eso vive con los datos de la obra. */}
          <Dato
            icono="fa-user-gear"
            label={titulo(COL.asignado, 'Asignado a')}
            valor={obra.asignado}
          />
        </div>
      </section>

    </div>
  )
}

/** La obra del estado global. Las vistas de paso no se dibujan sin ella, así que acá ya existe. */
export function useObra(): Obra {
  const { obra } = useApp()
  if (!obra) throw new Error('No hay obra seleccionada')
  return obra
}
