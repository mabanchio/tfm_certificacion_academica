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

function toBn(value) {
  const n = Number(value?.toString?.() ?? value ?? 0);
  return new anchor.BN(n);
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

function normalizarTextoComparacion(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function getRoleContext(rolEsperado) {
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
    return { ok: false, error: `La wallet conectada no tiene rol ${rolEsperado} activo on-chain` };
  }

  if (!role.active || mapRole(role.role) !== rolEsperado) {
    return { ok: false, error: `La wallet conectada no tiene rol ${rolEsperado} activo on-chain` };
  }

  return { ok: true, program, walletPubkey, config, authorityRoleAssignment };
}

export async function solicitarLoteOnchainDesdeBackpack(payload) {
  const ctx = await getRoleContext("UNIVERSIDAD");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, walletPubkey, config, authorityRoleAssignment } = ctx;
  const universidad = String(payload.universidad || "").trim();
  const carrera = String(payload.carrera || "").trim();
  const planEstudio = String(payload.planEstudio || "").trim();
  const matricula = String(payload.matricula || "").trim();
  const anio = Number(payload.anio || 0);
  const cantidadEgresados = Number(payload.cantidadEgresados || 0);

  if (!universidad || !carrera || !planEstudio || !matricula || !anio || cantidadEgresados < 1) {
    return { ok: false, error: "Datos incompletos para solicitar lote" };
  }

  const requestId = new anchor.BN(Date.now());
  const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("ministry_request"), walletPubkey.toBuffer(), requestId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  try {
    const signature = await program.methods
      .requestTokens(
        requestId,
        walletPubkey,
        universidad,
        carrera,
        planEstudio,
        matricula,
        anio,
        cantidadEgresados
      )
      .accounts({
        config,
        ministryRequest,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { ok: true, data: { signature, solicitudId: ministryRequest.toBase58() } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo solicitar el lote on-chain") };
  }
}

export async function resolverLoteMinisterioOnchainDesdeBackpack(payload) {
  const ctx = await getRoleContext("MINISTERIO");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, walletPubkey, config, authorityRoleAssignment } = ctx;
  const solicitudId = String(payload.solicitudId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const motivo = String(payload.motivo || "").trim();
  if (!solicitudId) return { ok: false, error: "Solicitud de lote inexistente" };
  if (!["aprobar", "rechazar"].includes(accion)) return { ok: false, error: "Accion invalida" };
  if (accion === "rechazar" && !motivo) return { ok: false, error: "Debe ingresar un motivo de rechazo" };

  const ministryRequest = new anchor.web3.PublicKey(solicitudId);
  let solicitud;
  try {
    solicitud = await program.account.ministryRequest.fetch(ministryRequest);
  } catch (_e) {
    return { ok: false, error: "Solicitud de lote inexistente" };
  }

  const requestId = toBn(solicitud.requestId);

  try {
    let signature;
    if (accion === "aprobar") {
      const tokenId = new anchor.BN(Date.now());
      const [certificationToken] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("certification_token"),
          solicitud.solicitanteWallet.toBuffer(),
          tokenId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      signature = await program.methods
        .approveTokenRequest(requestId, tokenId, solicitud.carrera)
        .accounts({
          config,
          ministryRequest,
          certificationToken,
          authorityRoleAssignment,
          authority: walletPubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } else {
      signature = await program.methods
        .rejectTokenRequest(requestId, motivo)
        .accounts({
          config,
          ministryRequest,
          authorityRoleAssignment,
          authority: walletPubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    return { ok: true, data: { signature, solicitudId, accion } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo resolver la solicitud de lote on-chain") };
  }
}

export async function solicitarTramiteExtranjeroOnchainDesdeBackpack(payload) {
  const ctx = await getRoleContext("EGRESADO");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, walletPubkey, config, authorityRoleAssignment } = ctx;

  const nombre = String(payload.nombre || "").trim();
  const apellido = String(payload.apellido || "").trim();
  const cuitCuil = String(payload.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  const tituloOriginal = String(payload.tituloOriginal || "").trim();
  const analiticoOriginal = String(payload.analiticoOriginal || "").trim();
  const analiticoPdfUrl = String(payload.analiticoPdfUrl || "").trim();
  const analiticoPdfNombre = String(payload.analiticoPdfNombre || "").trim();
  const analiticoPdfSha256 = String(payload.analiticoPdfSha256 || "").trim();
  const analiticoPdfId = String(payload.analiticoPdfId || "").trim();
  const paisOrigen = String(payload.paisOrigen || "").trim();
  const universidadOrigen = String(payload.universidadOrigen || "").trim();

  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil) || !tituloOriginal || !analiticoOriginal || !paisOrigen) {
    return { ok: false, error: "Datos incompletos para solicitud de validacion extranjera" };
  }
  if (!analiticoPdfUrl) {
    return { ok: false, error: "Debe adjuntar el PDF del analítico certificado" };
  }

  const requestId = new anchor.BN(Date.now());
  const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("ministry_request"), walletPubkey.toBuffer(), requestId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const metadataJson = JSON.stringify({
    titular: { nombre, apellido, cuitCuil },
    tituloOriginal,
    analiticoOriginal,
    analiticoPdfUrl,
    analiticoPdfNombre,
    analiticoPdfSha256,
    analiticoPdfId,
    paisOrigen,
    universidadOrigen,
  });

  try {
    const signature = await program.methods
      .requestForeignTitle(requestId, walletPubkey, metadataJson)
      .accounts({
        config,
        ministryRequest,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { ok: true, data: { signature, tramiteId: ministryRequest.toBase58() } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo registrar el tramite extranjero on-chain") };
  }
}

export async function resolverTramiteMinisterioOnchainDesdeBackpack(payload) {
  const ctx = await getRoleContext("MINISTERIO");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, walletPubkey, config, authorityRoleAssignment } = ctx;
  const tramiteId = String(payload.tramiteId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const accionNormalizada = accion === "aprobar" ? "enviar_cancilleria" : accion;
  const motivo = String(payload.motivo || "").trim();
  if (!tramiteId) return { ok: false, error: "Tramite inexistente" };
  if (!["enviar_cancilleria", "rechazar"].includes(accionNormalizada)) return { ok: false, error: "Accion invalida" };
  if (accionNormalizada === "rechazar" && !motivo) return { ok: false, error: "Debe ingresar un motivo de rechazo" };

  const ministryRequest = new anchor.web3.PublicKey(tramiteId);
  let tramite;
  let metadata = {};
  let esPaisArgentina = false;
  try {
    tramite = await program.account.ministryRequest.fetch(ministryRequest);
    try {
      metadata = tramite?.metadataJson ? JSON.parse(tramite.metadataJson) : {};
    } catch (_e) {
      metadata = {};
    }
    esPaisArgentina = normalizarTextoComparacion(metadata?.paisOrigen || "") === "argentina";
  } catch (_e) {
    return { ok: false, error: "Tramite inexistente" };
  }

  const requestId = toBn(tramite.requestId);
  const action = accionNormalizada === "enviar_cancilleria" ? 1 : 2;
  const tokenId = accionNormalizada === "enviar_cancilleria" ? new anchor.BN(Date.now()) : new anchor.BN(0);

  try {
    const signature = await program.methods
      .processForeignTitle(requestId, action, tokenId, motivo)
      .accounts({
        config,
        ministryRequest,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    if (accionNormalizada === "enviar_cancilleria" && esPaisArgentina) {
      try {
        const cierreResp = await fetch("/api/tramites/ministerio/completar-argentina", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletMinisterio: walletPubkey.toBase58(),
            tramiteId,
          }),
        });
        const cierrePayload = await cierreResp.json();
        if (cierreResp.ok && cierrePayload.ok) {
          return {
            ok: true,
            data: {
              signature,
              tramiteId,
              accion: "finalizada_argentina",
              certificacion: cierrePayload.data?.certificacion || null,
              urlVerificacion: cierrePayload.data?.urlVerificacion || "",
            },
          };
        }
      } catch (_e) {
        // Si el post-proceso falla, se conserva la resolución ministerial ya firmada.
      }
    }

    return { ok: true, data: { signature, tramiteId, accion: accionNormalizada } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo resolver el tramite en ministerio") };
  }
}

export async function resolverTramiteCancilleriaOnchainDesdeBackpack(payload) {
  const ctx = await getRoleContext("CANCILLERIA");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { program, walletPubkey, config, authorityRoleAssignment } = ctx;
  const tramiteId = String(payload.tramiteId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const motivo = String(payload.motivo || "").trim();
  if (!tramiteId) return { ok: false, error: "Tramite inexistente" };
  if (!["aprobar", "rechazar"].includes(accion)) return { ok: false, error: "Accion invalida" };
  if (accion === "rechazar" && !motivo) return { ok: false, error: "Debe ingresar un motivo de rechazo" };

  const ministryRequest = new anchor.web3.PublicKey(tramiteId);
  let tramite;
  try {
    tramite = await program.account.ministryRequest.fetch(ministryRequest);
  } catch (_e) {
    return { ok: false, error: "Tramite inexistente" };
  }

  const requestId = toBn(tramite.requestId);
  const action = accion === "aprobar" ? 1 : 2;
  const tokenId = accion === "aprobar" ? new anchor.BN(Date.now()) : new anchor.BN(0);

  try {
    const signature = await program.methods
      .approveApostille(requestId, action, tokenId, motivo)
      .accounts({
        config,
        ministryRequest,
        authorityRoleAssignment,
        authority: walletPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { ok: true, data: { signature, tramiteId, accion } };
  } catch (e) {
    return { ok: false, error: parseError(e, "No se pudo resolver el tramite en cancilleria") };
  }
}
