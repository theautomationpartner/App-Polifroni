/**
 * Las páginas que ve quien abre el enlace de confirmación: el formulario, el "¡Gracias!" y los avisos
 * (enlace inválido, ya respondido, error). Son el diseño de los formularios que antes devolvía Make
 * (`formularios/confirmacion-op.html` y `respuesta-op.html`), servido por la app.
 *
 * Todo lo que viene de afuera (el nombre del enlace, lo que escribió el cliente, los datos de Monday)
 * pasa por `esc` antes de entrar al HTML.
 */
import type { DocumentoConfirmacion } from './_confirmacion.js'
import type { Documento, Respuesta } from './_confirmarMonday.js'
import { LIMITES } from './_confirmarMonday.js'

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const LOGO = '/logo-polifroni.png'

const fechaHoy = () =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(),
  )

const ESTILOS = `
  :root {
    --primary-blue: #0073ea; --primary-blue-hover: #0060c2; --green: #00c875; --green-dark: #00874d;
    --red: #e2445c; --text-dark: #323338; --text-gray: #676879; --border: #d0d4e4; --border-suave: #e2e8f0;
    --tint-input: #eef5ff; --tint-input-bd: #bcd6f5; --sombra: 0 2px 8px rgba(15, 23, 42, 0.06);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f7f6;
    color: var(--text-dark); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 16px;
  }
  .caja {
    background: #fff; border: 1px solid var(--border-suave); border-radius: 16px; box-shadow: var(--sombra);
    padding: 22px 24px; width: 100%; max-width: 440px;
  }
  .cab { text-align: center; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-suave); }
  .cab img { height: 46px; width: auto; display: block; margin: 0 auto; }
  .cab .fecha { margin-top: 8px; font-size: 12.5px; color: var(--text-gray); }
  .doc { margin-bottom: 14px; padding: 10px 14px; border-radius: 10px; background: #f8fafc; border: 1px solid var(--border-suave); }
  .doc b { display: block; font-size: 14px; }
  .doc span { display: block; margin-top: 2px; font-size: 12.5px; color: var(--text-gray); }
  .saludo { margin-bottom: 16px; }
  .saludo h1 { font-size: 19px; font-weight: 800; color: #0f172a; line-height: 1.3; }
  .saludo p { margin-top: 8px; font-size: 14.5px; line-height: 1.5; color: var(--text-gray); }
  .saludo strong { color: var(--text-dark); font-weight: 600; }
  .rotulo { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-gray); margin-bottom: 8px; }
  .opciones { display: flex; flex-direction: column; gap: 8px; }
  .opcion {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px;
    background: #fff; cursor: pointer; font-size: 15px; font-weight: 600; transition: border-color .15s, background .15s, box-shadow .15s;
  }
  .opcion:hover { background: #f8fafc; }
  .opcion input { width: 20px; height: 20px; flex: none; cursor: pointer; accent-color: var(--primary-blue); }
  .opcion:has(input:checked) { border-color: var(--green); background: #f1fbf5; box-shadow: 0 0 0 1px var(--green); }
  .opcion--no:has(input:checked) { border-color: var(--red); background: #fdf2f3; box-shadow: 0 0 0 1px var(--red); }
  .opcion--no input { accent-color: var(--red); }
  .opcion i { font-style: normal; margin-left: auto; font-size: 18px; }
  .opcion small { display: block; font-size: 12px; font-weight: 500; color: var(--text-gray); margin-top: 2px; }
  .campo { margin-top: 16px; }
  .campo label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
  .campo input, .campo textarea {
    width: 100%; padding: 10px 14px; border: 1px solid var(--tint-input-bd); border-radius: 10px; background: var(--tint-input);
    font-family: inherit; font-size: 14px; line-height: 1.5; color: var(--text-dark); outline: none;
  }
  .campo textarea { min-height: 80px; resize: vertical; }
  .campo input:focus, .campo textarea:focus { border-color: var(--primary-blue); background: #fff; }
  .ayuda { margin-top: 6px; font-size: 12px; color: var(--text-gray); line-height: 1.5; }
  .error { margin-bottom: 14px; padding: 10px 14px; border-radius: 10px; background: #fdf2f3; border: 1px solid #f5c2ca; color: #a3172d; font-size: 13.5px; }
  [hidden] { display: none !important; }
  .enviar {
    width: 100%; height: 44px; margin-top: 16px; border: none; border-radius: 8px; background: var(--primary-blue); color: #fff;
    font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s;
  }
  .enviar:hover { background: var(--primary-blue-hover); }
  .enviar:disabled { background: #e6e9ef; color: #a1a3b1; cursor: not-allowed; }
  .enviar--exito { background: var(--green); }
  .enviar--exito:hover { background: #00b066; }
  .volver { width: 100%; height: 40px; margin-top: 8px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font-family: inherit; font-size: 14px; cursor: pointer; color: var(--text-gray); }
  .pie { margin-top: 14px; font-size: 12px; line-height: 1.4; color: var(--text-gray); text-align: center; }
  .centro { text-align: center; }
  .sello {
    width: 74px; height: 74px; margin: 4px auto 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 34px; background: #eafaf1; color: var(--green-dark);
  }
  .sello--revisar { background: #fff6e8; color: #9a6a12; }
  .sello--error { background: #fdf2f3; color: #a3172d; }
  .centro h1 { font-size: 21px; font-weight: 800; color: #0f172a; line-height: 1.3; }
  .centro p { margin-top: 10px; font-size: 14.5px; line-height: 1.5; color: var(--text-gray); }
  .cita { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #f8fafc; border: 1px solid var(--border-suave); text-align: left; font-size: 14px; white-space: pre-wrap; color: var(--text-dark); }
`

function pagina(titulo: string, cuerpo: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${esc(titulo)} · Polifroni</title>
    ${extraHead}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <style>${ESTILOS}</style>
  </head>
  <body>
    <div class="caja">
      <div class="cab">
        <img src="${LOGO}" alt="Polifroni" width="132" height="46" />
        <div class="fecha">${fechaHoy()}</div>
      </div>
      ${cuerpo}
    </div>
  </body>
</html>`
}

const nombreDe = (doc: DocumentoConfirmacion) => (doc === 'op' ? 'la Orden de Producción' : 'el presupuesto')

const tarjetaDoc = (d: Documento) =>
  `<div class="doc"><b>${esc(d.titulo)}</b>${d.detalle ? `<span>${esc(d.detalle)}</span>` : ''}</div>`

/* ────────────────────────────────────────────────────────────────────────────────
 * El formulario
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface DatosFormulario {
  doc: Documento
  nombre: string
  /** A dónde se manda (la misma URL del enlace, con su firma). */
  accion: string
  /** Lo que ya había escrito, si la respuesta volvió con un error. */
  previo?: Record<string, string>
  error?: string
}

export function paginaFormulario({ doc, nombre, accion, previo = {}, error }: DatosFormulario): string {
  const op = doc.documento === 'op'
  const saludo = nombre ? `Estimado/a ${esc(nombre)},` : 'Hola,'
  const intro = op
    ? `<p>Le enviamos por este medio la <strong>Orden de Producción</strong> correspondiente a su obra.</p>
       <p>Le solicitamos revisarla con atención y confirmarnos a continuación si la información es correcta o si es necesario realizar alguna corrección.</p>
       <p>Una vez recibida su confirmación, procederemos a iniciar la fabricación.</p>`
    : `<p>Le enviamos por este medio el <strong>presupuesto</strong> solicitado.</p>
       <p>Revíselo y confírmenos a continuación si está de acuerdo o si hay algo que debamos revisar.</p>`
  const marcada = previo.respuesta === 'confirmar' ? 'confirmar' : previo.respuesta === 'rechazar' ? 'rechazar' : ''
  const enPaso2 = op && marcada === 'confirmar' && !!error

  const paso2 = op
    ? `<div id="paso2" ${enPaso2 ? '' : 'hidden'}>
        <div class="saludo">
          <h1>¡Gracias por elegirnos! ✅</h1>
          <p>Para avanzar con la fabricación de su obra, por favor indíquenos los siguientes datos.</p>
        </div>
        <div class="campo">
          <label for="ubicacion">Ubicación de la obra</label>
          <input type="text" id="ubicacion" name="ubicacion" maxlength="${LIMITES.ubicacion}" placeholder="Ej.: Av. San Martín 1500, Piso 3" value="${esc(previo.ubicacion ?? '')}" />
        </div>
        <div class="campo">
          <label for="coordinador">Coordinador de la obra</label>
          <input type="text" id="coordinador" name="coordinador" maxlength="${LIMITES.coordinador}" placeholder="Ej.: Arquitecto Juan Pérez" value="${esc(previo.coordinador ?? '')}" />
        </div>
        <button type="submit" class="enviar enviar--exito" id="btnPaso2">Finalizar</button>
        <button type="button" class="volver" id="btnVolver">Volver</button>
      </div>`
    : ''

  const cuerpo = `
    <form id="form" action="${esc(accion)}" method="POST" novalidate>
      ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
      <div id="paso1" ${enPaso2 ? 'hidden' : ''}>
        <div class="saludo"><h1>${saludo}</h1>${intro}</div>
        ${tarjetaDoc(doc)}
        <span class="rotulo">¿${op ? 'La orden se encuentra correcta' : 'Está de acuerdo con el presupuesto'}?</span>
        <div class="opciones">
          <label class="opcion">
            <input type="radio" name="respuesta" value="confirmar" ${marcada === 'confirmar' ? 'checked' : ''} />
            <span>Confirmar<small>${op ? 'La orden es correcta, puede procederse con la fabricación' : 'El presupuesto es correcto'}</small></span>
            <i>✅</i>
          </label>
          <label class="opcion opcion--no">
            <input type="radio" name="respuesta" value="rechazar" ${marcada === 'rechazar' ? 'checked' : ''} />
            <span>No confirmar<small>Es necesario revisar algún dato antes de continuar</small></span>
            <i>✖️</i>
          </label>
        </div>
        <div class="campo" id="bloqueMotivo" ${marcada === 'rechazar' ? '' : 'hidden'}>
          <label for="motivo">Contanos qué hay que corregir</label>
          <textarea id="motivo" name="motivo" maxlength="${LIMITES.motivo}" placeholder="${op ? 'Ej.: la medida de la ventana del living no coincide con lo acordado.' : 'Ej.: el color de las aberturas no es el que pedimos.'}">${esc(previo.motivo ?? '')}</textarea>
          <p class="ayuda">Con esto avisamos a la persona que sigue tu ${op ? 'obra' : 'presupuesto'} para que lo revise.</p>
        </div>
        <button type="submit" class="enviar" id="btnPaso1">${op && marcada === 'confirmar' ? 'Continuar' : 'Enviar respuesta'}</button>
      </div>
      ${paso2}
    </form>
    <p class="pie">Tu respuesta queda registrada. No hace falta que respondas el mensaje.</p>
    <script>
      (function () {
        var op = ${op ? 'true' : 'false'};
        var form = document.getElementById('form');
        var paso1 = document.getElementById('paso1');
        var paso2 = document.getElementById('paso2');
        var btn1 = document.getElementById('btnPaso1');
        var motivo = document.getElementById('motivo');
        var bloqueMotivo = document.getElementById('bloqueMotivo');
        var elegida = function () { var r = form.querySelector('input[name="respuesta"]:checked'); return r ? r.value : ''; };
        form.querySelectorAll('input[name="respuesta"]').forEach(function (r) {
          r.addEventListener('change', function () {
            var rechaza = elegida() === 'rechazar';
            bloqueMotivo.hidden = !rechaza;
            if (rechaza) motivo.focus();
            btn1.textContent = op && !rechaza ? 'Continuar' : 'Enviar respuesta';
          });
        });
        if (paso2) {
          document.getElementById('btnVolver').addEventListener('click', function () { paso2.hidden = true; paso1.hidden = false; });
        }
        var enviando = false;
        form.addEventListener('submit', function (e) {
          var r = elegida();
          if (enviando) { e.preventDefault(); return; }
          if (!r) { e.preventDefault(); alert('Elegí si confirmás o no.'); return; }
          if (r === 'rechazar' && !motivo.value.trim()) { e.preventDefault(); motivo.focus(); return; }
          if (op && r === 'confirmar' && paso2.hidden) { e.preventDefault(); paso1.hidden = true; paso2.hidden = false; document.getElementById('ubicacion').focus(); return; }
          if (op && r === 'confirmar') {
            var u = document.getElementById('ubicacion'), c = document.getElementById('coordinador');
            if (!u.value.trim()) { e.preventDefault(); u.focus(); return; }
            if (!c.value.trim()) { e.preventDefault(); c.focus(); return; }
          }
          enviando = true;
          var b = op && r === 'confirmar' ? document.getElementById('btnPaso2') : btn1;
          b.disabled = true;
          b.textContent = 'Enviando…';
        });
      })();
    </script>`
  return pagina(`Confirmación de ${op ? 'la Orden de Producción' : 'presupuesto'}`, cuerpo)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Después de responder
 * ──────────────────────────────────────────────────────────────────────────────── */

export function paginaGracias(doc: Documento, nombre: string, r: Respuesta): string {
  const n = nombre ? `, ${esc(nombre)}` : ''
  if (r.tipo === 'confirmar') {
    return pagina(
      '¡Gracias!',
      `<div class="centro">
        <div class="sello">✓</div>
        <h1>¡Confirmamos ${doc.documento === 'op' ? 'tu pedido' : 'tu presupuesto'}${n}!</h1>
        <p>${doc.documento === 'op' ? 'Registramos tu confirmación y los datos de la obra. Ya podemos avanzar con la fabricación.' : 'Registramos tu confirmación. Nos vamos a comunicar para avanzar.'}</p>
      </div>`,
    )
  }
  return pagina(
    'Recibimos tu observación',
    `<div class="centro">
      <div class="sello sello--revisar">!</div>
      <h1>Recibimos tu observación${n}</h1>
      <p>La persona que sigue ${doc.documento === 'op' ? 'tu obra' : 'tu presupuesto'} la va a revisar y se va a comunicar con vos.</p>
      <div class="cita">${esc(r.motivo)}</div>
    </div>`,
  )
}

/** Abrió el enlace de algo que ya se respondió, o que ya no admite respuesta. */
export function paginaYaRespondido(doc: Documento): string {
  const textos = {
    confirmada: { sello: '✓', clase: '', titulo: `${doc.documento === 'op' ? 'La orden' : 'El presupuesto'} ya está confirmad${doc.documento === 'op' ? 'a' : 'o'}`, texto: 'Ya registramos la confirmación. No hace falta hacer nada más.' },
    rechazada: { sello: '!', clase: 'sello--revisar', titulo: 'Ya recibimos tu respuesta', texto: `Registramos que ${nombreDe(doc.documento)} necesita una revisión. Nos vamos a comunicar con vos.` },
    cerrada: { sello: 'i', clase: 'sello--revisar', titulo: `${doc.documento === 'op' ? 'Esta orden' : 'Este presupuesto'} ya no espera respuesta`, texto: 'Si tenés alguna duda, respondé al mensaje de WhatsApp y te ayudamos.' },
    pendiente: { sello: 'i', clase: '', titulo: '', texto: '' },
  }[doc.situacion]
  return pagina(
    textos.titulo,
    `<div class="centro"><div class="sello ${textos.clase}">${textos.sello}</div><h1>${esc(textos.titulo)}</h1><p>${esc(textos.texto)}</p></div>${tarjetaDoc(doc).replace('class="doc"', 'class="doc" style="margin-top:16px"')}`,
  )
}

/** Un aviso suelto: enlace inválido, no encontrado, error al guardar. */
export function paginaAviso(titulo: string, texto: string, tipo: 'error' | 'revisar' = 'error'): string {
  return pagina(
    titulo,
    `<div class="centro"><div class="sello sello--${tipo}">${tipo === 'error' ? '✕' : '!'}</div><h1>${esc(titulo)}</h1><p>${esc(texto)}</p></div>`,
  )
}

/**
 * Lo que leen los bots que arman la vista previa del enlace (WhatsApp, Telegram, …): título, texto y
 * logo de Polifroni, sin tocar Monday.
 */
export function paginaVistaPrevia(documento: DocumentoConfirmacion | null, origen: string): string {
  const titulo = documento === 'presupuesto' ? 'Confirmación del presupuesto' : 'Confirmación de la Orden de Producción'
  const descripcion = `Revisá ${documento === 'presupuesto' ? 'el presupuesto' : 'la orden'} y confirmala desde acá.`
  const og = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Polifroni Aberturas" />
    <meta property="og:title" content="${esc(titulo)}" />
    <meta property="og:description" content="${esc(descripcion)}" />
    ${origen ? `<meta property="og:image" content="${esc(origen + LOGO)}" />` : ''}`
  return pagina(titulo, `<div class="centro"><h1>${esc(titulo)}</h1><p>${esc(descripcion)}</p></div>`, og)
}
