import { useEffect, useId, useState, type ReactNode } from 'react'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { SoltarArchivo } from '@/components/ui/SoltarArchivo'
import { ArchivoMuyPesado, prepararArchivoParaSubir } from '@/services/monday'
import { useOpcionesPresupuesto } from './TablaPresupuestos'

/**
 * "Datos del presupuesto": el tipo de carpintería, el color (las etiquetas de las columnas del
 * tablero) y el PDF (arrastrar y soltar). Es el formulario de la etapa 2 de "Crear y Cargar
 * Presupuestos", y el mismo de «+Nuevo» en la consulta.
 *
 * El PDF se prepara al soltarlo con el mismo filtro que se aplica al subir: un archivo que no entra en
 * el tope de Vercel se rechaza AHORA, no al registrarlo. `children`: lo que va debajo del recuadro (el
 * botón "Agregar a la lista" de la etapa 2).
 */
export function DatosPresupuesto({
  tipo,
  color,
  archivo,
  onCambiar,
  marcar = false,
  bloqueado = false,
  listo,
  onPreparando,
  onErrorMonday,
  children,
}: {
  tipo: string
  color: string
  archivo: File | null
  onCambiar: (cambios: { tipo?: string; color?: string; archivo?: File | null }) => void
  /** Se intentó seguir con algo incompleto: se marca qué falta. */
  marcar?: boolean
  /** Ya se envió: no se cambia nada. */
  bloqueado?: boolean
  /** La cara del recuadro con el PDF cargado (por defecto, "PDF listo para agregar"). */
  listo?: { titulo: string; detalle?: string }
  onPreparando?: (preparando: boolean) => void
  /** No se pudieron leer las opciones de Monday: qué se estaba haciendo. */
  onErrorMonday: (accion: string) => void
  children?: ReactNode
}) {
  const uid = useId()
  const opciones = useOpcionesPresupuesto(() => onErrorMonday('leer los tipos de carpintería y los colores'))
  const [error, setError] = useState('')
  const [preparando, setPreparando] = useState(false)

  useEffect(() => onPreparando?.(preparando), [preparando]) // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = async (elegido: File) => {
    if (!/pdf$/i.test(elegido.type || elegido.name)) {
      setError('El archivo tiene que ser un PDF.')
      return
    }
    setError('')
    setPreparando(true)
    try {
      onCambiar({ archivo: await prepararArchivoParaSubir(elegido) })
    } catch (e) {
      setError(e instanceof ArchivoMuyPesado ? e.message : 'No se pudo preparar el documento. Probá de nuevo en unos segundos.')
    } finally {
      setPreparando(false)
    }
  }

  return (
    /* `carga-grid`: los campos y el recuadro en bordó, igual que la carga de la OP. */
    <div className="carga-grid pres-carga">
      <section className="carga-sec">
        <h3 className="carga-sec-t">
          <i className="fas fa-file-invoice-dollar" /> Datos del presupuesto
        </h3>
        <fieldset className="med" disabled={bloqueado}>
          <div className="med-grid pres-datos">
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-tipo`}>
                Tipo de carpintería *
              </label>
              <SelectBuscable
                id={`${uid}-tipo`}
                valor={tipo}
                opciones={(opciones?.tipos ?? []).map((t) => ({ valor: t, texto: t }))}
                placeholder="Elegí el tipo"
                cargando={!opciones}
                textoCargando="Leyendo los tipos…"
                disabled={bloqueado}
                falta={marcar && !tipo}
                onElegir={(v) => onCambiar({ tipo: v })}
              />
            </div>

            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-color`}>
                Color *
              </label>
              <SelectBuscable
                id={`${uid}-color`}
                valor={color}
                opciones={(opciones?.colores ?? []).map((c) => ({ valor: c, texto: c }))}
                placeholder="Elegí el color"
                cargando={!opciones}
                textoCargando="Leyendo los colores…"
                disabled={bloqueado}
                falta={marcar && !color}
                onElegir={(v) => onCambiar({ color: v })}
              />
            </div>
          </div>
        </fieldset>
        <SoltarArchivo
          id={`${uid}-pdf`}
          archivo={archivo?.name ?? null}
          estado={preparando ? 'procesando' : error ? 'error' : archivo ? 'listo' : 'vacio'}
          titulo={
            preparando ? 'Procesando documento…' : error ? 'No se pudo cargar' : archivo ? (listo?.titulo ?? 'PDF listo para agregar') : undefined
          }
          detalle={error || (archivo ? listo?.detalle : 'Soltá en este área el PDF del presupuesto, o hacé click para elegirlo')}
          reclamo={marcar && !archivo ? 'Cargá el PDF del presupuesto' : undefined}
          deshabilitado={bloqueado || preparando}
          onArchivo={(f) => void elegir(f)}
          onQuitar={archivo && !bloqueado && !preparando ? () => onCambiar({ archivo: null }) : undefined}
        />
        {children}
      </section>
    </div>
  )
}
