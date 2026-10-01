import { useRef, useState } from 'react'

export type EstadoSoltar = 'vacio' | 'procesando' | 'listo' | 'advertencia' | 'error'

interface SoltarArchivoProps {
  id: string
  /** El documento cargado (su nombre), o `null`. */
  archivo: string | null
  estado: EstadoSoltar
  /** Título y detalle de la cara, según el estado. En `vacio` se usa la consigna por defecto. */
  titulo?: string
  detalle?: string
  /** Lo que falta, en rojo, adentro del recuadro (p. ej. "Cargá el PDF original"). */
  reclamo?: string
  deshabilitado?: boolean
  onArchivo: (f: File) => void
  onQuitar?: () => void
  /** Acción extra junto al archivo (p. ej. "Leer de nuevo"). */
  accion?: { texto: string; onClick: () => void }
}

/**
 * El recuadro de arrastrar y soltar del cobro CONTADO de La Batea (`LectorComprobante`).
 *
 * El recuadro ENTERO es la zona de soltado, y adentro pasa todo: la consigna, el estado del
 * documento (subiendo, cargado, con error) y el documento cargado con sus acciones. Un botón
 * transparente cubre el recuadro: es el que abre el buscador y el que recibe el foco del teclado.
 */
export function SoltarArchivo({
  id,
  archivo,
  estado,
  titulo,
  detalle,
  reclamo,
  deshabilitado = false,
  onArchivo,
  onQuitar,
  accion,
}: SoltarArchivoProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cerrado = deshabilitado || estado === 'procesando'

  const tomar = (f: File | undefined) => {
    if (f && !cerrado) onArchivo(f)
  }

  return (
    <div
      className={`cobro-lector cobro-lector--${estado} ${dragOver && !cerrado ? 'is-over' : ''} ${
        reclamo ? 'is-falta' : ''
      }`}
      onDragOver={(e) => {
        if (cerrado) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (cerrado) return
        e.preventDefault()
        setDragOver(false)
        tomar(e.dataTransfer.files?.[0])
      }}
    >
      <button
        type="button"
        className="cobro-lector-hit"
        disabled={cerrado}
        title={
          estado === 'procesando'
            ? 'Esperá a que termine de procesarse el documento'
            : archivo
              ? 'Reemplazar el documento cargado'
              : 'Arrastrá para subir · PDF'
        }
        aria-label={
          estado === 'procesando'
            ? 'Procesando el documento: esperá a que termine'
            : archivo
              ? `Documento cargado: ${archivo}. Hacé click para reemplazarlo`
              : 'Subir el documento: arrastrá el archivo o hacé click para elegirlo'
        }
        onClick={() => inputRef.current?.click()}
      />

      <input
        ref={inputRef}
        id={id}
        type="file"
        hidden
        accept="application/pdf,.pdf"
        onChange={(e) => {
          tomar(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <span className={`cobro-lector-cara cobro-lector-cara--${estado}`} aria-live="polite">
        {estado === 'procesando' && (
          <>
            <span className="cobro-lector-spin" aria-hidden="true" />
            <span className="cobro-lector-titulo">{titulo ?? 'Procesando el documento…'}</span>
            {detalle && <span className="cobro-lector-consigna">{detalle}</span>}
          </>
        )}
        {estado === 'listo' && (
          <>
            <i className="fas fa-circle-check" aria-hidden="true" />
            <span className="cobro-lector-titulo">{titulo ?? 'Documento cargado'}</span>
            {detalle && <span className="cobro-lector-consigna">{detalle}</span>}
          </>
        )}
        {(estado === 'advertencia' || estado === 'error') && (
          <>
            <i
              className={`fas ${estado === 'error' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}`}
              aria-hidden="true"
            />
            <span className="cobro-lector-titulo">{titulo}</span>
            {detalle && <span className="cobro-lector-consigna">{detalle}</span>}
          </>
        )}
        {estado === 'vacio' && (
          <>
            <span className="cobro-lector-titulo">{titulo ?? 'Arrastrá para subir'}</span>
            <span className="cobro-lector-consigna">
              {detalle ?? 'Soltá en este área el PDF de la orden de producción, o hacé click para elegirlo'}
            </span>
            <i className="fas fa-cloud-arrow-up" />
            <span className="cobro-lector-reclamo" role="alert">
              {reclamo}
            </span>
          </>
        )}
      </span>

      {archivo && (
        <span className="cobro-lector-archivo">
          <i className="fas fa-paperclip" aria-hidden="true" />
          <span className="cobro-lector-nombre" title={archivo}>
            {archivo}
          </span>
          {accion && !cerrado && (
            <button type="button" className="cobro-lector-accion" onClick={accion.onClick}>
              {accion.texto}
            </button>
          )}
          {onQuitar && !cerrado && (
            <button
              type="button"
              className="cobro-lector-accion cobro-lector-accion--quitar"
              onClick={onQuitar}
              title="Quitar el documento"
            >
              Eliminar
            </button>
          )}
        </span>
      )}
    </div>
  )
}
