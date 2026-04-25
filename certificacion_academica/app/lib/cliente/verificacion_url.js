"use client";

function baseVerificacion() {
  const configured = String(
    process.env.NEXT_PUBLIC_VERIFY_BASE_URL || process.env.NEXT_PUBLIC_NGROK_VERIFY_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://127.0.0.1:3000";
}

export function urlVerificacionRegistro(codigoRegistro) {
  return `${baseVerificacion()}/verificar?registro=${encodeURIComponent(String(codigoRegistro || "").trim())}`;
}
