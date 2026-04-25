export function formatearFechaHora(fechaEntrada) {
  if (!fechaEntrada) return "-";

  // Soporta ISO y tambien fechas tipo YYYY-MM-DD del flujo historico.
  const cruda = String(fechaEntrada).trim();
  const isoNormalizada = /^\d{4}-\d{2}-\d{2}$/.test(cruda) ? `${cruda}T00:00:00` : cruda;
  const fecha = new Date(isoNormalizada);
  if (Number.isNaN(fecha.getTime())) return "-";

  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yyyy = String(fecha.getFullYear());
  const hh = String(fecha.getHours()).padStart(2, "0");
  const min = String(fecha.getMinutes()).padStart(2, "0");
  const ss = String(fecha.getSeconds()).padStart(2, "0");

  // Si la hora es 00:00:00, mostrar solo la fecha
  if (hh === "00" && min === "00" && ss === "00") {
    return `${dd}/${mm}/${yyyy}`;
  }
  return `${dd}/${mm}/${yyyy} - ${hh}:${min}:${ss}`;
}
