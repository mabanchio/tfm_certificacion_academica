"use client";

import { useEffect, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";

export default function PreproduccionPage() {
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState("");

  async function cargar() {
    try {
      setError("");
      const response = await fetch("/api/preproduccion", { cache: "no-store" });
      const payload = await response.json();
      setReporte(payload.data);
      if (!payload.ok) {
        setError("Hay controles no cumplidos para salida a produccion.");
      }
    } catch (_e) {
      setError("No fue posible obtener el reporte de preproduccion.");
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Preproduccion y salida a produccion</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Panel de decision Go/No-Go con chequeos de entorno, SLO/SLA y estado operativo.
        </p>
      </RevealOnScroll>

      {error ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <div className="panel">
            <span className="estado" style={{ color: "var(--error)", borderColor: "rgba(255,138,128,0.5)" }}>
              {error}
            </span>
          </div>
        </section>
      ) : null}

      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel col-4" delay={90}>
          <h2>Estado release</h2>
          <div className="kpi">{(reporte?.estado || "--").toUpperCase()}</div>
          <p style={{ color: "var(--texto-secundario)" }}>Version: {reporte?.version || "--"}</p>
        </RevealOnScroll>

        <RevealOnScroll className="panel col-8" delay={120}>
          <h2>Controles de salida</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Control</th>
                <th>Resultado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {(reporte?.checks || []).map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td>{c.cumple ? "Cumple" : "No cumple"}</td>
                  <td>{c.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RevealOnScroll>
      </section>

      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel" delay={140}>
          <h2>Variables requeridas</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Definir: {(reporte?.variables?.requeridas || []).join(", ") || "--"}
          </p>
          <p style={{ color: "var(--texto-secundario)" }}>
            Faltantes: {(reporte?.variables?.faltantes || []).join(", ") || "ninguna"}
          </p>
        </RevealOnScroll>
      </section>
    </main>
  );
}
