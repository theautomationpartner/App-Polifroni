import { useState } from 'react'

/**
 * Marca de la empresa: el logo y, al lado, el nombre.
 *
 * El archivo se sirve desde `public/`, así que para cambiarlo alcanza con reemplazarlo: no hay que
 * tocar código ni recompilar. Mientras no esté, en vez del ícono de imagen rota se dibuja sólo el
 * nombre: la barra se ve terminada igual desde el primer arranque.
 */
const LOGO_SRC = '/logo-polifroni.png'

export function LogoEmpresa() {
  const [sinArchivo, setSinArchivo] = useState(false)

  return (
    <div className="marca">
      {!sinArchivo && (
        <img
          className="marca-img"
          src={LOGO_SRC}
          alt=""
          decoding="async"
          draggable={false}
          onError={() => setSinArchivo(true)}
        />
      )}
      <span className="marca-txt">
        <span className="marca-n">POLIFRONI</span>
        <span className="marca-s">Aberturas SRL</span>
      </span>
    </div>
  )
}
