/**
 * Las páginas que ve quien abre el enlace de confirmación. Son LOS MISMOS HTML que devolvía Make
 * (`formularios/confirmacion-op.html` y `formularios/respuesta-op.html`): mismo markup, mismos estilos y
 * mismos campos (`estado_obra` = "Confirmar" | "No confirmar", `motivo`). Lo único que cambia es quién
 * completa los datos: donde Make ponía `{{…}}`, acá los pone el servidor, y el formulario se manda al
 * mismo enlace (con su firma) en vez de a un webhook.
 *
 *  - `paginaFormulario`: el formulario de confirmación.
 *  - `paginaRespuesta`: la pantalla de después ("¡Confirmamos tu pedido!" / "Recibimos tu
 *    observación"). Es también la que se ve si se vuelve a abrir el enlace de algo ya respondido.
 *  - `paginaAviso`: la misma pantalla, para lo que no es una respuesta (enlace inválido, orden
 *    cancelada, error).
 *
 * Todo lo que viene de afuera (lo que escribió el cliente, los datos de Monday) pasa por `esc`.
 */
import type { DocumentoConfirmacion } from './_confirmacion.js'
import { LIMITES, type Documento } from './_confirmarMonday.js'

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const LOGO = 'https://app-polifroni.vercel.app/logo-polifroni.png'

const fechaHoy = () =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(),
  )

const FUENTES = `<link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />`

/* ────────────────────────────────────────────────────────────────────────────────
 * El formulario (formularios/confirmacion-op.html)
 * ──────────────────────────────────────────────────────────────────────────────── */

const ESTILOS_FORMULARIO = `
      :root {
        --primary-blue: #0073ea;
        --primary-blue-hover: #0060c2;
        --green: #00c875;
        --red: #e2445c;
        --text-dark: #323338;
        --text-gray: #676879;
        --border: #d0d4e4;
        --border-suave: #e2e8f0;
        --tint-input: #eef5ff;
        --tint-input-bd: #bcd6f5;
        --sombra: 0 2px 8px rgba(15, 23, 42, 0.06);
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #f4f7f6;
        color: var(--text-dark);
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 16px;
      }

      .caja {
        background: #fff;
        border: 1px solid var(--border-suave);
        border-radius: 16px;
        box-shadow: var(--sombra);
        padding: 22px 24px;
        width: 100%;
        max-width: 440px;
      }

      /* ===== Encabezado ===== */
      .cab {
        text-align: center;
        padding-bottom: 12px;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--border-suave);
      }
      .cab .fecha {
        margin-top: 8px;
        font-size: 12.5px;
        color: var(--text-gray);
      }

      /* ===== Saludo ===== */
      .saludo {
        margin-bottom: 16px;
      }
      .saludo h1 {
        font-size: 19px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1.3;
      }
      .saludo p {
        margin-top: 8px;
        font-size: 14.5px;
        line-height: 1.5;
        color: var(--text-gray);
      }
      .saludo strong {
        color: var(--text-dark);
        font-weight: 600;
      }

      /* ===== Opciones ===== */
      .rotulo {
        display: block;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--text-gray);
        margin-bottom: 8px;
      }
      .opciones {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .opcion {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #fff;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        transition:
          border-color 0.15s,
          background 0.15s,
          box-shadow 0.15s;
      }
      .opcion:hover {
        background: #f8fafc;
      }
      .opcion input {
        width: 20px;
        height: 20px;
        flex: none;
        cursor: pointer;
        accent-color: var(--primary-blue);
      }
      .opcion:has(input:checked) {
        border-color: var(--green);
        background: #f1fbf5;
        box-shadow: 0 0 0 1px var(--green);
      }
      .opcion--no:has(input:checked) {
        border-color: var(--red);
        background: #fdf2f3;
        box-shadow: 0 0 0 1px var(--red);
      }
      .opcion--no input {
        accent-color: var(--red);
      }
      .opcion i {
        font-style: normal;
        margin-left: auto;
        font-size: 18px;
      }
      .opcion small {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-gray);
        margin-top: 2px;
      }

      /* ===== Motivo del rechazo ===== */
      .motivo {
        margin-top: 16px;
      }
      .motivo label {
        display: block;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .motivo textarea {
        width: 100%;
        min-height: 80px;
        padding: 10px 14px;
        border: 1px solid var(--tint-input-bd);
        border-radius: 10px;
        background: var(--tint-input);
        font-family: inherit;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-dark);
        resize: vertical;
        outline: none;
      }
      .motivo textarea:focus {
        border-color: var(--primary-blue);
        background: #fff;
      }
      .motivo .ayuda {
        margin-top: 6px;
        font-size: 12px;
        color: var(--text-gray);
        line-height: 1.5;
      }
      [hidden] {
        display: none !important;
      }

      /* ===== Botón ===== */
      .enviar {
        width: 100%;
        height: 44px;
        margin-top: 16px;
        border: none;
        border-radius: 8px;
        background: var(--primary-blue);
        color: #fff;
        font-family: inherit;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }
      .enviar:hover {
        background: var(--primary-blue-hover);
      }
      .enviar:disabled {
        background: #e6e9ef;
        color: #a1a3b1;
        cursor: not-allowed;
      }

      .pie {
        margin-top: 14px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--text-gray);
        text-align: center;
      }

      /* Sólo si el servidor devolvió el formulario con un error (sin JavaScript no se valida antes). */
      .error {
        margin-bottom: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        background: #fdf2f3;
        border: 1px solid #f5c2ca;
        color: #a3172d;
        font-size: 13.5px;
      }
`

export interface DatosFormulario {
  doc: Documento
  /** A dónde se manda: el mismo enlace, con su firma. */
  accion: string
  /** Lo que ya había elegido o escrito, si la respuesta volvió con un error. */
  previo?: Record<string, string>
  error?: string
}

export function paginaFormulario({ doc, accion, previo = {}, error }: DatosFormulario): string {
  const op = doc.documento === 'op'
  const rechazaba = (previo.estado_obra ?? '').toLowerCase() === 'no confirmar'
  const confirmaba = (previo.estado_obra ?? '').toLowerCase() === 'confirmar'
  const intro = op
    ? `<p>
          Le enviamos por este medio la <strong>Orden de Producción</strong> correspondiente a su obra.
        </p>
        <p>
          Le solicitamos revisarla con atención y confirmarnos a continuación si la información es correcta o si es necesario realizar alguna corrección.
        </p>
        <p>
          Una vez recibida su confirmación, procederemos a iniciar la fabricación.
        </p>`
    : `<p>
          Le enviamos por este medio el <strong>presupuesto</strong> solicitado.
        </p>
        <p>
          Le solicitamos revisarlo con atención y confirmarnos a continuación si está de acuerdo o si es necesario realizar alguna corrección.
        </p>`

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Confirmación ${op ? 'de la Orden de Producción' : 'del presupuesto'} · Polifroni</title>
    ${FUENTES}
    <style>${ESTILOS_FORMULARIO}</style>
  </head>
  <body>
    <div class="caja">
      <div class="cab">
        <img
          src="${LOGO}"
          alt="Polifroni"
          width="132"
          height="46"
          style="height: 46px; width: auto; display: block; margin: 0 auto"
        />
        <div class="fecha">${fechaHoy()}</div>
      </div>

      <div class="saludo">
        <h1>Estimado/a${doc.nombre ? `<span> ${esc(doc.nombre)}</span>` : ''},</h1>
        ${intro}
      </div>

      <form action="${esc(accion)}" method="POST">
        ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
        <span class="rotulo">¿${op ? 'La orden se encuentra correcta' : 'El presupuesto se encuentra correcto'}?</span>
        <div class="opciones">
          <label class="opcion">
            <input type="radio" name="estado_obra" value="Confirmar" required${confirmaba ? ' checked' : ''} />
            <span>
              Confirmar
              <small>${op ? 'La orden es correcta, puede procederse con la fabricación' : 'El presupuesto es correcto'}</small>
            </span>
            <i>✅</i>
          </label>
          <label class="opcion opcion--no">
            <input type="radio" name="estado_obra" value="No confirmar" required${rechazaba ? ' checked' : ''} />
            <span>
              No confirmar
              <small>Es necesario revisar algún dato antes de continuar</small>
            </span>
            <i>✖️</i>
          </label>
        </div>

        <div class="motivo" id="bloqueMotivo"${rechazaba ? '' : ' hidden'}>
          <label for="motivo">Contanos qué hay que corregir</label>
          <textarea
            id="motivo"
            name="motivo"
            maxlength="${LIMITES.motivo}"
            placeholder="${op ? 'Ej.: la medida de la ventana del living no coincide con lo acordado.' : 'Ej.: el color de las aberturas no es el que pedimos.'}"
          >${esc(previo.motivo ?? '')}</textarea>
          <p class="ayuda">Con esto avisamos a la persona que sigue tu ${op ? 'obra' : 'presupuesto'} para que lo revise.</p>
        </div>

        <button type="submit" class="enviar">Enviar respuesta</button>
      </form>

      <p class="pie">Tu respuesta queda registrada en ${op ? 'la orden' : 'el presupuesto'}. No hace falta que respondas el mensaje.</p>
    </div>

    <script>
      const bloque = document.getElementById('bloqueMotivo')
      const motivo = document.getElementById('motivo')
      motivo.required = !bloque.hidden

      for (const opcion of document.querySelectorAll('input[name="estado_obra"]')) {
        opcion.addEventListener('change', (e) => {
          const rechaza = e.target.value === 'No confirmar'
          bloque.hidden = !rechaza
          motivo.required = rechaza
          if (rechaza) motivo.focus()
          else motivo.value = ''
        })
      }

      document.querySelector('form').addEventListener('submit', (e) => {
        const boton = e.target.querySelector('.enviar')
        boton.disabled = true
        boton.textContent = 'Enviando…'
      })
    </script>
  </body>
</html>`
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Después de responder (formularios/respuesta-op.html)
 * ──────────────────────────────────────────────────────────────────────────────── */

const ESTILOS_RESPUESTA = `
      /* Mismos tokens que el formulario y que la app: es la misma marca, dos pantallas seguidas. */
      :root {
        --primary-blue: #0073ea;
        --green: #00c875;
        --green-dark: #00874d;
        --orange: #fdab3d;
        --text-dark: #323338;
        --text-gray: #676879;
        --border-suave: #e2e8f0;
        --sombra: 0 2px 8px rgba(15, 23, 42, 0.06);
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #f4f7f6;
        color: var(--text-dark);
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 24px 16px 40px;
      }

      .caja {
        background: #fff;
        border: 1px solid var(--border-suave);
        border-radius: 16px;
        box-shadow: var(--sombra);
        padding: 32px 24px;
        width: 100%;
        max-width: 440px;
        text-align: center;
      }

      /* El sello: redondo, grande y del color de lo que pasó. Es lo primero que se ve. */
      .sello {
        width: 74px;
        height: 74px;
        margin: 0 auto 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 34px;
        background: #eafaf1;
        color: var(--green-dark);
      }
      .sello--revisar {
        background: #fff6e8;
        color: #9a6a12;
      }

      h1 {
        font-size: 21px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1.3;
      }
      .fecha {
        margin-top: 10px;
        display: inline-block;
        padding: 5px 14px;
        border-radius: 999px;
        background: #f1f5f9;
        font-size: 12.5px;
        font-weight: 600;
        color: #475569;
      }
      .detalle {
        margin-top: 18px;
        font-size: 15px;
        line-height: 1.6;
        color: var(--text-gray);
      }
      .detalle strong {
        color: var(--text-dark);
        font-weight: 600;
      }

      .nota {
        margin-top: 24px;
        padding: 14px 16px;
        border-radius: 12px;
        background: #f8fafc;
        border: 1px solid var(--border-suave);
        font-size: 13px;
        line-height: 1.55;
        color: var(--text-gray);
        text-align: left;
        white-space: pre-wrap;
      }

      .pie {
        margin-top: 22px;
        font-size: 12px;
        line-height: 1.5;
        color: #94a3b8;
      }
`

interface Pantalla {
  titulo: string
  sello: string
  revisar: boolean
  h1: string
  /** HTML ya armado (los datos de afuera, escapados). */
  detalle: string
  /** Texto del cliente, va escapado. */
  nota?: string
  pie: string
}

function pantalla(p: Pantalla): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${esc(p.titulo)} · Polifroni</title>
    ${FUENTES}
    <style>${ESTILOS_RESPUESTA}</style>
  </head>
  <body>
    <div class="caja">
      <img
        src="${LOGO}"
        alt="Polifroni"
        width="132"
        height="46"
        style="height: 46px; width: auto; display: block; margin: 0 auto 14px"
      />

      <div class="sello${p.revisar ? ' sello--revisar' : ''}">${p.sello}</div>
      <h1>${p.h1}</h1>
      <div class="fecha">${fechaHoy()}</div>
      <p class="detalle">${p.detalle}</p>
      ${p.nota ? `<div class="nota"><strong>Lo que nos contaste:</strong><br />${esc(p.nota)}</div>` : ''}

      <p class="pie">${p.pie}</p>
    </div>
  </body>
</html>`
}

const conNombre = (nombre: string) => (nombre ? `, ${esc(nombre)}` : '')

/**
 * La pantalla de después de responder. `yaRespondida`: se volvió a abrir el enlace de algo que ya
 * tenía respuesta (es la misma pantalla, con el pie que lo aclara).
 */
export function paginaRespuesta(
  doc: Documento,
  respuesta: 'confirmada' | 'rechazada',
  motivo: string,
  yaRespondida = false,
): string {
  const op = doc.documento === 'op'
  const pie = yaRespondida
    ? `${op ? 'Esta orden' : 'Este presupuesto'} ya tenía tu respuesta registrada. Podés cerrar esta ventana.`
    : 'Podés cerrar esta ventana. Tu respuesta ya quedó registrada.'
  if (respuesta === 'confirmada') {
    return pantalla({
      titulo: '¡Gracias!',
      sello: '✅',
      revisar: false,
      h1: `¡Confirmamos tu ${op ? 'pedido' : 'presupuesto'}${conNombre(doc.nombre)}!`,
      detalle: op
        ? 'Ya estamos <strong>trabajando en tu pedido</strong>. Cualquier novedad de la fabricación te la avisamos por WhatsApp.'
        : 'Recibimos tu <strong>confirmación del presupuesto</strong>. Nos vamos a comunicar por WhatsApp para avanzar.',
      pie,
    })
  }
  return pantalla({
    titulo: 'Recibimos tu observación',
    sello: '📝',
    revisar: true,
    h1: `Recibimos tu observación${conNombre(doc.nombre)}`,
    detalle: op
      ? '<strong>No mandamos nada a fabricar</strong> hasta resolverlo. Ya avisamos al equipo que sigue tu obra para que lo revise y te contacte.'
      : 'Ya avisamos al equipo que sigue tu presupuesto para que lo revise y te contacte.',
    nota: motivo,
    pie,
  })
}

/** Lo que no es una respuesta: enlace inválido, orden cancelada, error. Misma pantalla, sello de aviso. */
export function paginaAviso(titulo: string, detalle: string, sello = '⚠️'): string {
  return pantalla({
    titulo,
    sello,
    revisar: true,
    h1: esc(titulo),
    detalle: esc(detalle),
    pie: 'Si tenés alguna duda, respondé al mensaje de WhatsApp y te ayudamos.',
  })
}

/**
 * Lo que leen los bots que arman la vista previa del enlace (WhatsApp, Telegram, …): título, texto y
 * logo de Polifroni, sin tocar Monday.
 */
export function paginaVistaPrevia(documento: DocumentoConfirmacion | null): string {
  const titulo = documento === 'presupuesto' ? 'Confirmación del presupuesto' : 'Confirmación de la Orden de Producción'
  const descripcion = `Revisá ${documento === 'presupuesto' ? 'el presupuesto' : 'la orden'} y confirmala desde acá.`
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${esc(titulo)} · Polifroni</title>
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Polifroni Aberturas" />
    <meta property="og:title" content="${esc(titulo)}" />
    <meta property="og:description" content="${esc(descripcion)}" />
    <meta property="og:image" content="${LOGO}" />
  </head>
  <body><h1>${esc(titulo)}</h1><p>${esc(descripcion)}</p></body>
</html>`
}
