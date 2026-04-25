"use client";

export default function BloqueAccesoRol({ wallet, rolEsperado, rolActual, rolesDisponibles = [] }) {
  const roles = Array.isArray(rolesDisponibles)
    ? rolesDisponibles
    : rolActual
      ? [rolActual]
      : [];
  const accesoHabilitado = roles.includes(rolEsperado) || rolActual === rolEsperado;

  if (!wallet) {
    return (
      <section className="grilla" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>Wallet no configurada</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Defina su wallet y solicite rol desde el modulo de acceso.
          </p>
          <a href="/acceso" className="boton" style={{ display: "inline-block" }}>
            Ir a acceso
          </a>
        </div>
      </section>
    );
  }

  if (!accesoHabilitado) {
    return (
      <section className="grilla" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>Acceso restringido</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Este panel requiere rol {rolEsperado}. Roles detectados: {roles.join(", ") || "sin rol"}.
          </p>
        </div>
      </section>
    );
  }

  return null;
}
