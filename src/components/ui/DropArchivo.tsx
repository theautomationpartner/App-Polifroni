import { useRef, useState } from 'react'

interface DropArchivoProps {
  id: string
  /** Nombre del archivo ya elegido; vacío = todavía no hay ninguno. */
  nombre: string
  onArchivo: (archivo: File | null) => void
  /** Tipos aceptados por el `input` (por defecto, PDF). */
  accept?: string
  disabled?: boolean
  /** Texto de la zona vacía. */
  hint?: string
}

/**
 * Zona de arrastrar y soltar con un `input[type=file]` real debajo, igual que el adjunto de
 * comprobantes de La Batea. El archivo se sube a Monday recién cuando el paso lo confirma: acá
 * sólo se elige.
 */
export function DropArchivo({
  id,
  nombre,
  onArchivo,
  accept = 'application/pdf',
  disabled = false,
  hint = 'Arrastrá y soltá el PDF de la Orden ETMO, o hacé click para elegirlo',
}: DropArchivoProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`drop ${dragOver ? 'is-over' : ''} ${nombre ? 'has-file' : ''}`}
      onClick={() => !disabled && fileRef.current?.click()}
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragOver(false)
        onArchivo(e.dataTransfer.files?.[0] ?? null)
      }}
    >
      <input
        ref={fileRef}
        id={id}
        type="file"
        accept={accept}
        hidden
        disabled={disabled}
        onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
      />
      {nombre ? (
        <span className="drop-file">
          <i className="fas fa-file-pdf" />
          <span>{nombre}</span>
          <button
            type="button"
            className="drop-x"
            aria-label="Quitar el archivo"
            onClick={(e) => {
              e.stopPropagation()
              onArchivo(null)
              if (fileRef.current) fileRef.current.value = ''
            }}
          >
            <i className="fas fa-xmark" />
          </button>
        </span>
      ) : (
        <span className="drop-hint">
          <i className="fas fa-cloud-arrow-up" /> {hint}
        </span>
      )}
    </div>
  )
}
