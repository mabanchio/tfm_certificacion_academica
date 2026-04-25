import { NextResponse } from "next/server";
import { listarPersonasOnchain } from "../../lib/onchain/registro";
import {
  obtenerPersonasIndexadas,
  reindexarPersonasOnchain,
} from "../../lib/onchain/indexador";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = String(searchParams.get("mode") || "live").trim().toLowerCase();
  const refreshIndex = searchParams.get("refresh") === "1";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.max(1, Math.min(500, Number(searchParams.get("pageSize") || 100)));
  const filtros = {
    rol: String(searchParams.get("rol") || "").trim(),
    institucion: String(searchParams.get("institucion") || "").trim(),
    q: String(searchParams.get("q") || "").trim(),
  };

  try {
    if (mode === "indexed") {
      if (refreshIndex) {
        const refreshed = await reindexarPersonasOnchain();
        if (!refreshed.ok) return NextResponse.json(refreshed, { status: 503 });
      }
      const resultado = obtenerPersonasIndexadas({ page, pageSize, filtros });
      return NextResponse.json({ ok: true, data: resultado.data, pagination: resultado.pagination }, { status: 200 });
    }

    const resultado = await listarPersonasOnchain();
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar personas on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
