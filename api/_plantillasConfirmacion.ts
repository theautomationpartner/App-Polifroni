/**
 * Los HTML que ve quien abre el enlace de confirmación, TAL CUAL los entregó el usuario (06/10/2026):
 * uno de confirmación y uno de agradecimiento para la Orden de Producción, y otros dos para el
 * presupuesto. No se mezclan ni se retocan.
 *
 * Siguen escritos como plantillas de Make: el servidor (`_confirmarPaginas.ts`) reemplaza sus
 * variables (`{{…}}`) y la marca `{{ENLACE_FORMULARIO}}` (donde iban los webhooks) por la dirección del enlace firmado. Para cambiar un
 * formulario, se pega acá el HTML nuevo entero y se revisa que sus variables sigan siendo las que
 * reemplaza `rellenar`.
 *
 * Van como texto en un módulo (y no como archivos .html) para que viajen dentro de la función de
 * Vercel sin configurar nada. `String.raw`: las barras de las expresiones regulares quedan como están.
 */

/** Orden de Producción · Confirmación. */
export const OP_CONFIRMACION = String.raw`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirmación de la Orden de Producción · Polifroni</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
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
        /* Cambiado a center para evitar empujar la caja hacia abajo y generar scroll */
        align-items: center;
        padding: 16px;
      }

      .caja {
        background: #fff;
        border: 1px solid var(--border-suave);
        border-radius: 16px;
        box-shadow: var(--sombra);
        /* Reducido para ahorrar espacio vertical */
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
        /* Achicado para evitar scroll vertical */
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
    </style>
  </head>
  <body>
    <div class="caja">
      <div class="cab">
        <!-- El logo lo publica la APP, no Drive.

             Un enlace de Drive sólo sirve si el archivo está compartido con "cualquiera con el
             enlace", y aun así Drive contesta con un redirect que el navegador del cliente no
             sigue: por eso llegaba la imagen rota. Medido contra los dos:

               drive.google.com/thumbnail?id=…  →  HTTP 302 · 0 bytes
               app-polifroni.vercel.app/…png    →  HTTP 200 · image/png · 61.679 bytes

             Ventaja de rebote: cambiar public/logo-polifroni.png en la app cambia también este
             formulario, sin tocarlo. -->
        <img
          src="https://app-polifroni.vercel.app/logo-polifroni.png"
          alt="Polifroni"
          width="132"
          height="46"
          style="height: 46px; width: auto; display: block; margin: 0 auto"
        />
        <div class="fecha">{{formatDate(now; "DD/MM/YYYY")}}</div>
      </div>

      <div class="saludo">
        <h1>Estimado/a<span id="saludoNombre"> {{decodeURL(1.nombre)}}</span>,</h1>
        <p>
          Le enviamos por este medio la <strong>Orden de Producción</strong> correspondiente a su obra.
        </p>
        <p>
          Le solicitamos revisarla con atención y confirmarnos a continuación si la información es correcta o si es necesario realizar alguna corrección.
        </p>
        <p>
          Una vez recibida su confirmación, procederemos a iniciar la fabricación.
        </p>
      </div>

      <form action="{{ENLACE_FORMULARIO}}" method="POST">
        <input type="hidden" name="itemId" value="{{1.itemId}}" />
        <input type="hidden" name="nombre" value="{{decodeURL(1.nombre)}}" />

        <span class="rotulo">¿La orden se encuentra correcta?</span>
        <div class="opciones">
          <label class="opcion">
            <input type="radio" name="estado_obra" value="Confirmar" required />
            <span>
              Confirmar
              <small>La orden es correcta, puede procederse con la fabricación</small>
            </span>
            <i>✅</i>
          </label>
          <label class="opcion opcion--no">
            <input type="radio" name="estado_obra" value="No confirmar" required />
            <span>
              No confirmar
              <small>Es necesario revisar algún dato antes de continuar</small>
            </span>
            <i>✖️</i>
          </label>
        </div>

        <div class="motivo" id="bloqueMotivo" hidden>
          <label for="motivo">Contanos qué hay que corregir</label>
          <textarea
            id="motivo"
            name="motivo"
            placeholder="Ej.: la medida de la ventana del living no coincide con lo acordado."
          ></textarea>
          <p class="ayuda">Con esto avisamos a la persona que sigue tu obra para que la revise.</p>
        </div>

        <button type="submit" class="enviar">Enviar respuesta</button>
      </form>

      <p class="pie">Tu respuesta queda registrada en la orden. No hace falta que respondas el mensaje.</p>
    </div>

    <script>
      const SIN_MAPEAR = '{' + '{'

      const saludoNombre = document.getElementById('saludoNombre')
      const nombre = saludoNombre.textContent.replace(/^,\s*/, '').trim()
      if (!nombre || nombre.includes(SIN_MAPEAR)) saludoNombre.remove()

      const bloque = document.getElementById('bloqueMotivo')
      const motivo = document.getElementById('motivo')

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
</html>
`

/** Orden de Producción · Agradecimiento. */
export const OP_AGRADECIMIENTO = String.raw`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>¡Gracias! · Polifroni</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
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
      }

      .pie {
        margin-top: 22px;
        font-size: 12px;
        line-height: 1.5;
        color: #94a3b8;
      }
      [hidden] {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <div class="caja">
      <!-- El logo lo publica la APP, no Drive.

           Un enlace de Drive sólo sirve si el archivo está compartido con "cualquiera con el
           enlace", y aun así contesta con un redirect que el navegador del cliente no sigue: por
           eso llegaba la imagen rota. Medido contra los dos:

             drive.google.com/thumbnail?id=…  →  HTTP 302 · 0 bytes
             app-polifroni.vercel.app/…png    →  HTTP 200 · image/png · 61.679 bytes

           Ventaja de rebote: cambiar public/logo-polifroni.png en la app cambia también este
           formulario, sin tocarlo. -->
      <img
        src="https://app-polifroni.vercel.app/logo-polifroni.png"
        alt="Polifroni"
        width="132"
        height="46"
        style="height: 46px; width: auto; display: block; margin: 0 auto 14px"
      />

      <!-- Lo que respondió el cliente. Queda oculto: sólo sirve para elegir qué mensaje mostrar. -->
      <span id="respuesta" hidden>{{1.estado_obra}}</span>

      <!-- ===== Confirmó ===== -->
      <div id="bloqueConfirmado">
        <div class="sello">✅</div>
        <h1>¡Confirmamos tu pedido<span id="nombreOk">, {{1.nombre}}</span>!</h1>
        <div class="fecha">{{formatDate(now; "DD/MM/YYYY")}}</div>
        <p class="detalle">
          Ya estamos <strong>trabajando en tu pedido</strong>. Cualquier novedad de la fabricación te
          la avisamos por WhatsApp.
        </p>
      </div>

      <!-- ===== Pidió revisión ===== -->
      <div id="bloqueRevisar" hidden>
        <div class="sello sello--revisar">📝</div>
        <h1>Recibimos tu observación<span id="nombreRev">, {{1.nombre}}</span></h1>
        <div class="fecha">{{formatDate(now; "DD/MM/YYYY")}}</div>
        <p class="detalle">
          <strong>No mandamos nada a fabricar</strong> hasta resolverlo. Ya avisamos al equipo que
          sigue tu obra para que lo revise y te contacte.
        </p>
        <div class="nota">
          <strong>Lo que nos contaste:</strong><br />
          {{1.motivo}}
        </div>
      </div>

      <p class="pie">Podés cerrar esta ventana. Tu respuesta ya quedó registrada.</p>
    </div>

    <script>
      /* Make lee este HTML como plantilla y trata cualquier llave doble como una variable SUYA.
         Por eso la marca de "variable sin mapear" se arma en dos pedazos: escrita entera, Make
         intentaría interpretarla y rechazaría el bloque completo con "Invalid IML". */
      const SIN_MAPEAR = '{' + '{'

      /* Una sola pantalla para las dos respuestas: el escenario no tiene que elegir entre dos
         plantillas, y las dos mantienen la misma cara. */
      const respuesta = (document.getElementById('respuesta').textContent || '').toLowerCase()
      const rechaza = respuesta.includes('no confirmar')

      document.getElementById('bloqueConfirmado').hidden = rechaza
      document.getElementById('bloqueRevisar').hidden = !rechaza

      /* Sin nombre mapeado, el saludo tiene que seguir cerrando: "¡Confirmamos tu pedido!" solo. */
      for (const id of ['nombreOk', 'nombreRev']) {
        const span = document.getElementById(id)
        const nombre = span.textContent.replace(/^,\s*/, '').trim()
        if (!nombre || nombre.includes(SIN_MAPEAR)) span.remove()
      }

      /* Si el motivo no vino, se saca la caja entera en vez de mostrarla vacía. */
      const nota = document.querySelector('#bloqueRevisar .nota')
      const motivo = nota.textContent.replace('Lo que nos contaste:', '').trim()
      if (!motivo || motivo.includes(SIN_MAPEAR)) nota.remove()
    </script>
  </body>
</html>
`

/** Presupuesto · Confirmación (dos pasos: la respuesta y, si confirma, los datos de la obra). */
export const PRESUPUESTO_CONFIRMACION = String.raw`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirmación de Presupuesto · Polifroni</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
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

      /* ===== Inputs y Textareas ===== */
      .motivo {
        margin-top: 16px;
      }
      .motivo label {
        display: block;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .input-text, .motivo textarea {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--tint-input-bd);
        border-radius: 10px;
        background: var(--tint-input);
        font-family: inherit;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-dark);
        outline: none;
      }
      .motivo textarea {
        min-height: 80px;
        resize: vertical;
      }
      .input-text:focus, .motivo textarea:focus {
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

      /* ===== Botones ===== */
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
      .enviar--exito {
        background: var(--green);
      }
      .enviar--exito:hover {
        background: #00b066;
      }

      .pie {
        margin-top: 14px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--text-gray);
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="caja">
      <div class="cab">
        <img
          src="https://app-polifroni.vercel.app/logo-polifroni.png"
          alt="Polifroni"
          width="132"
          height="46"
          style="height: 46px; width: auto; display: block; margin: 0 auto"
        />
        <div class="fecha">{{formatDate(now; "DD/MM/YYYY")}}</div>
      </div>

      <!-- El action por defecto sigue siendo el original -->
      <form id="formProduccion" action="{{ENLACE_FORMULARIO}}" method="POST">

        <!-- Variables de Make enviadas en ambos escenarios -->
        <input type="hidden" name="itemId" value="{{1.itemId}}" />
        <input type="hidden" name="nombre" value="{{decodeURL(1.nombre)}}" />

        <!-- ==============================
             PASO 1: CONFIRMACIÓN DE PRESUPUESTO
             ============================== -->
        <div id="paso1">
          <div class="saludo">
            <h1>Estimado/a<span id="saludoNombre"> {{decodeURL(1.nombre)}}</span>,</h1>
            <p>Le enviamos por este medio el <strong>Presupuesto</strong> correspondiente a su obra.</p>
            <p>Le solicitamos revisarlo con atención. Si lo indicado en el documento le parece correcto, le pedimos que nos brinde su confirmación a continuación para proceder con el cierre del mismo.</p>
            <p>Una vez recibida su aprobación, daremos por cerrado el presupuesto y avanzaremos con las siguientes etapas del proyecto.</p>
          </div>

          <span class="rotulo">¿El presupuesto es correcto?</span>
          <div class="opciones">
            <label class="opcion">
              <input type="radio" name="estado_obra" value="Confirmar" required />
              <span>
                Confirmar
                <small>Estoy de acuerdo con lo indicado, confirmar cierre del presupuesto.</small>
              </span>
              <i>✅</i>
            </label>
            <label class="opcion opcion--no">
              <input type="radio" name="estado_obra" value="No confirmar" required />
              <span>
                No confirmar
                <small>Es necesario revisar o ajustar algún dato antes de aprobar.</small>
              </span>
              <i>✖️</i>
            </label>
          </div>

          <div class="motivo" id="bloqueMotivo" hidden>
            <label for="motivo">Indíquenos qué debemos revisar</label>
            <textarea
              id="motivo"
              name="motivo"
              placeholder="Ej.: Hay una diferencia en las medidas o en los materiales detallados."
            ></textarea>
            <p class="ayuda">Esta información será enviada a su asesor para que revise el documento y se contacte con usted.</p>
          </div>

          <button type="submit" class="enviar" id="btnPaso1">Enviar respuesta</button>
        </div>

        <!-- ==============================
             PASO 2: DATOS ADICIONALES
             ============================== -->
        <div id="paso2" hidden>
          <div class="saludo">
            <h1>¡Gracias por su confirmación! ✅</h1>
            <p>El presupuesto ha sido aprobado. Para dar inicio formal a las siguientes etapas, por favor facilítenos los datos logísticos de la obra.</p>
          </div>

          <div class="motivo">
            <label for="ubicacion">Ubicación de la obra</label>
            <input
              type="text"
              id="ubicacion"
              name="ubicacion"
              class="input-text"
              placeholder="Ej.: Av. San Martín 1500, Piso 3"
            />
          </div>

          <div class="motivo">
            <label for="coordinador">Coordinador de la obra</label>
            <input
              type="text"
              id="coordinador"
              name="coordinador"
              class="input-text"
              placeholder="Ej.: Arquitecto Juan Pérez"
            />
          </div>

          <button type="submit" class="enviar enviar--exito" id="btnPaso2">Finalizar y enviar datos</button>
        </div>
      </form>

      <p class="pie">Su respuesta quedará registrada de forma automática en nuestro sistema.</p>
    </div>

    <script>
      const SIN_MAPEAR = '{' + '{'

      // Logica del nombre de saludo
      const saludoNombre = document.getElementById('saludoNombre')
      const nombre = saludoNombre.textContent.replace(/^,\s*/, '').trim()
      if (!nombre || nombre.includes(SIN_MAPEAR)) saludoNombre.remove()

      // Variables del DOM
      const form = document.getElementById('formProduccion');
      const paso1 = document.getElementById('paso1');
      const paso2 = document.getElementById('paso2');
      const btnPaso1 = document.getElementById('btnPaso1');
      const btnPaso2 = document.getElementById('btnPaso2');

      const bloqueMotivo = document.getElementById('bloqueMotivo');
      const motivo = document.getElementById('motivo');
      const ubicacion = document.getElementById('ubicacion');
      const coordinador = document.getElementById('coordinador');

      // Webhooks Make.com
      const webhookOriginal = '{{ENLACE_FORMULARIO}}';
      const webhookNuevo = '{{ENLACE_FORMULARIO}}';

      // Cambios al seleccionar opciones de radio
      for (const opcion of document.querySelectorAll('input[name="estado_obra"]')) {
        opcion.addEventListener('change', (e) => {
          const rechaza = e.target.value === 'No confirmar';

          bloqueMotivo.hidden = !rechaza;
          motivo.required = rechaza;

          if (rechaza) {
            motivo.focus();
            btnPaso1.textContent = 'Enviar respuesta';
          } else {
            motivo.value = '';
            btnPaso1.textContent = 'Continuar'; // Da a entender al usuario que hay un paso más
          }
        });
      }

      // Lógica de Envío del Formulario
      form.addEventListener('submit', (e) => {
        const estadoSeleccionado = document.querySelector('input[name="estado_obra"]:checked');

        // Si no hay nada seleccionado (aunque HTML5 lo frena antes por el required)
        if (!estadoSeleccionado) return;

        // Si elige Confirmar y todavía estamos viendo el Paso 1
        if (estadoSeleccionado.value === 'Confirmar' && paso2.hidden) {
          e.preventDefault(); // Evitamos que se envíe el form

          // Ocultamos paso 1 y mostramos paso 2
          paso1.hidden = true;
          paso2.hidden = false;

          // Hacemos que los nuevos campos sean obligatorios
          ubicacion.required = true;
          coordinador.required = true;

          // Cambiamos el destino del formulario al webhook nuevo
          form.action = webhookNuevo;

          return; // Salimos de la función para que el usuario llene los datos
        }

        // Si eligió "No confirmar", nos aseguramos que el action sea el original
        if (estadoSeleccionado.value === 'No confirmar') {
          form.action = webhookOriginal;
        }

        // Si llegamos hasta aquí, se enviará de forma tradicional.
        // Deshabilitamos el botón activo para evitar que den múltiples clics.
        const botonActivo = paso2.hidden ? btnPaso1 : btnPaso2;
        botonActivo.disabled = true;
        botonActivo.textContent = 'Procesando…';
      });
    </script>
  </body>
</html>
`

/** Presupuesto · Agradecimiento. */
export const PRESUPUESTO_AGRADECIMIENTO = String.raw`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>¡Gracias! · Polifroni</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
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
      }

      .pie {
        margin-top: 22px;
        font-size: 12px;
        line-height: 1.5;
        color: #94a3b8;
      }
      [hidden] {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <div class="caja">
      <!-- El logo lo publica la APP, no Drive. -->
      <img
        src="https://app-polifroni.vercel.app/logo-polifroni.png"
        alt="Polifroni"
        width="132"
        height="46"
        style="height: 46px; width: auto; display: block; margin: 0 auto 14px"
      />

      <!-- Lo que respondió el cliente. Queda oculto: sólo sirve para elegir qué mensaje mostrar. -->
      <span id="respuesta" hidden>{{1.estado_obra}}</span>

      <!-- ===== Confirmó ===== -->
      <div id="bloqueConfirmado">
        <div class="sello">✅</div>
        <h1>¡Confirmación recibida<span id="nombreOk">, {{1.nombre}}</span>!</h1>
        <div class="fecha">{{formatDate(now; "DD/MM/YYYY")}}</div>
        <p class="detalle">
          La confirmación del presupuesto fue recepcionada con éxito. Ya estamos trabajando para comenzar con el <strong>proceso de diseño de la orden de producción y de la medición de la obra</strong>.
        </p>
      </div>

      <!-- ===== Pidió revisión ===== -->
      <div id="bloqueRevisar" hidden>
        <div class="sello sello--revisar">📝</div>
        <h1>Recibimos tu observación<span id="nombreRev">, {{1.nombre}}</span></h1>
        <div class="fecha">{{formatDate(now; "DD/MM/YYYY")}}</div>
        <p class="detalle">
          <strong>No mandamos nada a fabricar</strong> hasta resolverlo. Ya avisamos al equipo que
          sigue tu obra para que lo revise y te contacte.
        </p>
        <div class="nota">
          <strong>Lo que nos contaste:</strong><br />
          {{1.motivo}}
        </div>
      </div>

      <p class="pie">Podés cerrar esta ventana. Tu respuesta ya quedó registrada.</p>
    </div>

    <script>
      /* Make lee este HTML como plantilla y trata cualquier llave doble como una variable SUYA.
         Por eso la marca de "variable sin mapear" se arma en dos pedazos: escrita entera, Make
         intentaría interpretarla y rechazaría el bloque completo con "Invalid IML". */
      const SIN_MAPEAR = '{' + '{'

      /* Una sola pantalla para las dos respuestas: el escenario no tiene que elegir entre dos
         plantillas, y las dos mantienen la misma cara. */
      const respuesta = (document.getElementById('respuesta').textContent || '').toLowerCase()
      const rechaza = respuesta.includes('no confirmar')

      document.getElementById('bloqueConfirmado').hidden = rechaza
      document.getElementById('bloqueRevisar').hidden = !rechaza

      /* Sin nombre mapeado, el saludo tiene que seguir cerrando: "¡Confirmamos tu pedido!" solo. */
      for (const id of ['nombreOk', 'nombreRev']) {
        const span = document.getElementById(id)
        const nombre = span.textContent.replace(/^,\s*/, '').trim()
        if (!nombre || nombre.includes(SIN_MAPEAR)) span.remove()
      }

      /* Si el motivo no vino, se saca la caja entera en vez de mostrarla vacía. */
      const nota = document.querySelector('#bloqueRevisar .nota')
      const motivo = nota.textContent.replace('Lo que nos contaste:', '').trim()
      if (!motivo || motivo.includes(SIN_MAPEAR)) nota.remove()
    </script>
  </body>
</html>
`
