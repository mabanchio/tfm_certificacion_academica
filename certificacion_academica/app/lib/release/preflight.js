import { evaluarSloSla, obtenerSnapshotMetricas } from "../observabilidad/metricas.js";

const ENTORNO_REQUERIDO = ["SOLANA_RPC_URL", "NGROK_PUBLIC_URL"];

export function validarEntornoRelease(env = process.env) {
  const faltantes = [];

  for (const key of ENTORNO_REQUERIDO) {
    if (!String(env[key] || "").trim()) {
      faltantes.push(key);
    }
  }

  return {
    ok: faltantes.length === 0,
    faltantes,
    requeridas: ENTORNO_REQUERIDO,
  };
}

export function construirReporteRelease({ env = process.env } = {}) {
  const snapshot = obtenerSnapshotMetricas();
  const slo = evaluarSloSla(snapshot, {
    disponibilidadMinima: env.SLO_DISPONIBILIDAD_MINIMA || 0.99,
    latenciaP95MaxMs: env.SLO_LATENCIA_P95_MAX_MS || 1200,
    tasaErrorMaxima: env.SLO_TASA_ERROR_MAXIMA || 0.03,
  });

  const entorno = validarEntornoRelease(env);

  const checks = [
    {
      nombre: "Entorno listo",
      cumple: entorno.ok,
      detalle: entorno.ok
        ? "Variables requeridas presentes"
        : `Faltan variables: ${entorno.faltantes.join(", ")}`,
    },
    {
      nombre: "SLO/SLA",
      cumple: slo.estado === "saludable",
      detalle: `Estado SLO: ${slo.estado}`,
    },
    {
      nombre: "Tasa de error global",
      cumple: snapshot.tasaErrorGlobal <= Number(env.SLO_TASA_ERROR_MAXIMA || 0.03),
      detalle: `Actual: ${(snapshot.tasaErrorGlobal * 100).toFixed(2)}%`,
    },
  ];

  return {
    timestamp: new Date().toISOString(),
    version: env.RELEASE_VERSION || "0.1.0",
    entorno: env.NODE_ENV || "development",
    checks,
    estado: checks.every((c) => c.cumple) ? "go" : "no-go",
    metricas: snapshot,
    slo,
    variables: entorno,
  };
}
