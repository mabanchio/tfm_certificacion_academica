import { NextResponse } from "next/server";
import { filtrarEmisionesOnchain, listarCredencialesOnchain } from "../../lib/onchain/registro";
import {
  obtenerCertificacionesIndexadas,
  reindexarCertificacionesOnchain,
} from "../../lib/onchain/indexador";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = String(searchParams.get("mode") || "live").trim().toLowerCase();
  const refreshIndex = searchParams.get("refresh") === "1";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.max(1, Math.min(500, Number(searchParams.get("pageSize") || 100)));
  const filtros = {
    desde: String(searchParams.get("desde") || "").trim(),
    hasta: String(searchParams.get("hasta") || "").trim(),
    anio: String(searchParams.get("anio") || "").trim(),
    universidad: String(searchParams.get("universidad") || "").trim(),
    carrera: String(searchParams.get("carrera") || "").trim(),
  };

  const tieneFiltros = Object.values(filtros).some(Boolean);

  try {
    if (mode === "indexed") {
      if (refreshIndex) {
        const refreshed = await reindexarCertificacionesOnchain();
        if (!refreshed.ok) return NextResponse.json(refreshed, { status: 503 });
      }

      const resultado = obtenerCertificacionesIndexadas({ page, pageSize, filtros });
      return NextResponse.json({ ok: true, data: resultado.data, pagination: resultado.pagination }, { status: 200 });
    }

    const resultado = tieneFiltros
      ? await filtrarEmisionesOnchain(filtros)
      : { ok: true, data: await listarCredencialesOnchain() };
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar certificaciones on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
