import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as crypto from "crypto";

export function generateCertificateHash(): Buffer {
  return crypto.randomBytes(32);
}

export async function airdrop(
  connection: anchor.web3.Connection,
  publicKey: PublicKey,
  amount: number = 2 * anchor.web3.LAMPORTS_PER_SOL
) {
  const signature = await connection.requestAirdrop(publicKey, amount);
  await connection.confirmTransaction(signature);
}

export function findCertificatePDA(
  certificateHash: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("certificate"), certificateHash],
    programId
  );
}

export function findInstituteRegistryPDA(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("institute_registry")],
    programId
  );
}

export function findVotingStatePDA(
  candidateInstitute: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("voting_state"), candidateInstitute.toBuffer()],
    programId
  );
}