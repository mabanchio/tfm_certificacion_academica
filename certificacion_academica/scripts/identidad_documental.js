const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REGEX_WALLET_SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function normalizarTexto(texto) {
  return String(texto || "").trim().replace(/\s+/g, " ");
}

function validarWalletSolana(wallet) {
  return REGEX_WALLET_SOLANA.test(normalizarTexto(wallet));
}

function construirDidSolana(wallet) {
  const walletNormalizada = normalizarTexto(wallet);
  if (!validarWalletSolana(walletNormalizada)) {
    throw new Error("Wallet Solana invalida para construir DID");
  }
  return `did:solana:${walletNormalizada}`;
}

function validarCuitCuil(cuitCuil) {
  const limpio = normalizarTexto(cuitCuil).replace(/[^0-9]/g, "");
  if (!/^\d{11}$/.test(limpio)) {
    return false;
  }

  const digitos = limpio.split("").map((d) => Number(d));
  const suma = PESOS_CUIT.reduce((acc, peso, idx) => acc + peso * digitos[idx], 0);
  const resto = suma % 11;
  let verificador = 11 - resto;

  if (verificador === 11) {
    verificador = 0;
  } else if (verificador === 10) {
    verificador = 9;
  }

  return verificador === digitos[10];
}

function ordenarRecursivo(valor) {
  if (Array.isArray(valor)) {
    return valor.map(ordenarRecursivo);
  }

  if (valor && typeof valor === "object") {
    return Object.keys(valor)
      .sort()
      .reduce((acc, key) => {
        acc[key] = ordenarRecursivo(valor[key]);
        return acc;
      }, {});
  }

  return valor;
}

function serializarCanonico(objeto) {
  return JSON.stringify(ordenarRecursivo(objeto));
}

function calcularHashSha256Hex(contenido) {
  return crypto.createHash("sha256").update(contenido).digest("hex");
}

function generarCodigoRegistro(issuerWallet, credentialId) {
  const base = `${normalizarTexto(issuerWallet)}:${credentialId}`;
  return calcularHashSha256Hex(base).slice(0, 20).toUpperCase();
}

function construirCredencialJsonLd(params) {
  const {
    codigoRegistro,
    issuerDid,
    recipientDid,
    nombre,
    apellido,
    cuitCuil,
    tipoCredencial,
    nombrePrograma,
    fechaEmisionIso,
    fechaExpiracionIso,
    estado,
  } = params;

  const nombreNormalizado = normalizarTexto(nombre);
  const apellidoNormalizado = normalizarTexto(apellido);
  const cuitCuilNormalizado = normalizarTexto(cuitCuil).replace(/[^0-9]/g, "");

  if (!validarCuitCuil(cuitCuilNormalizado)) {
    throw new Error("CUIT/CUIL invalido");
  }

  const hashIdentidad = calcularHashSha256Hex(
    `${nombreNormalizado}|${apellidoNormalizado}|${cuitCuilNormalizado}`
  );

  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://www.w3.org/2018/credentials/examples/v1",
    ],
    id: `urn:registro:${codigoRegistro}`,
    type: ["VerifiableCredential", "CredencialAcademicaArgentina"],
    issuer: issuerDid,
    issuanceDate: fechaEmisionIso,
    expirationDate: fechaExpiracionIso || undefined,
    credentialStatus: {
      id: `urn:status:${codigoRegistro}`,
      type: "RevocationList2020Status",
      statusPurpose: "revocation",
    },
    credentialSubject: {
      id: recipientDid,
      codigoRegistro,
      tipoCredencial: normalizarTexto(tipoCredencial),
      nombrePrograma: normalizarTexto(nombrePrograma),
      estado: normalizarTexto(estado || "Issued"),
      titular: {
        nombre: nombreNormalizado,
        apellido: apellidoNormalizado,
        cuitCuil: cuitCuilNormalizado,
      },
      hashIdentidad,
    },
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: issuerDid,
      proofValue: "PENDIENTE_FIRMA",
    },
  };
}

function guardarCredencialLocal({ credencialJson, codigoRegistro, baseDir }) {
  const directorio = baseDir || path.resolve(__dirname, "..", "storage", "credenciales");
  fs.mkdirSync(directorio, { recursive: true, mode: 0o700 });

  const rutaArchivo = path.join(directorio, `${codigoRegistro}.json`);
  const serializado = JSON.stringify(credencialJson, null, 2);
  fs.writeFileSync(rutaArchivo, serializado, { encoding: "utf8", mode: 0o600 });

  return {
    rutaArchivo,
    documentUri: `local://credenciales/${codigoRegistro}.json`,
  };
}

function construirPresentacionSelectiva(credencialJson, camposPermitidos) {
  const permitidos = new Set((camposPermitidos || []).map((c) => normalizarTexto(c)));
  const sujeto = credencialJson.credentialSubject || {};
  const titular = sujeto.titular || {};

  const presentacion = {
    codigoRegistro: sujeto.codigoRegistro,
    tipoCredencial: sujeto.tipoCredencial,
    nombrePrograma: sujeto.nombrePrograma,
    estado: sujeto.estado,
    hashIdentidad: sujeto.hashIdentidad,
    titular: {},
  };

  if (permitidos.has("nombre")) {
    presentacion.titular.nombre = titular.nombre;
  }
  if (permitidos.has("apellido")) {
    presentacion.titular.apellido = titular.apellido;
  }
  if (permitidos.has("cuitCuil")) {
    presentacion.titular.cuitCuil = titular.cuitCuil;
  }

  return presentacion;
}

function ejecutarPipelineCredencial(params) {
  const issuerDid = params.issuerDid || construirDidSolana(params.issuerWallet);
  const recipientDid = params.recipientDid || construirDidSolana(params.recipientWallet);
  const codigoRegistro = params.codigoRegistro || generarCodigoRegistro(params.issuerWallet, params.credentialId);

  const credencialJson = construirCredencialJsonLd({
    codigoRegistro,
    issuerDid,
    recipientDid,
    nombre: params.nombre,
    apellido: params.apellido,
    cuitCuil: params.cuitCuil,
    tipoCredencial: params.tipoCredencial,
    nombrePrograma: params.nombrePrograma,
    fechaEmisionIso: params.fechaEmisionIso || new Date().toISOString(),
    fechaExpiracionIso: params.fechaExpiracionIso,
    estado: params.estado,
  });

  const canonico = serializarCanonico(credencialJson);
  const documentHashHex = calcularHashSha256Hex(canonico);
  const documentHashBytes = Array.from(Buffer.from(documentHashHex, "hex"));
  const almacenamiento = guardarCredencialLocal({
    credencialJson,
    codigoRegistro,
    baseDir: params.baseDir,
  });

  return {
    codigoRegistro,
    issuerDid,
    recipientDid,
    credencialJson,
    documentHashHex,
    documentHashBytes,
    documentUri: almacenamiento.documentUri,
    rutaArchivo: almacenamiento.rutaArchivo,
  };
}

module.exports = {
  validarWalletSolana,
  construirDidSolana,
  validarCuitCuil,
  serializarCanonico,
  calcularHashSha256Hex,
  generarCodigoRegistro,
  construirCredencialJsonLd,
  construirPresentacionSelectiva,
  ejecutarPipelineCredencial,
};
