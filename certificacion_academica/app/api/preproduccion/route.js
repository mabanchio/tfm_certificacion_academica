import { NextResponse } from "next/server";
import { construirReporteRelease } from "../../lib/release/preflight";

export async function GET() {
  const reporte = construirReporteRelease();
  const status = reporte.estado === "go" ? 200 : 503;

  return NextResponse.json(
    {
      ok: reporte.estado === "go",
      data: reporte,
    },
    { status }
  );
}
