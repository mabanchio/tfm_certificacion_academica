const inicioProcesoMs = Date.now();

const estadoMetricas = {
  totalSolicitudes: 0,
  totalErrores: 0,
  porRuta: {},
  duracionesMs: [],
  ultimoEvento: null,
};

function percentil(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function promedio(arr) {
  if (!arr.length) return 0;
  return arr.reduce((acc, v) => acc + v, 0) / arr.length;
}

function toNumberSeguro(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function registrarMetricaHttp({ ruta, status, duracionMs }) {
  const route = String(ruta || "desconocida");
  const statusCode = toNumberSeguro(status);
  const d = Math.max(0, toNumberSeguro(duracionMs));

  estadoMetricas.totalSolicitudes += 1;
  if (statusCode >= 400) {
    estadoMetricas.totalErrores += 1;
  }

  if (!estadoMetricas.porRuta[route]) {
    estadoMetricas.porRuta[route] = {
      solicitudes: 0,
      errores: 0,
      latencias: [],
      statusCodes: {},
    };
  }

  const item = estadoMetricas.porRuta[route];
  item.solicitudes += 1;
  if (statusCode >= 400) item.errores += 1;
  item.latencias.push(d);
  item.statusCodes[statusCode] = (item.statusCodes[statusCode] || 0) + 1;

  estadoMetricas.duracionesMs.push(d);
  if (estadoMetricas.duracionesMs.length > 5000) {
    estadoMetricas.duracionesMs = estadoMetricas.duracionesMs.slice(-5000);
  }

  estadoMetricas.ultimoEvento = {
    timestamp: new Date().toISOString(),
    ruta: route,
    status: statusCode,
    duracionMs: d,
  };
}

export function obtenerSnapshotMetricas() {
  const latenciasGlobales = [...estadoMetricas.duracionesMs].sort((a, b) => a - b);
  const uptimeSegundos = Math.max(1, Math.floor((Date.now() - inicioProcesoMs) / 1000));

  const porRuta = Object.entries(estadoMetricas.porRuta).map(([ruta, item]) => {
    const latencias = [...item.latencias].sort((a, b) => a - b);
    const tasaError = item.solicitudes ? item.errores / item.solicitudes : 0;

    return {
      ruta,
      solicitudes: item.solicitudes,
      errores: item.errores,
      tasaError,
      latenciaPromedioMs: promedio(item.latencias),
      p95Ms: percentil(latencias, 95),
      p99Ms: percentil(latencias, 99),
      statusCodes: item.statusCodes,
    };
  });

  const total = estadoMetricas.totalSolicitudes;
  const errores = estadoMetricas.totalErrores;

  return {
    timestamp: new Date().toISOString(),
    uptimeSegundos,
    totalSolicitudes: total,
    totalErrores: errores,
    tasaErrorGlobal: total ? errores / total : 0,
    solicitudesPorSegundo: total / uptimeSegundos,
    latenciaPromedioGlobalMs: promedio(estadoMetricas.duracionesMs),
    p95GlobalMs: percentil(latenciasGlobales, 95),
    p99GlobalMs: percentil(latenciasGlobales, 99),
    ultimoEvento: estadoMetricas.ultimoEvento,
    porRuta,
  };
}

export function evaluarSloSla(snapshot, objetivos = {}) {
  const objetivoDisponibilidad = Number(objetivos.disponibilidadMinima || 0.99);
  const objetivoP95 = Number(objetivos.latenciaP95MaxMs || 1200);
  const objetivoTasaError = Number(objetivos.tasaErrorMaxima || 0.03);

  const disponibilidad = Math.max(0, 1 - snapshot.tasaErrorGlobal);

  const checks = [
    {
      nombre: "Disponibilidad",
      valor: disponibilidad,
      objetivo: objetivoDisponibilidad,
      cumple: disponibilidad >= objetivoDisponibilidad,
    },
    {
      nombre: "Latencia P95 (ms)",
      valor: snapshot.p95GlobalMs,
      objetivo: objetivoP95,
      cumple: snapshot.p95GlobalMs <= objetivoP95,
    },
    {
      nombre: "Tasa de error",
      valor: snapshot.tasaErrorGlobal,
      objetivo: objetivoTasaError,
      cumple: snapshot.tasaErrorGlobal <= objetivoTasaError,
    },
  ];

  return {
    estado: checks.every((c) => c.cumple) ? "saludable" : "degradado",
    checks,
  };
}

export function reiniciarMetricas() {
  estadoMetricas.totalSolicitudes = 0;
  estadoMetricas.totalErrores = 0;
  estadoMetricas.porRuta = {};
  estadoMetricas.duracionesMs = [];
  estadoMetricas.ultimoEvento = null;
}
