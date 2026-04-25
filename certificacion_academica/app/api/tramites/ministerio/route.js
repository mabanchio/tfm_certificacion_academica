import { NextResponse } from "next/server";
import { listarTramitesMinisterioOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletMinisterio = String(searchParams.get("walletMinisterio") || "").trim();
  try {
    const resultado = await listarTramitesMinisterioOnchain(walletMinisterio);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar tramites ministeriales on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
