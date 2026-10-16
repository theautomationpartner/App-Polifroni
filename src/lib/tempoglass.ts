/**
 * Cómo se llama una OP en Tempoglass, el sistema del proveedor de vidrio.
 *
 * Allá cada OP es una "obra" con el mismo nombre que la OP en Monday, sin la obra adelante:
 * `🤖ID OP` - `🤖Tipo` `N°` → "IDOP-053 - PVC 2282" (Aluminio: "IDOP-066 - Aluminio A3010").
 */
export function nombreObraTempoglass(op: { idOp: string; tipo: string; numero: string }): string {
  const tipo = op.tipo.trim()
  const numero = tipo === 'PVC' ? op.numero.replace(/\D/g, '') : op.numero.trim()
  return [op.idOp.trim(), [tipo, numero].filter(Boolean).join(' ')].filter(Boolean).join(' - ')
}

/**
 * PROVISORIO: mientras se arma el robot, se busca siempre esta obra de prueba, que ya existe en
 * Tempoglass. Cuando el robot cree las obras, se busca `nombreObraTempoglass(op)`.
 */
export const OBRA_PRUEBA_TEMPOGLASS = 'IDOP-053 - PVC 2282 TEST'
