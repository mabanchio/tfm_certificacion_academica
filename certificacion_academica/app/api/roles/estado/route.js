import { NextResponse } from "next/server";
import { obtenerEstadoWalletOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  try {
    const resultado = await obtenerEstadoWalletOnchain(wallet);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo acceder a Solana local. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
