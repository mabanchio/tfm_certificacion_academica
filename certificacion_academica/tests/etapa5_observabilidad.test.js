const { expect } = require("chai");

const { calcularCostoTransaccion } = require("../scripts/reporte_costos_onchain");

describe("etapa5_observabilidad", () => {
  let registrarMetricaHttp;
  let obtenerSnapshotMetricas;
  let evaluarSloSla;
  let reiniciarMetricas;

  before(async () => {
    const mod = await import("../app/lib/observabilidad/metricas.js");
    registrarMetricaHttp = mod.registrarMetricaHttp;
    obtenerSnapshotMetricas = mod.obtenerSnapshotMetricas;
    evaluarSloSla = mod.evaluarSloSla;
    reiniciarMetricas = mod.reiniciarMetricas;
  });

  beforeEach(() => {
    reiniciarMetricas();
  });

  it("acumula metricas por ruta y calcula percentiles", () => {
    registrarMetricaHttp({ ruta: "/api/verificaciones", status: 200, duracionMs: 100 });
    registrarMetricaHttp({ ruta: "/api/verificaciones", status: 404, duracionMs: 260 });
    registrarMetricaHttp({ ruta: "/api/egresados", status: 200, duracionMs: 140 });

    const snap = obtenerSnapshotMetricas();

    expect(snap.totalSolicitudes).to.equal(3);
    expect(snap.totalErrores).to.equal(1);
    expect(snap.p95GlobalMs).to.be.greaterThan(0);
    expect(snap.porRuta).to.have.length(2);
  });

  it("evalua SLO como degradado cuando supera tasa de error", () => {
    registrarMetricaHttp({ ruta: "/api/verificaciones", status: 500, duracionMs: 500 });
    registrarMetricaHttp({ ruta: "/api/verificaciones", status: 200, duracionMs: 300 });

    const snap = obtenerSnapshotMetricas();
    const slo = evaluarSloSla(snap, {
      disponibilidadMinima: 0.99,
      latenciaP95MaxMs: 1200,
      tasaErrorMaxima: 0.01,
    });

    expect(slo.estado).to.equal("degradado");
  });

  it("calcula costos on-chain estimados", () => {
    const costo = calcularCostoTransaccion({
      firmas: 2,
      costoFirmaLamports: 5000,
      computeUnits: 200000,
      microLamportsPorCu: 1000,
    });

    expect(costo.costoFirmas).to.equal(10000);
    expect(costo.totalLamports).to.be.greaterThan(10000);
    expect(costo.totalSol).to.be.greaterThan(0);
  });
});
