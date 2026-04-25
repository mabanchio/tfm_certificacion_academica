import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_BYTES = 8 * 1024 * 1024;
const BASE_DIR = path.join(process.cwd(), ".data", "tramites_documentos");

export async function POST(request) {
  try {
    const formData = await request.formData();
    const archivo = formData.get("archivo");

    if (!archivo || typeof archivo === "string") {
      return NextResponse.json({ ok: false, error: "Debe adjuntar un archivo PDF." }, { status: 400 });
    }

    const nombreOriginal = String(archivo.name || "analitico.pdf").trim();
    const type = String(archivo.type || "").toLowerCase();
    if (type !== "application/pdf" && !nombreOriginal.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Solo se admiten archivos PDF." }, { status: 400 });
    }

    const bytes = Buffer.from(await archivo.arrayBuffer());
    if (!bytes.length) {
      return NextResponse.json({ ok: false, error: "El archivo PDF está vacío." }, { status: 400 });
    }
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "El PDF supera el tamaño máximo de 8MB." }, { status: 400 });
    }

    const documentoId = crypto.randomUUID();
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

    await fs.mkdir(BASE_DIR, { recursive: true });
    const pdfPath = path.join(BASE_DIR, `${documentoId}.pdf`);
    const metaPath = path.join(BASE_DIR, `${documentoId}.json`);

    await fs.writeFile(pdfPath, bytes);
    await fs.writeFile(
      metaPath,
      JSON.stringify(
        {
          documentoId,
          nombreOriginal,
          mimeType: "application/pdf",
          size: bytes.length,
          sha256,
          creadoEn: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return NextResponse.json({
      ok: true,
      data: {
        documentoId,
        nombreOriginal,
        mimeType: "application/pdf",
        size: bytes.length,
        sha256,
        url: `/api/tramites/documentos/${documentoId}`,
      },
    });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo adjuntar el PDF del analítico." },
      { status: 500 }
    );
  }
}
