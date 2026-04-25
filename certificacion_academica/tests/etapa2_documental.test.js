const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");

const {
  validarCuitCuil,
  construirDidSolana,
  ejecutarPipelineCredencial,
  construirPresentacionSelectiva,
} = require("../scripts/identidad_documental");

describe("etapa2_documental", () => {
  it("valida CUIT/CUIL correctamente", () => {
    expect(validarCuitCuil("20-32964233-0")).to.equal(true);
    expect(validarCuitCuil("20-00000000-0")).to.equal(false);
  });

  it("construye DID desde wallet de Solana", () => {
    const did = construirDidSolana("B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd");
    expect(did).to.equal("did:solana:B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd");
  });

  it("ejecuta pipeline documental y genera hash/uri", () => {
    const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "credenciales-"));

    const resultado = ejecutarPipelineCredencial({
      issuerWallet: "B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd",
      recipientWallet: "4FG4iMMSuNuDBnhUbcQc6oTu8qJnCJjNT5tFnX1mT7ds",
      credentialId: 25,
      nombre: "Lucia",
      apellido: "Gomez",
      cuitCuil: "20-32964233-0",
      tipoCredencial: "Diploma",
      nombrePrograma: "Abogacia",
      baseDir: temporal,
    });

    expect(resultado.codigoRegistro).to.have.length(20);
    expect(resultado.documentHashHex).to.have.length(64);
    expect(resultado.documentHashBytes).to.have.length(32);
    expect(resultado.documentUri).to.include("local://credenciales/");
    expect(fs.existsSync(resultado.rutaArchivo)).to.equal(true);
  });

  it("crea presentacion selectiva sin exponer CUIT/CUIL", () => {
    const resultado = ejecutarPipelineCredencial({
      issuerWallet: "B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd",
      recipientWallet: "4FG4iMMSuNuDBnhUbcQc6oTu8qJnCJjNT5tFnX1mT7ds",
      credentialId: 33,
      nombre: "Sofia",
      apellido: "Ruiz",
      cuitCuil: "20-32964233-0",
      tipoCredencial: "Certificado",
      nombrePrograma: "Contador Publico",
    });

    const presentacion = construirPresentacionSelectiva(resultado.credencialJson, [
      "nombre",
      "apellido",
    ]);

    expect(presentacion.titular.nombre).to.equal("Sofia");
    expect(presentacion.titular.apellido).to.equal("Ruiz");
    expect(presentacion.titular.cuitCuil).to.equal(undefined);
  });

  it("rechaza DID cuando la wallet es invalida", () => {
    expect(() => construirDidSolana("wallet-invalida")).to.throw(
      "Wallet Solana invalida para construir DID"
    );
  });

  it("rechaza pipeline documental con CUIT/CUIL invalido", () => {
    expect(() =>
      ejecutarPipelineCredencial({
        issuerWallet: "B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd",
        recipientWallet: "4FG4iMMSuNuDBnhUbcQc6oTu8qJnCJjNT5tFnX1mT7ds",
        credentialId: 34,
        nombre: "Rocio",
        apellido: "Mendez",
        cuitCuil: "20-00000000-0",
        tipoCredencial: "Certificado",
        nombrePrograma: "Analista",
      })
    ).to.throw("CUIT/CUIL invalido");
  });

  it("expone CUIT/CUIL solo cuando hay consentimiento explicito", () => {
    const resultado = ejecutarPipelineCredencial({
      issuerWallet: "B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd",
      recipientWallet: "4FG4iMMSuNuDBnhUbcQc6oTu8qJnCJjNT5tFnX1mT7ds",
      credentialId: 35,
      nombre: "Carla",
      apellido: "Suarez",
      cuitCuil: "20-32964233-0",
      tipoCredencial: "Diploma",
      nombrePrograma: "Biotecnologia",
    });

    const presentacion = construirPresentacionSelectiva(resultado.credencialJson, [
      "nombre",
      "apellido",
      "cuitCuil",
    ]);

    expect(presentacion.titular.cuitCuil).to.equal("20329642330");
  });
});
