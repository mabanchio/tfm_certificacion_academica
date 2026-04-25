"use client";

import { solicitarLoteOnchainDesdeBackpack } from "./tramites_onchain";

export async function solicitarLoteFirmadoDesdeBackpack(payload) {
  return solicitarLoteOnchainDesdeBackpack(payload);
}
