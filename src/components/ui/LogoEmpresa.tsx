import { useState } from 'react'

/**
 * Marca de la empresa en la barra superior.
 *
 * Igual que en La Batea: el logo solo, contra el margen izquierdo. El archivo ya trae el nombre
 * escrito, así que repetirlo al lado en texto sería decir dos veces lo mismo.
 *
 * El nombre en texto queda como RESPALDO: si el archivo no está, en vez del ícono de imagen rota
 * se dibuja la marca y la barra se ve terminada igual.
 */
const LOGO_SRC = '/logo-polifroni.png'

export function LogoEmpresa() {
  const [sinArchivo, setSinArchivo] = useState(false)

  if (sinArchivo) {
    return (
      <div className="marca">
        <span className="marca-txt">
          <span className="marca-n">POLIFRONI</span>
          <span className="marca-s">Aberturas SRL</span>
        </span>
      </div>
    )
  }

  return (
    <div className="marca">
      <img
        className="marca-img"
        src={LOGO_SRC}
        alt="Polifroni Aberturas"
        decoding="async"
        draggable={false}
        onError={() => setSinArchivo(true)}
      />
    </div>
  )
}
