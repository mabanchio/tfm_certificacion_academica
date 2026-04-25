"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "../../../target/idl/certificacion_academica.json";
import { obtenerBackpackProvider } from "./wallet";
import { WALLET_ADMIN_SISTEMA } from "../config/sistema";

const ROLE_TO_CODE = {
  ADMIN: 1,
  UNIVERSIDAD: 2,
  MINISTERIO: 3,
  CANCILLERIA: 4,
  EGRESADO: 5,
};

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

function toBnCounter(value) {
  const n = Number(value?.toString?.() ?? value ?? 0);
  return new anchor.BN(n);
}

function getProgram(provider) {
  return new anchor.Program(idl, provider);
}

function pdaRoleProfile(programId, walletPubkey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_profile"), walletPubkey.toBuffer()],
    programId
  )[0];
}

function toBase58Safe(value) {
  if (!value) return "";
  try {
    if (typeof value.toBase58 === "function") return value.toBase58();
    const asString = String(value?.toString?.() || value || "").trim();
    if (!asString) return "";
    return new anchor.web3.PublicKey(asString).toBase58();
  } catch (_e) {
    return "";
  }
}

function decodeEnum(enumValue) {
  if (!enumValue) return "";
  if (typeof enumValue === "string") return enumValue.toLowerCase();
  const keys = Object.keys(enumValue);
  return keys.length ? String(keys[0]).toLowerCase() : "";
}

function mapRole(enumValue) {
  const decoded = decodeEnum(enumValue);
  return ROLE_FROM_ANCHOR[decoded] || "";
}

function parseError(e, fallback) {
  const msg = String(e?.message || e || "");
  if (msg.toLowerCase().includes("user rejected")) {
    return "La transaccion fue cancelada en Backpack";
  }
  return fallback;
}

async function getAdminContext() {
  const providerWallet = obtenerBackpackProvider();
  if (!providerWallet) {
    return { ok: false, error: "Backpack no detectada en el navegador" };
  }

  await providerWallet.connect({ onlyIfTrusted: false });
  const walletPubkey = providerWallet.publicKey;
  if (!walletPubkey) {
    return { ok: false, error: "No se pudo leer la wallet conectada en Backpack" };
  }

  const connection = new anchor.web3.Connection(rpcUrl(), "confirmed");
  const provider = new anchor.AnchorProvider(connection, providerWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = getProgram(provider);

  const [config] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  try {
    await program.account.programConfig.fetch(config);
  } catch (_e) {
    return {
      ok: false,
      error: "El sistema on-chain no esta inicializado. Contacte al administrador.",
    };
  }

  const [authorityRoleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), walletPubkey.toBuffer()],
    program.programId
  );

  let adminRole;
  try {
    adminRole = await program.account.roleAssignment.fetch(authorityRoleAssignment);
  } catch (_e) {
    return {
      ok: false,
      error: "La wallet conectada no tiene un rol ADMIN activo on-chain",
    };
  }

  const authorityWallet = toBase58Safe(walletPubkey);
  const adminWallet = toBase58Safe(adminRole.wallet);
  const esAdminActivo = mapRole(adminRole.role) === "ADMIN" && Boolean(adminRole.active);

  if (!esAdminActivo || !adminWallet || adminWallet !== authorityWallet) {
    return {
      ok: false,
      error: `La wallet conectada no tiene permisos de administrador on-chain (admin: ${
        adminWallet || "desconocida"
      }, wallet: ${authorityWallet || "desconocida"})`,
    };
  }

  return { ok: true, providerWallet, walletPubkey, program, config, authorityRoleAssignment };
}

export async function solicitarRolOnchainDesdeBackpack(payload) {
  const providerWallet = obtenerBackpackProvider();
  if (!providerWallet) {
    return { ok: false, error: "Backpack no detectada en el navegador" };
  }

  await providerWallet.connect({ onlyIfTrusted: false });
  const walletPubkey = providerWallet.publicKey;
  if (!walletPubkey) {
    return { ok: false, error: "No se pudo leer la wallet conectada en Backpack" };
  }

  const rolSolicitado = String(payload.rolSolicitado || "").trim().toUpperCase();
  const roleCode = ROLE_TO_CODE[rolSolicitado];
  if (!roleCode) {
    return { ok: false, error: "Rol solicitado invalido" };
  }

  const connection = new anchor.web3.Connection(rpcUrl(), "confirmed");
  const provider = new anchor.AnchorProvider(connection, providerWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = getProgram(provider);

  const [config] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  let configData;
  try {
    configData = await program.account.programConfig.fetch(config);
  } catch (_e) {
    return {
      ok: false,
      error: "El sistema on-chain no esta inicializado. Contacte al administrador.",
    };
  }

  const requestId = toBnCounter(configData.roleRequestCounter).add(new anchor.BN(1));
  const [roleRequest] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("role_request"),
      walletPubkey.toBuffer(),
      requestId.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  const nombreBase = String(payload.nombre || "").trim();
  const nombres = String(payload.nombres || "").trim();
  const apellido = String(payload.apellido || payload.apellidos || "").trim();
  const nombre = nombreBase || `${apellido}${apellido && nombres ? ", " : ""}${nombres}`.trim();
  const dni = String(payload.dni || "").replace(/[^0-9]/g, "").slice(0, 8);
  const cuitCuil = String(payload.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  const entidadIngresada = String(payload.entidad || "").trim();
  const paisCancilleria = String(payload.pais || payload.paisCancilleria || "").trim();
  const entidad = rolSolicitado === "EGRESADO"
    ? "NO_APLICA_EGRESADO"
    : rolSolicitado === "CANCILLERIA"
      ? (paisCancilleria || entidadIngresada)
      : entidadIngresada;
  const documentoBase = String(payload.documento || "").trim();
  const documento = documentoBase || `DNI:${dni}|CUIT:${cuitCuil}`;
  const email = String(payload.email || "").trim();

  if (!/^\d{7,8}$/.test(dni)) {
    return { ok: false, error: "El DNI debe contener 7 u 8 digitos" };
  }

  if (!/^\d{11}$/.test(cuitCuil)) {
    return { ok: false, error: "El CUIT/CUIL debe contener 11 digitos" };
  }

  if (!nombre || !documento || !email || (rolSolicitado !== "EGRESADO" && !entidad)) {
    return { ok: false, error: "Complete todos los datos de identificacion del rol" };
  }

  try {
    const signature = await program.methods
      .requestRole(walletPubkey, requestId, roleCode, nombre, entidad, documento, email)
      .accounts({
        config,
        roleRequest,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return {
      ok: true,
      data: {
        signature,
        wallet: walletPubkey.toBase58(),
        solicitud: roleRequest.toBase58(),
      },
    };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo registrar la solicitud on-chain") };
  }
}

export async function resolverSolicitudRolOnchainDesdeBackpack(payload) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, config, walletPubkey, authorityRoleAssignment } = ctx;
  const solicitudPkRaw = String(payload.solicitudId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const motivo = String(payload.motivo || "").trim();

  if (!solicitudPkRaw) return { ok: false, error: "Solicitud de rol inexistente" };
  if (!["aprobar", "rechazar"].includes(accion)) return { ok: false, error: "Accion invalida" };

  const solicitudPk = new anchor.web3.PublicKey(solicitudPkRaw);
  let solicitud;
  try {
    solicitud = await program.account.roleRequest.fetch(solicitudPk);
  } catch (_e) {
    return { ok: false, error: "Solicitud de rol inexistente" };
  }

  const requestId = toBnCounter(solicitud.requestId);
  const [roleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), solicitud.wallet.toBuffer()],
    program.programId
  );

  try {
    const signature = await program.methods
      .resolveRoleRequest(requestId, accion === "aprobar" ? 1 : 2, motivo)
      .accounts({
        config,
        roleRequest: solicitudPk,
        roleAssignment,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let txProfileSignature = "";
    if (accion === "aprobar") {
      const rolSolicitado = mapRole(solicitud.roleRequested);
      const entidad = String(solicitud.entidad || "").trim();
      const paisesCsv = rolSolicitado === "CANCILLERIA" && entidad ? entidad : "";
      const roleCode = ROLE_TO_CODE[rolSolicitado];
      if (roleCode) {
        const roleProfile = pdaRoleProfile(program.programId, solicitud.wallet);
        txProfileSignature = await program.methods
          .upsertRoleProfile(
            solicitud.wallet,
            roleCode,
            String(solicitud.nombre || "").trim(),
            entidad,
            String(solicitud.documento || "").trim(),
            String(solicitud.email || "").trim(),
            "",
            paisesCsv
          )
          .accounts({
            config,
            roleProfile,
            authorityRoleAssignment,
            authority: walletPubkey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    }

    return {
      ok: true,
      data: { signature, txProfileSignature, solicitudId: solicitudPk.toBase58(), accion },
    };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo resolver la solicitud on-chain") };
  }
}

export async function deshabilitarRolOnchainDesdeBackpack(payload) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, config, walletPubkey, authorityRoleAssignment } = ctx;
  const walletObjetivoRaw = String(payload.walletObjetivo || "").trim();
  if (!walletObjetivoRaw) return { ok: false, error: "Wallet objetivo invalida" };

    const walletObjetivo = new anchor.web3.PublicKey(walletObjetivoRaw);
    if (walletObjetivo === process.env.NEXT_PUBLIC_WALLET_ADMIN_SISTEMA) {
      return { ok: false, error: "No se puede deshabilitar el admin principal del sistema" };
    }
    const [roleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), walletObjetivo.toBuffer()],
      program.programId
    );

  // Mapear el código de rol correctamente
  const rol = String(payload.rol || "").trim().toUpperCase();
  const roleCode = ROLE_TO_CODE[rol];
  if (!roleCode) return { ok: false, error: "Rol objetivo inválido" };
  try {
    const signature = await program.methods
      .upsertRole(walletObjetivo, roleCode, false)
      .accounts({
        config,
        roleAssignment,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { ok: true, data: { signature, walletObjetivo: walletObjetivo.toBase58(), rol } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo deshabilitar el rol on-chain") };
  }
}

export async function otorgarRolAdminOnchainDesdeBackpack(payload) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, config, walletPubkey, authorityRoleAssignment } = ctx;
  if (walletPubkey.toBase58() !== WALLET_ADMIN_SISTEMA) {
    return { ok: false, error: "Solo el administrador principal puede otorgar rol ADMIN" };
  }

  const walletObjetivoRaw = String(payload.walletObjetivo || "").trim();
  if (!walletObjetivoRaw) return { ok: false, error: "Wallet objetivo invalida" };

  const walletObjetivo = new anchor.web3.PublicKey(walletObjetivoRaw);
  const [roleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), walletObjetivo.toBuffer()],
    program.programId
  );

  const roleActual = await program.account.roleAssignment.fetchNullable(roleAssignment);
  if (roleActual?.active) {
    const rolActual = mapRole(roleActual.role);
    if (rolActual === "ADMIN") {
      return { ok: false, error: "La wallet objetivo ya tiene rol ADMIN activo" };
    }
    // Si tiene rol operativo activo, se permite asignar ADMIN; el backend preservará sus datos
  }

  try {
    const signature = await program.methods
      .upsertRole(walletObjetivo, ROLE_TO_CODE.ADMIN, true)
      .accounts({
        config,
        roleAssignment,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { ok: true, data: { signature, walletObjetivo: walletObjetivo.toBase58(), rol: "ADMIN" } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo otorgar rol ADMIN on-chain") };
  }
}

// ============================================================
// AUDITORÍA ON-CHAIN
// ============================================================

async function calcularHashDatos(datos) {
  const crypto = require("crypto");
  const serializado = JSON.stringify(datos);
  return Buffer.from(crypto.createHash("sha256").update(serializado).digest());
}

export async function recordAuditEntryOnchain(payload) {
  const provider = obtenerBackpackProvider();
  if (!provider) return { ok: false, error: "Wallet no conectada" };

  const program = getProgram(provider);
  const walletPubkey = provider.publicKey;
  const walletObjetivo = new anchor.web3.PublicKey(payload.walletObjetivo);
  const operationType = payload.operationType || 1; // UpdateRegistro = 1

  // Obtener PDAs
  const [config] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [authorityRoleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), walletPubkey.toBuffer()],
    program.programId
  );

  const timestamp = Math.floor(Date.now() / 1000);
  const timestampSeed = new anchor.BN(timestamp).toArrayLike(Buffer, "le", 8);
  const [auditLog] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("audit_log"), walletObjetivo.toBuffer(), timestampSeed],
    program.programId
  );

  try {
    // Calcular hashes
    const hashBefore = await calcularHashDatos(payload.dataHashBefore || {});
    const hashAfter = await calcularHashDatos(payload.dataHashAfter || {});

    // Construir instrucción
    const dataHashBeforeArray = Array.from(hashBefore);
    const dataHashAfterArray = Array.from(hashAfter);

    const signature = await program.methods
      .recordAuditEntry(operationType, walletObjetivo, dataHashBeforeArray, dataHashAfterArray)
      .accounts({
        config,
        auditLog,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return {
      ok: true,
      data: {
        signature,
        txHash: signature.slice(0, 16),
        auditLogAddress: auditLog.toBase58(),
        timestamp,
      },
    };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo registrar entrada de auditoría") };
  }
}
