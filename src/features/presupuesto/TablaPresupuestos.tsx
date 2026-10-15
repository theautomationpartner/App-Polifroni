import { useEffect, useId, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { conTope } from '@/features/agenda/ModalErrorConsulta'
import { colorTipoCarpinteria } from '@/lib/presupuesto'
import { getOpcionesPresupuesto, getUrlArchivo, type OpcionesPresupuesto } from '@/services/monday'
import type { PresupuestoCargado } from './borrador'

/** 2,4 MB · 850 KB: el peso del PDF, como lo muestra la fila. */
export function peso(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Abre el PDF de la app en otra pestaña. La dirección es local (un `blob:`): se libera al rato, cuando
 * la pestaña ya lo leyó.
 */
export function verPdfLocal(archivo: File) {
  const url = URL.createObjectURL(archivo)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Abre en otra pestaña un PDF que ya está en Monday. La pestaña se abre ANTES de pedir la dirección
 * firmada: abrirla después de esperar a Monday la frena el bloqueador de ventanas del navegador.
 */
export async function verPdfMonday(assetId: string) {
  const w = window.open('', '_blank')
  try {
    const url = await getUrlArchivo(assetId)
    if (w) w.location.href = url
    else window.open(url, '_blank')
  } catch {
    w?.close()
  }
}

/** Las etiquetas de tipo de carpintería y color de una fila (la misma pastilla de los estados). */
export function Etiquetas({ tipo, color }: { tipo: string; color: string }) {
  return (
    <span className="pres-fila-tags">
      {tipo && (
        <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: colorTipoCarpinteria(tipo) }} title="Tipo de carpintería">
          {tipo}
        </span>
      )}
      {color && (
        <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: '#575ce5' }} title="Color">
          <i className="fas fa-palette" aria-hidden="true" /> {color}
        </span>
      )}
    </span>
  )
}

/** Las opciones de tipo y color, leídas una vez de las columnas del subelemento. */
export function useOpcionesPresupuesto(onError?: () => void): OpcionesPresupuesto | null {
  const [opciones, setOpciones] = useState<OpcionesPresupuesto | null>(null)
  useEffect(() => {
    let vivo = true
    conTope(getOpcionesPresupuesto())
      .then((o) => vivo && setOpciones(o))
      .catch(() => vivo && onError?.())
    return () => {
      vivo = false
    }
    // Una sola lectura al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return opciones
}

/** Corregir el tipo de carpintería y el color de un presupuesto ya agregado a la lista. */
function ModalEditarPresupuesto({
  p,
  onClose,
  onGuardar,
}: {
  p: PresupuestoCargado
  onClose: () => void
  onGuardar: (cambios: { tipo: string; color: string }) => void
}) {
  const uid = useId()
  const opciones = useOpcionesPresupuesto()
  const [tipo, setTipo] = useState(p.tipo)
  const [color, setColor] = useState(p.color)
  return (
    <Modal
      title="Editar presupuesto"
      icon={<i className="fas fa-pen modal-icon--info" />}
      onClose={onClose}
      className="ag-modal pres-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-marca"
            disabled={!tipo || !color}
            onClick={() => onGuardar({ tipo, color })}
          >
            Guardar
          </button>
        </>
      }
    >
      <p className="modal-clave">{p.archivo.name}</p>
      {/* `carga-grid`: los campos en bordó, como en la carga del presupuesto. */}
      <div className="carga-grid pres-modal-campos">
        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-tipo`}>
            Tipo de carpintería *
          </label>
          <SelectBuscable
            id={`${uid}-tipo`}
            valor={tipo}
            opciones={(opciones?.tipos ?? []).map((t) => ({ valor: t, texto: t }))}
            placeholder="Elegí el tipo de carpintería"
            cargando={!opciones}
            textoCargando="Leyendo los tipos…"
            onElegir={setTipo}
          />
        </div>
        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-color`}>
            Color *
          </label>
          <SelectBuscable
            id={`${uid}-color`}
            valor={color}
            opciones={(opciones?.colores ?? []).map((c) => ({ valor: c, texto: c }))}
            placeholder="Elegí el color"
            cargando={!opciones}
            textoCargando="Leyendo los colores…"
            onElegir={setColor}
          />
        </div>
      </div>
    </Modal>
  )
}

/**
 * "Presupuestos a enviar": la lista de los presupuestos agregados, uno por fila (una card): el ícono
 * del PDF con su nombre y su peso, el tipo de carpintería, el color y sus acciones
 * —ver el PDF y, en la etapa de carga, corregir tipo y color (lápiz) o sacarlo de la lista—.
 *
 * En la etapa de envío va sin edición (`onEditar` ausente), y marca los que el responsable tiene que
 * confirmar.
 */
export function TablaPresupuestos({
  presupuestos,
  onEditar,
  onQuitar,
  aConfirmar = [],
  bloqueado = false,
  sinCard = false,
}: {
  presupuestos: PresupuestoCargado[]
  onEditar?: (id: string, cambios: { tipo: string; color: string }) => void
  onQuitar?: (id: string) => void
  /** Los que el responsable tiene que confirmar: llevan la etiqueta. */
  aConfirmar?: string[]
  /** Ya se enviaron: no se edita nada. */
  bloqueado?: boolean
  /** Va adentro de otro componente (la carga): sin card propia. */
  sinCard?: boolean
}) {
  const [editando, setEditando] = useState<PresupuestoCargado | null>(null)

  return (
    <div className={sinCard ? 'pres-lista' : 'card carga-datos pres-lista'}>
      <h3 className="carga-sec-t">
        <i className="fas fa-list-ul" /> Presupuestos a enviar
        <span className="ag-tab-n pres-lista-n">{presupuestos.length}</span>
      </h3>

      {presupuestos.length === 0 ? (
        <div className="pres-lista-vacia">
          <i className="fas fa-file-circle-plus" aria-hidden="true" />
          <span>Todavía no agregaste presupuestos. Completá los datos, cargá el PDF y tocá «Agregar a la lista».</span>
        </div>
      ) : (
        <div className="pres-filas" role="list">
          {presupuestos.map((p) => (
            <div key={p.id} className="pres-fila" role="listitem">
              <span className="pres-fila-ic" aria-hidden="true">
                PDF
              </span>
              <span className="pres-fila-arch">
                <span className="pres-fila-nombre" title={p.archivo.name}>
                  {p.archivo.name}
                </span>
                <span className="pres-fila-peso">{peso(p.archivo.size)}</span>
              </span>
              <Etiquetas tipo={p.tipo} color={p.color} />
              <span className="pres-fila-acc">
                {aConfirmar.includes(p.id) && <span className="cbadge cbadge--confirmador">A confirmar</span>}
                <button type="button" className="btn btn-out pres-ficha-btn" onClick={() => verPdfLocal(p.archivo)}>
                  <i className="fas fa-eye" /> Ver Presup
                </button>
                {onEditar && (
                  <button
                    type="button"
                    className="pres-fila-icono"
                    aria-label={`Editar tipo y color de ${p.archivo.name}`}
                    title={bloqueado ? 'Ya se envió: no se puede editar' : 'Editar tipo de carpintería y color'}
                    disabled={bloqueado}
                    onClick={() => setEditando(p)}
                  >
                    <i className="fas fa-pen" />
                  </button>
                )}
                {onQuitar && (
                  <button
                    type="button"
                    className="pres-fila-icono pres-fila-icono--quitar"
                    aria-label={`Quitar ${p.archivo.name} de la lista`}
                    title={bloqueado ? 'Ya se envió: no se puede quitar' : 'Quitar de la lista'}
                    disabled={bloqueado}
                    onClick={() => onQuitar(p.id)}
                  >
                    <i className="fas fa-trash-can" />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {editando && onEditar && (
        <ModalEditarPresupuesto
          p={editando}
          onClose={() => setEditando(null)}
          onGuardar={(c) => {
            onEditar(editando.id, c)
            setEditando(null)
          }}
        />
      )}
    </div>
  )
}
