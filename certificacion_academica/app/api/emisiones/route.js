import { NextResponse } from "next/server";
import { autorizarPorRolOnchain, filtrarEmisionesOnchain } from "../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  try {
    const auth = await autorizarPorRolOnchain(wallet, "ADMIN");
    if (!auth.ok) {
      return NextResponse.json(auth, { status: 403 });
    }

    const resultado = await filtrarEmisionesOnchain({
      desde: searchParams.get("desde"),
      hasta: searchParams.get("hasta"),
      anio: searchParams.get("anio"),
      universidad: searchParams.get("universidad"),
      carrera: searchParams.get("carrera"),
    });

    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar Solana local. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
