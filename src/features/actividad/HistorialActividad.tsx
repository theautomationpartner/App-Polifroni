import { useEffect, useState } from 'react'
import { fechaHora, htmlATexto } from '@/lib/texto'
import { getActividades } from '@/services/monday'
import type { Actividad } from '@/types'

interface HistorialProps {
  itemId: string
  /** Cambiar este número fuerza a releer (después de una acción que escribe en el historial). */
  recargar?: number
  limite?: number
}

/** Ícono según de qué habla la entrada: se reconoce el tipo de evento sin leer el texto entero. */
function iconoDe(texto: string): string {
  const t = texto.toLowerCase()
  if (t.includes('error') || t.includes('falta')) return 'fa-triangle-exclamation'
  if (t.includes('whatsapp') || t.includes('envi')) return 'fa-paper-plane'
  if (t.includes('taller')) return 'fa-screwdriver-wrench'
  if (t.includes('confirm')) return 'fa-circle-check'
  if (t.includes('adjunt') || t.includes('documento')) return 'fa-paperclip'
  return 'fa-comment'
}

/**
 * Historial de actividades del ítem: los updates de Monday, del más nuevo al más viejo.
 *
 * Es el registro de todo lo que pasó con la obra —lo que escriben los escenarios y lo que registra
 * esta app—, así que se lee tal cual del tablero en vez de llevar una copia propia.
 */
export function HistorialActividad({ itemId, recargar = 0, limite = 20 }: HistorialProps) {
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(false)
    getActividades(itemId, limite)
      .then((a) => vivo && setActividades(a))
      .catch(() => vivo && setError(true))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [itemId, limite, recargar])

  if (cargando) {
    return (
      <div className="hist-vacio">
        <i className="fas fa-circle-notch spin" /> Leyendo el historial…
      </div>
    )
  }
  if (error) return <div className="hist-vacio">No se pudo leer el historial de la obra.</div>
  if (actividades.length === 0) {
    return <div className="hist-vacio">Todavía no hay actividad registrada en esta obra.</div>
  }

  return (
    <div className="hist">
      {actividades.map((a) => {
        const texto = htmlATexto(a.body)
        return (
          <article className="hist-item" key={a.id}>
            <span className="hist-ic">
              <i className={`fas ${iconoDe(texto)}`} />
            </span>
            <div className="hist-body">
              <div className="hist-cab">
                <span className="hist-autor">{a.autor}</span>
                <span className="hist-fecha">{fechaHora(a.fecha)}</span>
              </div>
              <p className="hist-txt" style={{ whiteSpace: 'pre-wrap' }}>
                {texto}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
