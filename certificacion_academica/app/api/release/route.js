import { NextResponse } from "next/server";
import { construirReporteRelease } from "../../lib/release/preflight";

export async function GET() {
  const reporte = construirReporteRelease();

  return NextResponse.json({
    ok: true,
    data: reporte,
  });
}
