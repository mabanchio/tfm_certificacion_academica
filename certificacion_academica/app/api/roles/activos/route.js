import { NextResponse } from "next/server";
import { listarRolesActivosOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletAdmin = String(searchParams.get("walletAdmin") || "").trim();
  try {
    const resultado = await listarRolesActivosOnchain(walletAdmin);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo acceder a Solana local. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
