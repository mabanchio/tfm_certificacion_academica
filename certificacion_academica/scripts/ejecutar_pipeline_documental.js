const {
  ejecutarPipelineCredencial,
  construirPresentacionSelectiva,
} = require("./identidad_documental");

function ejecutarDemo() {
  const resultado = ejecutarPipelineCredencial({
    issuerWallet: "B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd",
    recipientWallet: "4FG4iMMSuNuDBnhUbcQc6oTu8qJnCJjNT5tFnX1mT7ds",
    credentialId: 1,
    nombre: "Maria",
    apellido: "Perez",
    cuitCuil: "20-32964233-0",
    tipoCredencial: "Diploma",
    nombrePrograma: "Ingenieria en Sistemas",
    estado: "Issued",
  });

  const presentacion = construirPresentacionSelectiva(resultado.credencialJson, [
    "nombre",
    "apellido",
  ]);

  console.log("Codigo registro:", resultado.codigoRegistro);
  console.log("URI documento:", resultado.documentUri);
  console.log("Hash SHA-256:", resultado.documentHashHex);
  console.log("Presentacion selectiva:", JSON.stringify(presentacion, null, 2));
}

if (require.main === module) {
  ejecutarDemo();
}
