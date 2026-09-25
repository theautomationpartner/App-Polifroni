import { useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { Modal } from '@/components/ui/Modal'
import { buscarDirecciones, type Direccion } from '@/lib/geocodificar'
import { guardarDatosCoordinacion } from '@/services/monday'
import type { Obra } from '@/types'

/**
 * Los dos datos de la obra sin los que la OP final no se puede generar: la ubicación y el celular a
 * coordinar. El escenario que arma el documento los exige, y si faltan corta sin avisar.
 *
 * Se piden APENAS se entra al paso, no al apretar "Generar": descubrirlo al final, después de cargar
 * el documento y escribir las observaciones, es hacer esperar a alguien para decirle que no. La
 * ventana no se puede saltear: cerrarla vuelve a la elección de obra.
 */
export function DatosObraFaltantes({
  obra,
  onGuardado,
  onSalir,
}: {
  obra: Obra
  onGuardado: () => Promise<void>
  onSalir: () => void
}) {
  const faltaUbicacion = !obra.ubicacion.trim()
  const faltaCelular = !obra.celCoordinar.trim()

  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<Direccion[] | null>(null)
  const [elegida, setElegida] = useState<Direccion | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [celular, setCelular] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const digitos = celular.replace(/\D/g, '')
  const celularOk = !faltaCelular || digitos.length >= 10
  const ubicacionOk = !faltaUbicacion || !!elegida
  const listo = celularOk && ubicacionOk

  const buscar = async () => {
    setError('')
    setBuscando(true)
    setElegida(null)
    try {
      const r = await buscarDirecciones(texto)
      setOpciones(r)
      if (r.length === 1) setElegida(r[0])
    } catch {
      setOpciones([])
      setError('No se pudo buscar la dirección. Probá de nuevo en unos segundos.')
    } finally {
      setBuscando(false)
    }
  }

  const guardar = async () => {
    setError('')
    setGuardando(true)
    try {
      await guardarDatosCoordinacion(obra.id, {
        ubicacion: faltaUbicacion && elegida
          ? { lat: elegida.lat, lng: elegida.lng, address: texto.trim() || elegida.etiqueta }
          : undefined,
        celular: faltaCelular ? digitos : undefined,
      })
      await onGuardado()
    } catch {
      setError('No se pudieron guardar los datos en la obra.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      title="Faltan datos de la obra"
      icon={<i className="fas fa-location-dot modal-icon--warn" />}
      onClose={onSalir}
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onSalir} disabled={guardando}>
            Elegir otra obra
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!listo || guardando}
            onClick={() => void guardar()}
          >
            {guardando ? (
              <>
                <i className="fas fa-circle-notch spin" /> Guardando…
              </>
            ) : (
              'Guardar y seguir'
            )}
          </button>
        </>
      }
    >
      <p className="modal-nota">
        Son necesarios para generar la OP final. Se guardan en la obra.
      </p>

      <div className="dof">
        {faltaUbicacion && (
          <div className="med-campo">
            <label className="med-l" htmlFor="dof-dir">
              Ubicación de la obra
            </label>
            <div className="dof-fila">
              <input
                id="dof-dir"
                className="med-input"
                type="text"
                autoComplete="off"
                placeholder="Calle y número, ciudad"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value)
                  setOpciones(null)
                  setElegida(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && texto.trim().length >= 3 && void buscar()}
              />
              <button
                type="button"
                className="btn btn-out btn--sm"
                disabled={texto.trim().length < 3 || buscando}
                onClick={() => void buscar()}
              >
                {buscando ? <i className="fas fa-circle-notch spin" /> : <i className="fas fa-magnifying-glass" />}{' '}
                Buscar
              </button>
            </div>
            {/* El mapa puede entender la dirección de más de una forma: se elige cuál es. */}
            {opciones && opciones.length > 0 && (
              <ul className="dof-opciones" role="listbox">
                {opciones.map((o) => (
                  <li
                    key={`${o.lat},${o.lng}`}
                    role="option"
                    aria-selected={elegida === o}
                    className={`dof-op ${elegida === o ? 'dof-op--elegida' : ''}`}
                    onClick={() => setElegida(o)}
                  >
                    <i className={`fas ${elegida === o ? 'fa-circle-check' : 'fa-location-dot'}`} />
                    <span>{o.etiqueta}</span>
                  </li>
                ))}
              </ul>
            )}
            {opciones && opciones.length === 0 && !error && (
              <p className="dof-nota">No se encontró. Probá con calle, número y ciudad.</p>
            )}
          </div>
        )}

        {faltaCelular && (
          <div className="med-campo">
            <label className="med-l" htmlFor="dof-cel">
              Celular a coordinar
              <span className="med-l-sub">con código de país y de área, sin 0 ni 15</span>
            </label>
            <input
              id="dof-cel"
              className="med-input"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="Ej: 5492494520152"
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
            />
          </div>
        )}

        {error && <Aviso tono="err">{error}</Aviso>}
      </div>
    </Modal>
  )
}
