import { NextResponse } from "next/server";
import {
  obtenerSnapshotMetricas,
  evaluarSloSla,
} from "../../lib/observabilidad/metricas";
import { autorizarPorRolOnchain } from "../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  try {
    const auth = await autorizarPorRolOnchain(wallet, "ADMIN");
    if (!auth.ok) {
      return NextResponse.json(auth, { status: 403 });
    }

    const snapshot = obtenerSnapshotMetricas();
    const slo = evaluarSloSla(snapshot, {
      disponibilidadMinima: process.env.SLO_DISPONIBILIDAD_MINIMA || 0.99,
      latenciaP95MaxMs: process.env.SLO_LATENCIA_P95_MAX_MS || 1200,
      tasaErrorMaxima: process.env.SLO_TASA_ERROR_MAXIMA || 0.03,
    });

    return NextResponse.json({
      ok: true,
      data: snapshot,
      slo,
    });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar Solana local. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
