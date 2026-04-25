export const instituciones = [
  {
    id: "UNI-001",
    nombre: "Universidad Nacional de Tecnologia Aplicada",
    pais: "Argentina",
    estado: "Activa",
  },
  {
    id: "UNI-002",
    nombre: "Instituto Superior Federal del Litoral",
    pais: "Argentina",
    estado: "Activa",
  },
];

export const certificaciones = [
  {
    codigoRegistro: "1FD8AD999C3D1A254594",
    titular: {
      nombre: "Maria",
      apellido: "Perez",
      cuitCuil: "20329642330",
    },
    tipoCredencial: "Diploma",
    programa: "Ingenieria en Sistemas",
    institucion: "Universidad Nacional de Tecnologia Aplicada",
    estado: "Apostillado",
    flujo: [
      { actor: "Universidad", paso: "Emision", fecha: "2026-04-10", estado: "Completado" },
      { actor: "Universidad", paso: "Legalizacion interna", fecha: "2026-04-11", estado: "Completado" },
      { actor: "Ministerio", paso: "Validacion ministerial", fecha: "2026-04-12", estado: "Completado" },
      { actor: "Cancilleria", paso: "Apostilla", fecha: "2026-04-13", estado: "Completado" },
    ],
  },
  {
    codigoRegistro: "4B4BE2F90CB9A3F066D0",
    titular: {
      nombre: "Lucia",
      apellido: "Gomez",
      cuitCuil: "20329642330",
    },
    tipoCredencial: "Certificado",
    programa: "Abogacia",
    institucion: "Instituto Superior Federal del Litoral",
    estado: "En proceso",
    flujo: [
      { actor: "Universidad", paso: "Emision", fecha: "2026-04-15", estado: "Completado" },
      { actor: "Universidad", paso: "Legalizacion interna", fecha: "2026-04-16", estado: "Completado" },
      { actor: "Ministerio", paso: "Validacion ministerial", fecha: "", estado: "Pendiente" },
      { actor: "Cancilleria", paso: "Apostilla", fecha: "", estado: "Pendiente" },
    ],
  },
];

export const pendientesMinisterio = certificaciones.filter((c) => c.estado === "En proceso");
export const pendientesCancilleria = certificaciones.filter((c) => c.estado === "En proceso");

export function buscarPorRegistro(codigoRegistro) {
  return certificaciones.find(
    (cert) => cert.codigoRegistro.toUpperCase().trim() === String(codigoRegistro || "").toUpperCase().trim()
  );
}

export function buscarTitular({ nombre, apellido, cuitCuil }) {
  const n = String(nombre || "").trim().toLowerCase();
  const a = String(apellido || "").trim().toLowerCase();
  const c = String(cuitCuil || "").replace(/[^0-9]/g, "");

  return certificaciones.filter((cert) => {
    const coincideNombre = !n || cert.titular.nombre.toLowerCase().includes(n);
    const coincideApellido = !a || cert.titular.apellido.toLowerCase().includes(a);
    const coincideCuit = !c || cert.titular.cuitCuil.includes(c);
    return coincideNombre && coincideApellido && coincideCuit;
  });
}
