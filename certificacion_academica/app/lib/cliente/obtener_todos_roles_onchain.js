// Devuelve todos los roles (activos e inactivos) de todas las wallets leyendo directamente de la blockchain (solo para admin)
import * as anchor from "@coral-xyz/anchor";
import idl from "../../../target/idl/certificacion_academica.json" assert { type: "json" };

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

export async function obtenerTodosLosRolesOnchain() {
  try {
    const connection = new anchor.web3.Connection(rpcUrl(), "confirmed");
    const provider = new anchor.AnchorProvider(connection, {}, { commitment: "confirmed" });
    const program = getProgram(provider);
    // Anchor genera la función .all() para listar todas las cuentas de un tipo
    const accounts = await program.account.roleAssignment.all();
    return {
      ok: true,
      roles: accounts
        .map(acc => ({
          wallet: acc.account.wallet.toBase58(),
          rol: mapRole(acc.account.role),
          activo: acc.account.active,
          updated_at: acc.account.updatedAt,
        }))
        .filter(rol => rol.wallet !== "11111111111111111111111111111111")
    };
  } catch (e) {
    return { ok: false, error: "Error consultando todos los roles on-chain" };
  }
}
