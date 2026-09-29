import type { ReactNode } from 'react'

/**
 * El fondo y la tarjeta de TODAS las pantallas de autenticación: la espera, el segundo factor y el
 * rechazo. Son el mismo lugar con distinto contenido, así que se ven iguales —fondo rojo y negro,
 * tarjeta blanca con el escudo arriba— y pasar de una a otra no parpadea: antes, "Verificando
 * acceso" era un spinner sobre blanco y un instante después aparecía el muro rojo.
 */
export function MuroAcceso({ children }: { children?: ReactNode }) {
  return (
    <div className="mfa-muro">
      <div className="mfa-panel">
        <EscudoAcceso />
        {children}
      </div>
    </div>
  )
}

/** El escudo, arriba de la tarjeta: dice de entrada que esto es la verificación de acceso. */
export function EscudoAcceso() {
  return <i className="fas fa-shield-halved mfa-icono" aria-hidden="true" />
}

/** La espera, dentro de la misma tarjeta: el escudo, el spinner y qué se está haciendo. */
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
