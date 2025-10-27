"use client";
import { useAnchorPrograms } from "@/lib/useAnchorProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PublicKey } from "@solana/web3.js";

export default function RegistryPage() {
  const { publicKey } = useWallet();
  const programs = useAnchorPrograms();
  const [status, setStatus] = useState("");

  async function initializeRegistry() {
    if (!programs || !publicKey) {
      setStatus("Connect wallet first");
      return;
    }

    try {
      const { provider, validatorProgram } = programs;
      setStatus("Initializing registry...");

      const [registryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("institute_registry")],
        validatorProgram.programId
      );

      const tx = await validatorProgram.methods
        .initializeRegistry([])
        .accounts({
          instituteRegistry: registryPDA,
          authority: provider.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      console.log("TX:", tx);
      setStatus("✅ Registry initialized successfully!");
    } catch (err) {
      console.error(err);
      setStatus("❌ Failed: " + (err.message || err));
    }
  }

  return (
    <div className="flex flex-col items-center p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Institute Registry</h1>
      <Button onClick={initializeRegistry}>Initialize Registry</Button>
      <p>{status}</p>
    </div>
  );
}
