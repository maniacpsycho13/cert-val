"use client";

import { useMemo } from "react";
import { AnchorProvider, Program, Idl, setProvider } from "@coral-xyz/anchor";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import idlValidator from "@/idl/institute_validator.json";
import idlCertificate from "@/idl/certificate_system.json";

export const useAnchorPrograms = () => {
  const wallet = useAnchorWallet();

  return useMemo( () => {
    if (!wallet) return null;

    const connection = new Connection("http://127.0.0.1:8899", "confirmed");
    connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);

    const provider = new AnchorProvider(connection, wallet, {});
    setProvider(provider);

    const validatorProgram = new Program(
      idlValidator as Idl,
    //   new PublicKey("JYhgtXGuQWYvmmtiKwZJgDuaP1iPLjw3MjtwukFhAJQ"),
      provider
    );

    const certificateProgram = new Program(
      idlCertificate as Idl,
    //   new PublicKey("BkxAccdVywyovJuU5RqdR1jHpWT7z6wfgZc9akEdSpqE"),
      provider
    );

    return { provider, validatorProgram, certificateProgram };
  }, [wallet]);
};
