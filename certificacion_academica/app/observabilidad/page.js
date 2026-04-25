"use client";

import { useEffect, useMemo, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";
import { useWalletSesion } from "../lib/cliente/wallet";

function formatearPorcentaje(v) {
  return `${(Number(v || 0) * 100).toFixed(2)}%`;
}

function formatearMs(v) {
  return `${Number(v || 0).toFixed(2)} ms`;
}

export default function ObservabilidadPage() {
  const { wallet } = useWalletSesion();
  const [salud, setSalud] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [slo, setSlo] = useState(null);
  const [error, setError] = useState("");

  async function refrescar() {
    try {
      setError("");
      const [rSalud, rMetricas] = await Promise.all([
        fetch("/api/salud", { cache: "no-store" }),
        fetch(`/api/observabilidad?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" }),
      ]);

      const pSalud = await rSalud.json();
      const pMetricas = await rMetricas.json();

      if (!wallet) {
        setError("Solo el administrador puede visualizar metricas. Defina wallet en Acceso.");
        return;
      }

      if (!rSalud.ok || !rMetricas.ok || !pMetricas.ok) {
        setError("No se pudo actualizar el panel de observabilidad.");
        return;
      }

      setSalud(pSalud);
      setMetricas(pMetricas.data);
      setSlo(pMetricas.slo);
    } catch (_e) {
      setError("Error de conectividad al obtener telemetria.");
    }
  }

  useEffect(() => {
    refrescar();
    const timer = setInterval(refrescar, 6000);
    return () => clearInterval(timer);
  }, [wallet]);

  const rutasOrdenadas = useMemo(() => {
    return [...(metricas?.porRuta || [])].sort((a, b) => b.solicitudes - a.solicitudes);
  }, [metricas]);

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Observabilidad y rendimiento</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Monitoreo de salud, latencia, tasa de error, volumen por ruta y cumplimiento de SLO/SLA.
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
        <RevealOnScroll className="panel col-4" delay={80}>
          <h2>Estado</h2>
          <div className="kpi">{salud?.estado || "cargando"}</div>
          <p style={{ color: "var(--texto-secundario)" }}>
            Uptime: {salud ? `${salud.uptimeSegundos}s` : "--"}
          </p>
        </RevealOnScroll>

        <RevealOnScroll className="panel col-4" delay={120}>
          <h2>Solicitudes</h2>
          <div className="kpi">{metricas?.totalSolicitudes ?? 0}</div>
          <p style={{ color: "var(--texto-secundario)" }}>
            RPS aproximado: {metricas ? metricas.solicitudesPorSegundo.toFixed(2) : "0.00"}
          </p>
        </RevealOnScroll>

        <RevealOnScroll className="panel col-4" delay={170}>
          <h2>Tasa de error</h2>
          <div className="kpi">{metricas ? formatearPorcentaje(metricas.tasaErrorGlobal) : "0.00%"}</div>
          <p style={{ color: "var(--texto-secundario)" }}>
            P95 global: {metricas ? formatearMs(metricas.p95GlobalMs) : "--"}
          </p>
        </RevealOnScroll>
      </section>

      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel col-6" delay={90}>
          <h2>Cumplimiento SLO/SLA</h2>
          <p>
            Estado general:{" "}
            <span className={`estado ${slo?.estado === "saludable" ? "estado-ok" : "estado-proceso"}`}>
              {slo?.estado || "sin datos"}
            </span>
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Metrica</th>
                <th>Valor</th>
                <th>Objetivo</th>
                <th>Cumple</th>
              </tr>
            </thead>
            <tbody>
              {(slo?.checks || []).map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td>{typeof c.valor === "number" && c.valor < 1 ? formatearPorcentaje(c.valor) : c.valor}</td>
                  <td>{typeof c.objetivo === "number" && c.objetivo < 1 ? formatearPorcentaje(c.objetivo) : c.objetivo}</td>
                  <td>{c.cumple ? "Si" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RevealOnScroll>

        <RevealOnScroll className="panel col-6" delay={130}>
          <h2>Latencia global</h2>
          <table className="tabla">
            <tbody>
              <tr>
                <th>Promedio</th>
                <td>{metricas ? formatearMs(metricas.latenciaPromedioGlobalMs) : "--"}</td>
              </tr>
              <tr>
                <th>P95</th>
                <td>{metricas ? formatearMs(metricas.p95GlobalMs) : "--"}</td>
              </tr>
              <tr>
                <th>P99</th>
                <td>{metricas ? formatearMs(metricas.p99GlobalMs) : "--"}</td>
              </tr>
              <tr>
                <th>Ultimo evento</th>
                <td>{metricas?.ultimoEvento?.ruta || "--"}</td>
              </tr>
            </tbody>
          </table>
        </RevealOnScroll>
      </section>

      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel" delay={110}>
          <h2>Volumen por ruta</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Ruta</th>
                <th>Solicitudes</th>
                <th>Errores</th>
                <th>Tasa de error</th>
                <th>P95</th>
              </tr>
            </thead>
            <tbody>
              {rutasOrdenadas.map((r) => (
                <tr key={r.ruta}>
                  <td>{r.ruta}</td>
                  <td>{r.solicitudes}</td>
                  <td>{r.errores}</td>
                  <td>{formatearPorcentaje(r.tasaError)}</td>
                  <td>{formatearMs(r.p95Ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RevealOnScroll>
      </section>
    </main>
  );
}
