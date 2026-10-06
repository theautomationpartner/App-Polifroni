/**
 * Las páginas que ve quien abre el enlace de confirmación.
 *
 * Cada documento tiene SUS dos HTML, tal cual los entregó el usuario (`_plantillasConfirmacion.ts`),
 * y no se mezclan:
 *  - Orden de Producción: `OP_CONFIRMACION` y `OP_AGRADECIMIENTO`.
 *  - Presupuesto:         `PRESUPUESTO_CONFIRMACION` y `PRESUPUESTO_AGRADECIMIENTO`.
 *
 * El servidor sólo completa lo que antes completaba Make: sus variables (`{{…}}`) y la dirección a la
 * que se manda el formulario (antes, los webhooks; ahora, el mismo enlace firmado). El agradecimiento
 * es también lo que se ve al volver a abrir el enlace de algo que ya se respondió.
 *
 * `paginaAviso` es aparte y sólo para lo que no es una respuesta (enlace inválido, orden cancelada,
 * error): ninguna de las plantillas cubre esos casos.
 *
 * Todo lo que viene de afuera (lo que escribió el cliente, los datos de Monday) pasa por `esc`.
 */
import type { DocumentoConfirmacion } from './_confirmacion.js'
import {
  OP_AGRADECIMIENTO,
  OP_CONFIRMACION,
  PRESUPUESTO_AGRADECIMIENTO,
  PRESUPUESTO_CONFIRMACION,
} from './_plantillasConfirmacion.js'

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

/**
 * Dónde mandaban las plantillas el formulario (los webhooks de Make): en el código quedan con esta
 * marca, nunca con la URL —el repositorio es público— y el servidor la reemplaza por el enlace
 * firmado. Al pegar un HTML nuevo de Make, cambiar sus URLs de webhook por esta marca.
 */
const WEBHOOKS = ['{{ENLACE_FORMULARIO}}']

/**
 * Completa una plantilla: cada variable de Make por su valor (ya escapado), y la marca del webhook por
 * la dirección del enlace. Si después de completarla queda alguna variable sin reemplazar, es que la
 * plantilla cambió: se avisa en el log (el script de la página igual la oculta).
 */
function rellenar(plantilla: string, valores: Record<string, string>, accion = ''): string {
  let html = plantilla
  for (const [variable, valor] of Object.entries(valores)) html = html.split(variable).join(valor)
  for (const w of WEBHOOKS) html = html.split(w).join(accion)
  const suelta = html.match(/\{\{[^}]*\}\}/)
  if (suelta) console.warn('[confirmar] la plantilla tiene una variable sin completar:', suelta[0])
  return html
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Confirmación
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface DatosFormulario {
  documento: DocumentoConfirmacion
  /** A quién se saluda. Vacío: el saludo queda "Estimado/a," (lo resuelve el script de la página). */
  nombre: string
  /** A dónde se manda: el mismo enlace, con su firma. */
  accion: string
}

/** El formulario de confirmación del documento: el de la OP o el del presupuesto. */
export function paginaFormulario({ documento, nombre, accion }: DatosFormulario): string {
  const plantilla = documento === 'op' ? OP_CONFIRMACION : PRESUPUESTO_CONFIRMACION
  return rellenar(
    plantilla,
    {
      '{{formatDate(now; "DD/MM/YYYY")}}': fechaHoy(),
      '{{decodeURL(1.nombre)}}': esc(nombre),
      /* El ítem lo dice el enlace, no el formulario: el campo queda vacío y el servidor lo ignora. */
      '{{1.itemId}}': '',
    },
    esc(accion),
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Agradecimiento
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * El agradecimiento del documento, con lo que se respondió. La plantilla elige sola qué bloque mostrar
 * ("Confirmar" o "No confirmar") y saca el nombre o el motivo si vienen vacíos.
 */
export function paginaRespuesta(
  documento: DocumentoConfirmacion,
  nombre: string,
  respuesta: 'confirmada' | 'rechazada',
  motivo: string,
): string {
  const plantilla = documento === 'op' ? OP_AGRADECIMIENTO : PRESUPUESTO_AGRADECIMIENTO
  return rellenar(plantilla, {
    '{{1.estado_obra}}': respuesta === 'confirmada' ? 'Confirmar' : 'No confirmar',
    '{{1.nombre}}': esc(nombre),
    '{{1.motivo}}': esc(motivo),
    '{{formatDate(now; "DD/MM/YYYY")}}': fechaHoy(),
  })
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Avisos (fuera de las plantillas)
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
