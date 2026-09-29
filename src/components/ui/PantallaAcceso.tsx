import type { ReactNode } from 'react'

/**
 * El fondo y la tarjeta de TODAS las pantallas de autenticación: la espera, el segundo factor y el
 * rechazo. Son el mismo lugar con distinto contenido, así que se ven iguales —fondo rojo y negro del
 * logo, tarjeta blanca con la marca arriba— y pasar de una a otra no parpadea: antes, "Verificando
 * acceso" era un spinner sobre blanco y un instante después aparecía el muro rojo.
 */
export function MuroAcceso({ children }: { children?: ReactNode }) {
  return (
    <div className="mfa-muro">
      <div className="mfa-panel">
        <LogoAcceso />
        {children}
      </div>
    </div>
  )
}

/** La marca, arriba de la tarjeta: lo primero que se lee es DÓNDE se está entrando. */
export function LogoAcceso() {
  return (
    <img
      className="mfa-logo"
      src="/logo-polifroni.png"
      alt="Polifroni Aberturas"
      decoding="async"
      draggable={false}
    />
  )
}

/** La espera, dentro de la misma tarjeta: el logo, el spinner y qué se está haciendo. */
export function CargandoAcceso({ mensaje }: { mensaje: string }) {
  return (
    <MuroAcceso>
      <div className="mfa-cargando" role="status" aria-live="polite">
        <i className="fas fa-circle-notch spin" aria-hidden="true" />
        <span>{mensaje}</span>
      </div>
    </MuroAcceso>
  )
}
