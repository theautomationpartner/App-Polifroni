import { useState } from 'react'

/**
 * Logo de la empresa en la barra superior. El archivo se sirve desde `public/`, así que para
 * cambiarlo alcanza con reemplazarlo: no hay que tocar código ni recompilar.
 *
 * Mientras el archivo no esté, en vez del ícono de imagen rota se dibuja el nombre: la barra se ve
 * terminada igual desde el primer arranque.
 */
const LOGO_SRC = '/logo-polifroni.png'

export function LogoEmpresa() {
  const [sinArchivo, setSinArchivo] = useState(false)

  if (sinArchivo) {
    return (
      <span className="topsel-logo-txt" aria-label="Polifroni">
        POLIFRONI
      </span>
    )
  }

  return (
    <img
      className="topsel-logo"
      src={LOGO_SRC}
      alt="Polifroni"
      decoding="async"
      draggable={false}
      onError={() => setSinArchivo(true)}
    />
  )
}
