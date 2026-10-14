import { useState } from 'react'
import { formatearImporte, importeEscrito, pesos, proyeccion, type TipoFacturacion } from '@/lib/facturacion'

/** Asterisco rojo que marca un campo obligatorio, igual que en el anticipo de La Batea. */
const Req = () => <span className="cobro-req"> *</span>

/**
 * El monto del comprobante: el MISMO elemento del importe del anticipo en "Registrar cobro" de La Batea
 * (`DatosAnticipo`): la banda con el ícono en pastilla, el importe en grande sobre una línea —que se
 * pone en rojo mientras falta o no vale— y la aclaración debajo. Se escribe con el formato de la casa
 * mientras se tipea ("30409" → "30.409"; la coma agrega centavos).
 *
 * Debajo, cómo queda la obra con ese monto (las métricas de la cabecera del cobro): lo que se cancela (o
 * se anula) de lo pendiente y lo que queda pendiente de facturar.
 */
export function MontoComprobante({
  id,
  rotulo,
  valor,
  problema,
  bloqueado = false,
  aclaracion,
  tipo,
  obra,
  onCambio,
}: {
  id: string
  rotulo: string
  /** El monto, tal como se escribe ("1.297.684,50"). */
  valor: string
  /** Por qué no vale. Con él, la línea va en rojo y el motivo se muestra debajo. */
  problema: string | null
  bloqueado?: boolean
  aclaracion: string
  tipo: TipoFacturacion
  /** Lo facturado y lo pendiente de la obra HOY. */
  obra: { facturado: number; pendiente: number }
  onCambio: (texto: string) => void
}) {
  const [texto, setTexto] = useState(valor)
  const [ultimo, setUltimo] = useState(valor)
  // El monto puede cambiar desde afuera (otra factura asociada, "todo lo pendiente"): el campo lo sigue.
  if (ultimo !== valor) {
    setUltimo(valor)
    setTexto(valor)
  }

  const cambiar = (entrada: string) => {
    const { texto: t } = formatearImporte(entrada)
    setTexto(t)
    setUltimo(t)
    onCambio(t)
  }

  const n = importeEscrito(texto) ?? 0
  const p = proyeccion(obra, n, tipo)
  const nc = tipo === 'notaCredito'

  return (
    <div className="fac-monto-bloque">
      <section className="cobro-anticipo">
        <div className="cobro-anticipo-ic">
          <i className={`fas ${nc ? 'fa-file-circle-minus' : 'fa-sack-dollar'}`} />
        </div>

        <div className="cobro-anticipo-campos">
          <div className="cobro-anticipo-campo cobro-anticipo-campo--importe">
            <label className="cobro-anticipo-lbl" htmlFor={id}>
              {rotulo}
              <Req />
            </label>
            <span className={`cobro-anticipo-monto ${problema ? 'cobro-anticipo-monto--falta' : ''}`}>
              <span className="cobro-anticipo-pre">$</span>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                autoComplete="off"
                value={texto}
                readOnly={bloqueado}
                aria-invalid={!!problema || undefined}
                aria-describedby={`${id}-msj`}
                onChange={(e) => !bloqueado && cambiar(e.target.value)}
              />
            </span>
          </div>
        </div>

        <p id={`${id}-msj`} className={`cobro-anticipo-hint ${problema ? 'cobro-anticipo-hint--err' : ''}`}>
          <i className={`fas ${problema ? 'fa-circle-exclamation' : 'fa-circle-info'}`} /> {problema ?? aclaracion}
        </p>
      </section>

      {/* Cómo queda la obra con este monto. */}
      <div className="cobro-cab fac-proyeccion" aria-live="polite">
        <div className="cobro-cab-mets">
          <Metrica
            icono={nc ? 'fa-rotate-left' : 'fa-file-invoice-dollar'}
            tono="azul"
            rotulo={nc ? 'Se anula de lo facturado' : 'Se cancela del pend. de facturar'}
            valor={pesos(problema ? 0 : p.monto)}
          />
          {/* Lo que queda pendiente va siempre en rojo (regla del usuario, 14/10/2026). */}
          <Metrica
            icono="fa-hourglass-half"
            tono="rojo"
            rotulo="Quedará pend. de facturar"
            valor={pesos(problema ? obra.pendiente : p.quedaPendiente)}
          />
        </div>
      </div>
    </div>
  )
}

/** Métrica destacada: ícono en pastilla, rótulo y cifra (la `MetricaCobro` de La Batea). */
function Metrica({ icono, tono, rotulo, valor }: { icono: string; tono: 'azul' | 'verde' | 'rojo'; rotulo: string; valor: string }) {
  return (
    <div className="cobro-cab-met">
      <span className={`cobro-cab-ic cobro-cab-ic--${tono}`}>
        <i className={`fas ${icono}`} />
      </span>
      <div className="cobro-cab-campo">
        <span className="cobro-cab-lbl cobro-cab-lbl--met">{rotulo}</span>
        <span className={`cobro-cab-num cobro-cab-num--${tono}`}>{valor}</span>
      </div>
    </div>
  )
}
