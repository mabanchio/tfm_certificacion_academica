"use client";

import { useEffect, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";
import { formatearFechaHora } from "../lib/cliente/fechas";
import QRGenerador from "../components/QRGenerador";

export default function VerificarPage() {
  const [codigoRegistro, setCodigoRegistro] = useState("");
  const [resultado, setResultado] = useState(null);
  const [buscado, setBuscado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function consultarRegistro(registro) {
    if (!registro.trim()) {
      setError("El codigo de registro es obligatorio.");
      setResultado(null);
      setBuscado(true);
      return;
    }

    setCargando(true);
    setError("");
    setBuscado(true);

    try {
      const response = await fetch(`/api/verificaciones?registro=${encodeURIComponent(registro)}`);
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setResultado(null);
        setError(payload.error || "No se pudo verificar el registro.");
        return;
      }

      setResultado(payload.data);
    } catch (e) {
      setResultado(null);
      setError("No fue posible conectar con el servicio de verificacion.");
    } finally {
      setCargando(false);
    }
  }

  async function verificar(event) {
    event.preventDefault();
    await consultarRegistro(codigoRegistro);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const registroDesdeQr = String(params.get("registro") || "").trim();
    if (!registroDesdeQr) return;

    setCodigoRegistro(registroDesdeQr);
    consultarRegistro(registroDesdeQr);
  }, []);

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Verificador publico</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Cualquier persona puede ingresar el codigo de un titulo para validar universidad, titulo, egresado, fecha y estado.
        </p>
      </RevealOnScroll>

      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel col-5" delay={90}>
          <h2>Consulta por codigo</h2>
          <form onSubmit={verificar}>
            <div className="campo">
              <label>Codigo de registro</label>
              <input
                value={codigoRegistro}
                onChange={(e) => setCodigoRegistro(e.target.value)}
                placeholder="Ejemplo: 1FD8AD999C3D1A254594"
              />
            </div>
            <button className="boton" type="submit">
              Verificar autenticidad
            </button>
          </form>
          {/* QR centrado debajo del botón si hay resultado válido */}
          {resultado && resultado.codigoRegistro && !error && (
            <div style={{ marginTop: 32, display: "flex", justifyContent: "center", alignItems: "center", width: "100%" }}>
              <QRGenerador value={window.location.origin + "/verificar?registro=" + resultado.codigoRegistro} size={180} />
            </div>
          )}
        </RevealOnScroll>

        <RevealOnScroll className="panel col-7" delay={130}>
          <h2>Resultado</h2>
          {!buscado ? (
            <p style={{ color: "var(--texto-secundario)" }}>Todavia no se realizo una consulta.</p>
          ) : cargando ? (
            <p style={{ color: "var(--texto-secundario)" }}>Consultando registro en curso...</p>
          ) : !resultado ? (
            <div>
              <span
                className="estado"
                style={{ color: "var(--error)", borderColor: "rgba(255,138,128,0.5)" }}
              >
                {error || "Registro no encontrado"}
              </span>
            </div>
          ) : (
            <div>
              <table className="tabla" style={{ marginBottom: 18 }}>
                <tbody>
                  <tr>
                    <th>Universidad</th>
                    <td>{resultado.institucion || "No informada"}</td>
                  </tr>
                  <tr>
                    <th>Titulo</th>
                    <td>{resultado.programa || resultado.carrera || "No informado"}</td>
                  </tr>
                  <tr>
                    <th>Egresado</th>
                    <td>{resultado.titular?.nombre} {resultado.titular?.apellido}</td>
                  </tr>
                  <tr>
                    <th>Fecha</th>
                    <td>{formatearFechaHora(resultado.fechaEmision || resultado.flujo?.[0]?.fecha)}</td>
                  </tr>
                  <tr>
                    <th>Estado del certificado</th>
                    <td>
                      <span className={`estado ${resultado.estado === "En proceso" ? "estado-proceso" : resultado.estado === "finalizada" || resultado.estado === "Finalizada" || resultado.estado === "finalizado" || resultado.estado === "Finalizado" ? "estado-ok" : "estado-ok"}`}>
                        {resultado.estado === "finalizada" || resultado.estado === "Finalizada" || resultado.estado === "finalizado" || resultado.estado === "Finalizado" ? "Finalizado" : resultado.estado}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ marginTop: 20 }}>Trazabilidad</h3>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Paso</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.flujo.map((paso) => (
                    <tr key={`${paso.actor}-${paso.paso}`}>
                      <td>{paso.actor}</td>
                      <td>{paso.paso}</td>
                      <td>{paso.fecha ? formatearFechaHora(paso.fecha) : "Pendiente"}</td>
                      <td>{paso.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </RevealOnScroll>
      </section>
    </main>
  );
}
