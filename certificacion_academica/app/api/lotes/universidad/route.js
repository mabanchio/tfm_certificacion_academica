import { NextResponse } from "next/server";
import { listarLotesUniversidadOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletUniversidad = String(searchParams.get("walletUniversidad") || "").trim();
  try {
    const resultado = await listarLotesUniversidadOnchain(walletUniversidad);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar lotes on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
