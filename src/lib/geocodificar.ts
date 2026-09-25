/**
 * De una dirección escrita a sus coordenadas.
 *
 * La columna de ubicación de Monday NO acepta una dirección sola: exige latitud y longitud (probado:
 * sin ellas rechaza el valor). Se buscan en OpenStreetMap (Nominatim), que es gratuito, no pide
 * clave y responde con CORS, así que se consulta directo desde el navegador. Se prioriza Argentina y
 * se devuelven varias opciones para que quien carga elija la correcta.
 */
export interface Direccion {
  lat: string
  lng: string
  /** Cómo la nombra el mapa: "619, Chile, Tandil, Buenos Aires, Argentina". */
  etiqueta: string
}

export async function buscarDirecciones(texto: string): Promise<Direccion[]> {
  const q = texto.trim()
  if (q.length < 3) return []
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ar&accept-language=es&q=' +
    encodeURIComponent(q)
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Búsqueda de direcciones: HTTP ${r.status}`)
  const d = (await r.json()) as { lat: string; lon: string; display_name: string }[]
  return d.map((x) => ({ lat: x.lat, lng: x.lon, etiqueta: x.display_name }))
}
