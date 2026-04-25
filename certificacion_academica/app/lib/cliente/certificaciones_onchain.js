"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "../../../target/idl/certificacion_academica.json";
import { obtenerBackpackProvider } from "./wallet";

const ROLE_FROM_ANCHOR = {
  admin: "ADMIN",
  universidad: "UNIVERSIDAD",
  ministerio: "MINISTERIO",
  cancilleria: "CANCILLERIA",
  egresado: "EGRESADO",
};

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://127.0.0.1:8899";
}

function getProgram(provider) {
  return new anchor.Program(idl, provider);
}

function decodeEnum(enumValue) {
  if (!enumValue) return "";
  if (typeof enumValue === "string") return enumValue.toLowerCase();
  const keys = Object.keys(enumValue);
  return keys.length ? String(keys[0]).toLowerCase() : "";
}

function mapRole(enumValue) {
  return ROLE_FROM_ANCHOR[decodeEnum(enumValue)] || "";
}

function parseError(e, fallback) {
  const msg = String(e?.message || e || "").toLowerCase();
  if (msg.includes("user rejected")) return "La transaccion fue cancelada en Backpack";
  return fallback;
}

function generarCodigoRegistro() {
  const random = new Uint8Array(5);
  window.crypto.getRandomValues(random);
  const prefijo = Array.from(random)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const sufijo = Date.now().toString(16).toUpperCase();
  return `${prefijo}${sufijo}`.slice(0, 32);
}

async function hashBytes(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  return new Uint8Array(await window.crypto.subtle.digest("SHA-256", bytes));
}

async function recipientFromIdentity({ cuitCuil, nombre, apellido }) {
  const digest = await hashBytes(`${cuitCuil}|${String(nombre || "").toLowerCase()}|${String(apellido || "").toLowerCase()}`);
  return new anchor.web3.PublicKey(digest);
}

async function getUniversidadContext() {
  const providerWallet = obtenerBackpackProvider();
  if (!providerWallet) return { ok: false, error: "Backpack no detectada en el navegador" };

  await providerWallet.connect({ onlyIfTrusted: false });
  const walletPubkey = providerWallet.publicKey;
  if (!walletPubkey) return { ok: false, error: "No se pudo leer la wallet conectada en Backpack" };

  const connection = new anchor.web3.Connection(rpcUrl(), "confirmed");
  const provider = new anchor.AnchorProvider(connection, providerWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = getProgram(provider);

  const [config] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

  try {
    await program.account.programConfig.fetch(config);
  } catch (_e) {
    return { ok: false, error: "El sistema on-chain no esta inicializado" };
  }

  const [authorityRoleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), walletPubkey.toBuffer()],
    program.programId
  );

  let role;
  try {
    role = await program.account.roleAssignment.fetch(authorityRoleAssignment);
  } catch (_e) {
    return { ok: false, error: "La wallet conectada no tiene rol UNIVERSIDAD activo on-chain" };
  }

  if (!role.active || mapRole(role.role) !== "UNIVERSIDAD") {
    return { ok: false, error: "La wallet conectada no tiene rol UNIVERSIDAD activo on-chain" };
  }

  return { ok: true, program, walletPubkey, config, authorityRoleAssignment };
}

function parseTokenIdDesdeLoteId(loteId) {
  const raw = String(loteId || "").trim();
  const match = raw.match(/^TKN-(\d+)$/i);
  if (!match) return 0;
  return Number(match[1] || 0);
}

function asIso(unixSeconds) {
  const n = Number(unixSeconds || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 1000).toISOString();
}

export async function asignarTokenUniversidadOnchainDesdeBackpack(payload) {
  const ctx = await getUniversidadContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, walletPubkey, config, authorityRoleAssignment } = ctx;

  const loteId = String(payload.loteId || "").trim();
  const tokenId = parseTokenIdDesdeLoteId(loteId);
  if (!tokenId) return { ok: false, error: "Lote invalido para transferir token" };

  const [certificationToken] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("certification_token"), walletPubkey.toBuffer(), new anchor.BN(tokenId).toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  let lote;
  try {
    lote = await program.account.certificationToken.fetch(certificationToken);
  } catch (_e) {
    return { ok: false, error: "Lote inexistente o no pertenece a la universidad" };
  }

  if (Number(lote.cantidadDisponible || 0) < 1) {
    return { ok: false, error: "El lote seleccionado no tiene disponibilidad" };
  }

  const nombre = String(payload.nombre || "").trim();
  const apellido = String(payload.apellido || "").trim();
  const cuitCuil = String(payload.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil)) {
    return { ok: false, error: "Datos invalidos para asignacion de token al egresado" };
  }

  const programa = String(lote.titulo || "").trim();
  const institucion = String(lote.universidad || "").trim();
  if (!programa) return { ok: false, error: "El lote on-chain no tiene titulo/carrera valido" };
  if (!institucion) return { ok: false, error: "El lote on-chain no tiene universidad valida" };

  const [institution] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("institution"), walletPubkey.toBuffer()],
    program.programId
  );

  const institutionAccount = await program.account.institution.fetchNullable(institution);
  if (!institutionAccount) {
    try {
      await program.methods
        .registerInstitution(walletPubkey, institucion, "Argentina")
        .accounts({
          config,
          institution,
          authorityRoleAssignment,
          authority: walletPubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      return { ok: false, error: parseError(e, "No se pudo registrar la institucion para la universidad") };
    }
  }

  let configData;
  try {
    configData = await program.account.programConfig.fetch(config);
  } catch (_e) {
    return { ok: false, error: "No se pudo leer configuracion on-chain" };
  }

  const credentialId = new anchor.BN(Number(configData.credentialCounter || 0) + 1);
  const [credential] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), walletPubkey.toBuffer(), credentialId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const recipient = await recipientFromIdentity({ cuitCuil, nombre, apellido });
  const now = Math.floor(Date.now() / 1000);
  const payloadHash = JSON.stringify({
    tipoCredencial: "Token de carrera",
    nombre,
    apellido,
    cuitCuil,
    programa,
    institucion,
    titularOnchain: recipient.toBase58(),
    now,
  });
  const documentHash = Array.from(await hashBytes(payloadHash));
  const metadataUri = `onchain://credential/${credentialId.toString()}`;

  const fechaLote = asIso(lote.fechaCreacion).slice(0, 10);
  const fechaTransferencia = new Date().toISOString().slice(0, 10);
  const flujo = [
    {
      actor: "Ministerio",
      paso: "Aprobacion de lote",
      fecha: fechaLote,
      estado: fechaLote ? "Completado" : "Pendiente",
    },
    {
      actor: "Universidad",
      paso: "Transferencia al egresado",
      fecha: fechaTransferencia,
      estado: "Completado",
    },
    { actor: "Universidad", paso: "Legalizacion interna", fecha: "", estado: "Pendiente" },
    { actor: "Cancilleria", paso: "Apostilla", fecha: "", estado: "Pendiente" },
  ];

  try {
    const codigoRegistro = generarCodigoRegistro();
    const txSignature = await program.methods
      .assignTokenToGraduate(
        credentialId,
        recipient,
        "Token de carrera",
        programa,
        new anchor.BN(now),
        new anchor.BN(0),
        documentHash,
        metadataUri,
        codigoRegistro,
        nombre,
        apellido,
        cuitCuil,
        institucion,
        JSON.stringify(flujo)
      )
      .accounts({
        config,
        certificationToken,
        institution,
        credential,
        issuer: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return {
      ok: true,
      data: {
        codigoRegistro,
        tokenCarreraId: `CAR-${credentialId.toString()}`,
        programa,
        institucion,
        transacciones: {
          assignTokenToGraduate: txSignature,
        },
      },
    };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo asignar el token on-chain") };
  }
}
