const { expect } = require("chai");

describe("etapa6_preproduccion", () => {
  let validarEntornoRelease;
  let construirReporteRelease;
  let reiniciarMetricas;
  let registrarMetricaHttp;

  before(async () => {
    const preflight = await import("../app/lib/release/preflight.js");
    const metricas = await import("../app/lib/observabilidad/metricas.js");

    validarEntornoRelease = preflight.validarEntornoRelease;
    construirReporteRelease = preflight.construirReporteRelease;
    reiniciarMetricas = metricas.reiniciarMetricas;
    registrarMetricaHttp = metricas.registrarMetricaHttp;
  });

  beforeEach(() => {
    reiniciarMetricas();
  });

  it("marca no-go cuando faltan variables requeridas", () => {
    const env = {
      NODE_ENV: "production",
      RELEASE_VERSION: "1.0.0",
      SOLANA_RPC_URL: "",
      NGROK_PUBLIC_URL: "",
    };

    const val = validarEntornoRelease(env);
    expect(val.ok).to.equal(false);
    expect(val.faltantes).to.include("SOLANA_RPC_URL");
    expect(val.faltantes).to.include("NGROK_PUBLIC_URL");
  });

  it("construye go cuando entorno y SLO estan saludables", () => {
    registrarMetricaHttp({ ruta: "/api/verificaciones", status: 200, duracionMs: 100 });
    registrarMetricaHttp({ ruta: "/api/verificaciones", status: 200, duracionMs: 140 });

    const reporte = construirReporteRelease({
      env: {
        NODE_ENV: "production",
        RELEASE_VERSION: "1.0.1",
        SOLANA_RPC_URL: "http://localhost:8899",
        NGROK_PUBLIC_URL: "https://demo.ngrok-free.app",
        SLO_DISPONIBILIDAD_MINIMA: "0.95",
        SLO_LATENCIA_P95_MAX_MS: "500",
        SLO_TASA_ERROR_MAXIMA: "0.1",
      },
    });

    expect(reporte.estado).to.equal("go");
    expect(reporte.version).to.equal("1.0.1");
  });
});
