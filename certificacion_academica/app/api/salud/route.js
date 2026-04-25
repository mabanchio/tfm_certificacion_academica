import { NextResponse } from "next/server";

const inicio = Date.now();

export async function GET() {
  const uptimeSegundos = Math.floor((Date.now() - inicio) / 1000);

  return NextResponse.json({
    ok: true,
    servicio: "certificacion_academica",
    estado: "operativo",
    timestamp: new Date().toISOString(),
    uptimeSegundos,
  });
}
