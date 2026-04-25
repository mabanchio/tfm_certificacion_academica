import { NextResponse } from "next/server";
import { listarTramitesEgresadoOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletEgresado = String(searchParams.get("walletEgresado") || "").trim();
  try {
    const resultado = await listarTramitesEgresadoOnchain(walletEgresado);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar tramites del egresado on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
