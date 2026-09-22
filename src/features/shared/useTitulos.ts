import { useEffect, useState } from 'react'
import { getEstructuraBoard } from '@/services/monday'

/**
 * Los títulos de las columnas, tal cual están escritos en el tablero.
 *
 * La app llama a las cosas como las llama Monday —"✋Tipo", "🤖 Estado de Envío OP"— y no con un
 * sinónimo propio. El motivo es práctico: cuando alguien ve un dato raro en la pantalla, el
 * siguiente paso es ir a buscarlo al tablero, y dos nombres distintos para la misma columna
 * convierten ese viaje en una adivinanza.
 *
 * Los títulos salen de la MISMA lectura que ya trae los colores de las etiquetas
 * (`getEstructuraBoard`), así que esto no agrega ninguna consulta.
 */
/**
 * Del título se saca el ✋ / 🤖 del principio y nada más.
 *
 * Ese símbolo no es parte del nombre del campo: es la convención con la que el tablero marca qué
 * columna se carga a mano y cuál escribe una automatización. Adentro de la app esa distinción ya no
 * la decide nadie, y en un rótulo en mayúsculas el emoji sólo ensucia. El resto del nombre queda
 * palabra por palabra como está en Monday, que es lo que hace que buscarlo allá sea directo.
 */
const sinMarca = (t: string) => t.replace(/^[^\p{L}\p{N}%#(]+/u, '').trim()

let cache: Record<string, string> | null = null

export function useTitulos(): (id: string, porDefecto?: string) => string {
  const [, redibujar] = useState(0)

  useEffect(() => {
    if (cache) return
    let vivo = true
    void getEstructuraBoard()
      .then((estructura) => {
        cache = Object.fromEntries(
          Object.entries(estructura).map(([id, c]) => [id, sinMarca(c.title)]),
        )
        if (vivo) redibujar((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  /* Hasta que la estructura llegue se usa el nombre de respaldo. Nunca se muestra el id: a quien
     mira la pantalla un `color_mm1kddt0` no le dice nada. */
  return (id, porDefecto = '') => cache?.[id] || porDefecto
}
