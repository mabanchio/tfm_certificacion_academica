import { NextResponse } from "next/server";
import { generarTransaccionAsignacionTokenUniversidad } from "../../../lib/onchain/registro";

export async function POST(request) {
  try {
    const body = await request.json();
    // Validar campos requeridos
    const required = ["walletUniversidad", "loteId", "nombre", "apellido", "cuitCuil", "promedio"];
    for (const key of required) {
      if (!body[key]) {
        return NextResponse.json({ ok: false, error: `Falta el campo requerido: ${key}` }, { status: 400 });
      }
    }
    // Generar transacción de asignación para firma con Backpack
    const payload = await generarTransaccionAsignacionTokenUniversidad({
      walletUniversidad: body.walletUniversidad,
      loteId: body.loteId,
      nombre: body.nombre,
      apellido: body.apellido,
      cuitCuil: body.cuitCuil,
      promedio: Number(body.promedio),
    });
    if (!payload.ok) {
      return NextResponse.json(payload, { status: 400 });
    }
    // Devuelve la transacción serializada y datos para la UI
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Error inesperado" }, { status: 500 });
  }
}
