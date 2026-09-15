import { useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { HistorialActividad } from '@/features/actividad/HistorialActividad'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { ESCENARIO, EscenarioNoConfigurado, dispararEscenario } from '@/services/make'
import { COL, ETIQUETA, esperarEnTablero, registrarActividad } from '@/services/monday'
import { useDispatch } from '@/state/hooks'

type Resultado = { tono: 'ok' | 'warn' | 'err'; texto: string } | null

/**
 * Paso 3 · Generación de la Orden de Producción final.
 *
 * La app no arma el documento: eso ya lo hace un escenario de Make que lee el PDF de ETMO con IA,
 * lo estructura y lo vuelca en la plantilla. Acá se toca el timbre y después se MIRA EL TABLERO,
 * que es donde el escenario deja el resultado (estado + archivo). Por eso el botón queda ocupado
 * hasta que el archivo aparece: mientras tanto, apretarlo de nuevo sólo dispararía el escenario
 * dos veces.
 */
export function OpFinalView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()

  const [generando, setGenerando] = useState(false)
  const [fase, setFase] = useState('')
  const [resultado, setResultado] = useState<Resultado>(null)
  /** Fuerza a releer el historial cuando la corrida termina (ahí está el detalle de un error). */
  const [refrescoHistorial, setRefrescoHistorial] = useState(0)

  const tieneEtmo = obra.ordenEtmo.length > 0
  const opPdf = obra.opFinal.find((a) => !a.esImagen) ?? null
  const generado = obra.estadoOpFinal.texto === ETIQUETA.opGenerado && obra.opFinal.length > 0

  const generar = async () => {
    /* Lo que YA estaba adjunto. La corrida se considera terminada cuando aparece un archivo que no
       estaba antes: si la obra ya tenía una OP vieja, esperar "que haya archivo" daría por buena
       la anterior en el primer latido. */
    const previos = new Set(obra.opFinal.map((a) => a.assetId))

    setGenerando(true)
    setResultado(null)
    setFase('Avisándole a la automatización…')

    try {
      await dispararEscenario(ESCENARIO.leerDocumento, obra.id, {
        obra: obra.nombre,
        observaciones: obra.observaciones,
        accion: 'leer-documento-etmo',
      })
      await registrarActividad(
        obra.id,
        '🤖 <b>Lectura del documento ETMO solicitada</b> desde la app de Obras. Se pidió generar la Orden de Producción final.',
      ).catch(() => {})

      setFase('Leyendo el documento y armando la Orden de Producción…')

      const { obra: fresca, cumplio } = await esperarEnTablero(
        obra.id,
        (o) =>
          o.estadoOpFinal.texto === ETIQUETA.opError ||
          o.opFinal.some((a) => !previos.has(a.assetId)),
        { onLatido: (o) => dispatch({ type: 'refrescarObra', obra: o }) },
      )

      setRefrescoHistorial((n) => n + 1)

      if (!cumplio) {
        setResultado({
          tono: 'warn',
          texto:
            'La automatización sigue trabajando: pasaron 3 minutos y todavía no hay documento. Refrescá en un rato; si el tablero queda en "Error - Ver Update", el motivo está en el historial.',
        })
        return
      }
      if (fresca?.estadoOpFinal.texto === ETIQUETA.opError) {
        setResultado({
          tono: 'err',
          texto:
            'La automatización no pudo generar la orden. El motivo está en el historial de actividades, acá abajo.',
        })
        return
      }
      setResultado({ tono: 'ok', texto: 'Orden de Producción final generada y adjunta a la obra.' })
    } catch (e) {
      if (e instanceof EscenarioNoConfigurado) {
        setResultado({
          tono: 'err',
          texto:
            'Falta la URL del escenario en .env.local (MAKE_WEBHOOK_LEER_DOC). Cargala y reiniciá npm run dev.',
        })
        return
      }
      setResultado({
        tono: 'err',
        texto: e instanceof Error ? e.message : 'No se pudo disparar la automatización.',
      })
    } finally {
      setGenerando(false)
      setFase('')
      void refrescar()
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={3}
        titulo="Generar la Orden de Producción final"
        descripcion={
          <>
            La automatización lee el PDF de ETMO, estructura los datos y arma la OP final con las
            observaciones cargadas. El documento queda adjunto a la obra.
          </>
        }
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-robot" /> Leer documento y generar
          </div>
          <p className="panel-d">
            Se dispara el escenario de Make con el id de esta obra. Cuando termina, el archivo
            aparece en la columna <strong>🤖OP Final</strong> y el estado pasa a{' '}
            <strong>Generado</strong>.
          </p>

          <div className="obs-pie" style={{ marginTop: 0, marginBottom: 16 }}>
            <EstadoBadge label="Estado OP final" estado={obra.estadoOpFinal} />
            <span className="obs-estado">
              <i className="fas fa-file-pdf" />
              {obra.ordenEtmo.length} ETMO · {obra.opFinal.length} OP final
            </span>
          </div>

          {!tieneEtmo && (
            <Aviso tono="warn">
              El botón se habilita cuando la obra tiene la Orden ETMO adjunta. Volvé al paso
              anterior y cargala.
            </Aviso>
          )}

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!tieneEtmo || generando}
              onClick={() => void generar()}
            >
              {generando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Generando…
                </>
              ) : (
                <>
                  <i className="fas fa-file-import" /> Leer documento
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={generando}
              onClick={() => void refrescar()}
            >
              <i className="fas fa-rotate" /> Refrescar desde el tablero
            </button>
          </div>

          {generando && fase && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="info">{fase}</Aviso>
            </div>
          )}
          {resultado && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono={resultado.tono}>{resultado.texto}</Aviso>
            </div>
          )}

          <div className="panel-sep" />
          <span className="campo-l">
            Observaciones que se vuelcan en la orden
            <span className="campo-col">{COL.observaciones}</span>
          </span>
          <div className={`dato-v ${obra.observaciones ? '' : 'dato-v--vacio'}`} style={{ whiteSpace: 'pre-wrap' }}>
            {obra.observaciones || 'Sin observaciones cargadas.'}
          </div>
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-circle-check" /> Orden de Producción final
          </div>
          <p className="panel-d">
            El documento que se le va a mandar al cliente. Si no es el correcto, corregí las
            observaciones y volvé a generarlo.
          </p>
          <VisorPdf
            archivo={opPdf}
            vacio="Todavía no hay una OP final generada para esta obra."
            trabajando={generando ? 'Generando la Orden de Producción final…' : null}
          />
        </div>
      </div>

      <div className="card">
        <div className="panel-t">
          <i className="fas fa-clock-rotate-left" /> Historial de la obra
        </div>
        <p className="panel-d">
          Cada intento queda registrado acá. Cuando la automatización no puede generar la orden,
          escribe en este historial qué dato falta.
        </p>
        <HistorialActividad itemId={obra.id} recargar={refrescoHistorial} limite={8} />
      </div>

      <PasoNav
        siguiente="Enviar al cliente"
        bloqueado={!generado}
        nota={
          generado
            ? undefined
            : 'La OP final tiene que estar generada y adjunta para poder mandarla al cliente.'
        }
      />
    </section>
  )
}
