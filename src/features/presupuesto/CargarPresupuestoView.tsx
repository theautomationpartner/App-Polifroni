import { useEffect, useId, useState } from 'react'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { SoltarArchivo } from '@/components/ui/SoltarArchivo'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { FinalizarOperacion, type TextosFinalizar } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { etiquetaPaso } from '@/lib/pasos'
import { ArchivoMuyPesado, getOpcionesPresupuesto, prepararArchivoParaSubir, type OpcionesPresupuesto } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { EnviarPresupuesto } from './EnviarPresupuesto'
import { registrarPresupuesto } from './registrar'

const TEXTOS_FINALIZAR: TextosFinalizar = {
  enviado: 'Presupuesto enviado',
  sinEnviar: 'Operación finalizada',
  preguntaTitulo: 'El presupuesto todavía no se envió',
  pregunta:
    'El presupuesto se registra en el sistema recién cuando se envía. Si finalizás ahora, no se guarda nada y lo cargado se pierde.',
  registrando: 'Registrando presupuesto y envío en el sistema...',
  registrandoDetalle: 'Guardamos el presupuesto en Monday con su PDF y dejamos constancia del envío. Esperá unos segundos.',
  errorTitulo: 'No se pudo registrar el presupuesto',
  error:
    'Monday no respondió al intentar registrar el presupuesto. El presupuesto YA se envió: reintentá «Finalizar Operación» en unos segundos para no perder el registro. Si la falla persiste, contactate con el soporte de TAP.',
}

/**
 * Crear y Cargar Presupuestos · Etapa 2: el presupuesto y su envío.
 *
 * A la izquierda, el PDF del presupuesto (el recuadro de arrastrar y soltar, sólo de carga) y sus
 * datos: el tipo de carpintería y el color, con las etiquetas de las columnas del tablero. A la
 * derecha, el bloque de envío —el mismo de "Enviar OP"—.
 *
 * Es la misma etapa al crear uno nuevo y al cargar otro: cambia sólo dónde se registra. En Monday no
 * se escribe nada hasta que el presupuesto sale; apenas sale, "Finalizar Operación" lo registra solo
 * (ver `registrarPresupuesto`).
 */
export function CargarPresupuestoView() {
  const uid = useId()
  const dispatch = useDispatch()
  const { presupuesto, enviado } = useApp()
  const { archivo, tipo, color, modo, bolsa, cliente, arquitecto } = presupuesto
  const [opciones, setOpciones] = useState<OpcionesPresupuesto | null>(null)
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [preparando, setPreparando] = useState(false)

  useAccionEnCurso('Esperá a que termine de prepararse el documento.', preparando)

  useEffect(() => {
    let vivo = true
    conTope(getOpcionesPresupuesto())
      .then((o) => vivo && setOpciones(o))
      .catch(() => vivo && setErrorMonday('leer los tipos de carpintería y los colores'))
    return () => {
      vivo = false
    }
  }, [])

  /* Cambiar el PDF, el tipo o el color después de enviar no tiene sentido: lo que salió es lo que se
     registra. Por eso todo queda fijo una vez enviado. */
  const cambiar = (cambios: Partial<typeof presupuesto>) => dispatch({ type: 'setPresupuesto', cambios })

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
    ...(!archivo ? ['Falta cargar el PDF del presupuesto'] : []),
    ...(!tipo ? ['Falta indicar el tipo de carpintería'] : []),
    ...(!color ? ['Falta indicar el color'] : []),
  ]
  const para = modo === 'cargar' ? bolsa?.nombre : [cliente?.nombre, arquitecto?.nombre].filter(Boolean).join(' y ')

  return (
    <section className="view paso-layout obras-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('carga', null, null, 'presupuestos', modo)}
        descripcion={
          <>
            Cargá el PDF del presupuesto, indicá el tipo de carpintería y el color, y envialo.{' '}
            {para && (
              <>
                {modo === 'cargar' ? 'Presupuesto: ' : 'Para: '}
                <strong>{para}</strong>
              </>
            )}
          </>
        }
      />

      <div className="emision-grid emision-grid--mitades pres-etapa">
        {/* `carga-grid`: los campos y el recuadro en bordó, igual que la carga de la OP. Todo va en la
            card de los datos: primero tipo y color, abajo el recuadro, que ocupa el ancho y el alto
            que quedan para que la card mida lo mismo que el bloque de envío. */}
        <div className="carga-grid pres-carga">
          <div className="card carga-datos">
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
                      falta={!enviado && !tipo && !!archivo}
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
                      falta={!enviado && !color && !!archivo}
                      onElegir={(v) => cambiar({ color: v })}
                    />
                  </div>
                </div>
              </fieldset>
              <SoltarArchivo
                id="pres-pdf"
                archivo={archivo?.name ?? null}
                estado={preparando ? 'procesando' : error ? 'error' : archivo ? 'listo' : 'vacio'}
                titulo={preparando ? 'Procesando documento…' : error ? 'No se pudo cargar' : archivo ? 'Presupuesto cargado' : undefined}
                detalle={error || (archivo ? undefined : 'Soltá en este área el PDF del presupuesto, o hacé click para elegirlo')}
                deshabilitado={enviado || preparando}
                onArchivo={(f) => void elegir(f)}
                onQuitar={archivo && !enviado && !preparando ? () => cambiar({ archivo: null }) : undefined}
              />
            </section>
          </div>
        </div>

        {/* Con otra bolsa u otros contactos, el envío arranca de cero (`key`). */}
        <EnviarPresupuesto
          key={`${bolsa?.id ?? ''}-${cliente?.id ?? ''}-${arquitecto?.id ?? ''}`}
          listo={faltan.length === 0}
          avisoNoListo={faltan[0] ?? ''}
        />
      </div>

      <PieEtapa>
        <FinalizarOperacion
          detalle={para || undefined}
          textos={TEXTOS_FINALIZAR}
          registrar={
            enviado
              ? () =>
                  registrarPresupuesto({
                    borrador: presupuesto,
                    avanzar: (cambios) => dispatch({ type: 'setPresupuesto', cambios }),
                  })
              : undefined
          }
        />
      </PieEtapa>

      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </section>
  )
}
