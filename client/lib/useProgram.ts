"use client";
import {  AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { useMemo } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

export function useProgram(idl: Idl, programId: string) {
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");
    const provider = new AnchorProvider(connection, wallet, {});
    return new Program(idl, provider);
}, [wallet, idl, programId]);
}