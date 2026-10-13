import { useId, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { SoltarArchivo } from '@/components/ui/SoltarArchivo'
import { ModalErrorConsulta } from '@/features/agenda/ModalErrorConsulta'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { etiquetaPaso } from '@/lib/pasos'
import { ArchivoMuyPesado, prepararArchivoParaSubir } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { idFila, type PresupuestoCargado } from './borrador'
import { TablaPresupuestos, useOpcionesPresupuesto } from './TablaPresupuestos'

/**
 * Crear y Cargar Presupuestos · Etapa 2: los presupuestos que se van a enviar (uno o varios).
 *
 * A la izquierda, "Datos del presupuesto": el tipo de carpintería, el color (las etiquetas de las
 * columnas del tablero) y el PDF (arrastrar y soltar, sólo de carga). "Agregar a la lista" lo suma a
 * "Presupuestos a enviar", a la derecha, y deja el formulario listo para el siguiente. En la lista, el
 * lápiz corrige el tipo y el color, y el tacho lo saca.
 *
 * En Monday no se escribe nada: los PDF viven en la app hasta que se envían (etapa 3).
 */
export function CargarPresupuestoView() {
  const uid = useId()
  const dispatch = useDispatch()
  const { presupuesto, enviado } = useApp()
  const { archivo, tipo, color, modo, bolsa, cliente, arquitecto, presupuestos } = presupuesto
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  const opciones = useOpcionesPresupuesto(() => setErrorMonday('leer los tipos de carpintería y los colores'))
  const [error, setError] = useState('')
  const [preparando, setPreparando] = useState(false)
  /** Se intentó agregar o seguir con algo incompleto: se marca qué falta. */
  const [marcar, setMarcar] = useState(false)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string; faltantes?: string[] } | null>(null)

  useAccionEnCurso('Esperá a que termine de prepararse el documento.', preparando)

  const cambiar = (cambios: Partial<typeof presupuesto>) => dispatch({ type: 'setPresupuesto', cambios })
  /* Un presupuesto nuevo, otro tipo u otro color cambian lo que sale: el envío que hubiera salido ya no vale. */
  const cambiarLista = (lista: PresupuestoCargado[]) => cambiar({ presupuestos: lista, envio: null })

  const elegir = async (elegido: File) => {
    if (!/pdf$/i.test(elegido.type || elegido.name)) {
      setError('El archivo tiene que ser un PDF.')
      return
    }
    setError('')
    setPreparando(true)
    try {
      /* El mismo filtro que se aplica al subir: un archivo que no entra en el tope de Vercel se
         rechaza AHORA, no al finalizar. */
      cambiar({ archivo: await prepararArchivoParaSubir(elegido) })
    } catch (e) {
      setError(e instanceof ArchivoMuyPesado ? e.message : 'No se pudo preparar el documento. Probá de nuevo en unos segundos.')
    } finally {
      setPreparando(false)
    }
  }

  const faltan = [
    ...(!tipo ? ['Indicá el tipo de carpintería.'] : []),
    ...(!color ? ['Indicá el color.'] : []),
    ...(!archivo ? ['Cargá el PDF del presupuesto.'] : []),
  ]

  const agregar = () => {
    if (preparando) return
    if (faltan.length || !archivo) {
      setMarcar(true)
      setAviso({ titulo: 'Todavía no se puede agregar', texto: 'Completá lo siguiente para sumarlo a la lista:', faltantes: faltan })
      return
    }
    if (presupuestos.some((p) => p.archivo.name === archivo.name && p.archivo.size === archivo.size)) {
      setAviso({ titulo: 'Ese PDF ya está en la lista', texto: `«${archivo.name}» ya se agregó a «Presupuestos a enviar».` })
      return
    }
    cambiarLista([...presupuestos, { id: idFila(), archivo, tipo, color, clave: null, subitemId: null, pdfSubido: false }])
    /* El formulario queda vacío para el siguiente: tipo de carpintería, color y PDF (regla del usuario,
       09/10/2026). */
    cambiar({ archivo: null, tipo: '', color: '' })
    setMarcar(false)
  }

  const continuar = () => {
    if (preparando) return
    if (!presupuestos.length) {
      setAviso({
        titulo: 'Todavía no hay presupuestos para enviar',
        texto: 'Agregá al menos un presupuesto a la lista «Presupuestos a enviar» para continuar.',
      })
      return
    }
    /* Un PDF cargado y sin agregar se perdería sin que nadie lo note. */
    if (archivo) {
      setAviso({
        titulo: 'Hay un PDF sin agregar a la lista',
        texto: `«${archivo.name}» está cargado pero no está en «Presupuestos a enviar». Tocá «Agregar a la lista» o quitalo para continuar.`,
      })
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  const para = modo === 'cargar' ? bolsa?.nombre : [cliente?.nombre, arquitecto?.nombre].filter(Boolean).join(' y ')

  return (
    <section className="view paso-layout obras-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('carga', null, null, 'presupuestos', modo)}
        descripcion={
          <>
            Indicá el tipo de carpintería y el color, cargá el PDF y agregalo a la lista. Podés agregar más de un
            presupuesto.{' '}
            {para && (
              <>
                {modo === 'cargar' ? 'Presupuesto: ' : 'Para: '}
                <strong>{para}</strong>
              </>
            )}
          </>
        }
      />

      {/* UN solo componente: "Datos del presupuesto" a la izquierda y "Presupuestos a enviar" a la
          derecha, separados sólo por una línea divisoria (arriba/abajo si no hay ancho). */}
      <div className="card carga-datos pres-unido">
        {/* `carga-grid`: los campos y el recuadro en bordó, igual que la carga de la OP. */}
        <div className="carga-grid pres-carga">
            <section className="carga-sec">
              <h3 className="carga-sec-t">
                <i className="fas fa-file-invoice-dollar" /> Datos del presupuesto
              </h3>
              <fieldset className="med" disabled={enviado}>
                <div className="med-grid pres-datos">
                  <div className="med-campo">
                    <label className="med-l" htmlFor={`${uid}-tipo`}>
                      Tipo de carpintería *
                    </label>
                    <SelectBuscable
                      id={`${uid}-tipo`}
                      valor={tipo}
                      opciones={(opciones?.tipos ?? []).map((t) => ({ valor: t, texto: t }))}
                      placeholder="Elegí el tipo de carpintería"
                      cargando={!opciones}
                      textoCargando="Leyendo los tipos…"
                      disabled={enviado}
                      falta={marcar && !tipo}
                      onElegir={(v) => cambiar({ tipo: v })}
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
                      disabled={enviado}
                      falta={marcar && !color}
                      onElegir={(v) => cambiar({ color: v })}
                    />
                  </div>
                </div>
              </fieldset>
              <SoltarArchivo
                id="pres-pdf"
                archivo={archivo?.name ?? null}
                estado={preparando ? 'procesando' : error ? 'error' : archivo ? 'listo' : 'vacio'}
                titulo={preparando ? 'Procesando documento…' : error ? 'No se pudo cargar' : archivo ? 'PDF listo para agregar' : undefined}
                detalle={error || (archivo ? undefined : 'Soltá en este área el PDF del presupuesto, o hacé click para elegirlo')}
                reclamo={marcar && !archivo ? 'Cargá el PDF del presupuesto' : undefined}
                deshabilitado={enviado || preparando}
                onArchivo={(f) => void elegir(f)}
                onQuitar={archivo && !enviado && !preparando ? () => cambiar({ archivo: null }) : undefined}
              />
              <button
                type="button"
                className="btn btn-primary btn-marca pres-agregar"
                disabled={enviado || preparando}
                onClick={agregar}
              >
                <i className="fas fa-plus" /> Agregar a la lista
              </button>
            </section>
        </div>

        <TablaPresupuestos
          presupuestos={presupuestos}
          /* Cargar sobre uno existente: arriba, los que ya se le mandaron (sólo para ver). */
          enviados={modo === 'cargar' ? (bolsa?.presupuestos ?? []) : []}
          sinCard
          bloqueado={enviado}
          onEditar={(id, c) => cambiarLista(presupuestos.map((p) => (p.id === id ? { ...p, ...c } : p)))}
          onQuitar={(id) => cambiarLista(presupuestos.filter((p) => p.id !== id))}
        />
      </div>

      <PieEtapa>
        <button type="button" className="btn btn-primary" disabled={preparando} onClick={continuar}>
          Continuar a {etiquetaPaso('envio', null, null, 'presupuestos', modo)} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {aviso && (
        <AvisoModal titulo={aviso.titulo} faltantes={aviso.faltantes} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </section>
  )
}
