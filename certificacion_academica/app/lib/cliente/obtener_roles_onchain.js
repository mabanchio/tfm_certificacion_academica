// Devuelve los roles activos e inactivos de una wallet leyendo directamente de la blockchain
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

function mapRole(enumValue) {
  if (!enumValue) return "";
  if (typeof enumValue === "string") return ROLE_FROM_ANCHOR[enumValue.toLowerCase()] || "";
  const keys = Object.keys(enumValue);
  return keys.length ? ROLE_FROM_ANCHOR[keys[0].toLowerCase()] || "" : "";
}

export async function obtenerRolesOnchain(walletAddress) {
  if (!walletAddress) return { ok: false, error: "Wallet vacía" };
  try {
    const connection = new anchor.web3.Connection(rpcUrl(), "confirmed");
    const provider = new anchor.AnchorProvider(connection, {}, { commitment: "confirmed" });
    const program = getProgram(provider);
    const walletPubkey = new anchor.web3.PublicKey(walletAddress);
    const [roleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), walletPubkey.toBuffer()],
      program.programId
    );
    let roles = [];
    let activo = null;
    try {
      const data = await program.account.roleAssignment.fetch(roleAssignment);
      const rol = mapRole(data.role);
      activo = data.active;
      if (rol) {
        roles.push({ rol, activo });
      }
    } catch (e) {
      // No tiene rol activo
    }
    // Buscar perfiles históricos (inactivos)
    // Si hay un historial de roles, aquí se podría consultar y agregarlos
    // Por ahora solo se retorna el actual
    return { ok: true, roles };
  } catch (e) {
    return { ok: false, error: "Error consultando roles on-chain" };
  }
}
