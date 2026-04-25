import { NextResponse } from "next/server";
import { listarTramitesCancilleriaOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletCancilleria = String(searchParams.get("walletCancilleria") || "").trim();
  try {
    const resultado = await listarTramitesCancilleriaOnchain(walletCancilleria);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar tramites de cancilleria on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
