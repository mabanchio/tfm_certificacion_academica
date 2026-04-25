import { NextResponse } from "next/server";
import { obtenerPerfilRolOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  try {
    const resultado = await obtenerPerfilRolOnchain(wallet);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar perfil de rol on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
