'use client';
import { AnchorProvider, Program, Idl, setProvider } from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idlValidator from "@/idl/institute_validator.json";
import idlCertificate from "@/idl/certificate_system.json";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

export function getProgram() {
  const wallet = useAnchorWallet();
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC!);
  const provider = new AnchorProvider(connection, wallet, {});
  setProvider(provider);

  const validatorProgram = new Program(
    idlValidator as Idl,
    new PublicKey("JYhgtXGuQWYvmmtiKwZJgDuaP1iPLjw3MjtwukFhAJQ"),
    provider
  );

  const certificateProgram = new Program(
    idlCertificate as Idl,
    new PublicKey("BkxAccdVywyovJuU5RqdR1jHpWT7z6wfgZc9akEdSpqE"),
    provider
  );

  return { provider, validatorProgram, certificateProgram };
}
