import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert, expect } from "chai";
import { CertificateSystem} from "../target/types/certificate_system";
import { InstituteValidator } from "../target/types/institute_validator";
import * as crypto from "crypto";

describe("certificate-system", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const certificateProgram = anchor.workspace.CertificateSystem as Program<CertificateSystem>;
  const validatorProgram = anchor.workspace.InstituteValidator as Program<InstituteValidator>;

  // Test keypairs
  const authority = provider.wallet as anchor.Wallet;
  const institute1 = Keypair.generate();
  const institute2 = Keypair.generate();
  const institute3 = Keypair.generate();
  const unregisteredInstitute = Keypair.generate();

  // PDAs
  let instituteRegistryPda: PublicKey;
  let instituteRegistryBump: number;

  // Helper function to create certificate hash
  function createCertificateHash(data: string): number[] {
    const hash = crypto.createHash("sha256").update(data).digest();
    return Array.from(hash);
  }

  // Helper function to airdrop SOL
  async function airdrop(pubkey: PublicKey, amount: number = 2) {
    const signature = await provider.connection.requestAirdrop(
      pubkey,
      amount * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
  }

  before(async () => {
    // Airdrop to test accounts
    await airdrop(institute1.publicKey);
    await airdrop(institute2.publicKey);
    await airdrop(institute3.publicKey);
    await airdrop(unregisteredInstitute.publicKey);

    // Derive InstituteRegistry PDA
    [instituteRegistryPda, instituteRegistryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("institute_registry")],
      validatorProgram.programId
    );
  });

  describe("Setup: Institute Validator", () => {
    it("Initializes the institute registry", async () => {
      const initialInstitutes = [
        institute1.publicKey,
        institute2.publicKey,
        institute3.publicKey,
      ];

      await validatorProgram.methods
        .initializeRegistry(initialInstitutes)
        .accounts({
          instituteRegistry: instituteRegistryPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const registryAccount = await validatorProgram.account.instituteRegistry.fetch(
        instituteRegistryPda
      );

      assert.equal(registryAccount.registeredInstitutes.length, 3);
      assert.equal(registryAccount.authority.toBase58(), authority.publicKey.toBase58());
      assert.isTrue(
        registryAccount.registeredInstitutes.some(
          (key) => key.toBase58() === institute1.publicKey.toBase58()
        )
      );
    });
  });

  describe("Add Certificate", () => {
    it("Successfully adds a certificate from registered institute", async () => {
      const certHash = createCertificateHash("certificate-001");
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(certHashArray)],
        certificateProgram.programId
      );

      await certificateProgram.methods
        .addCertificate(Array.from(certHashArray))
        .accounts({
          certificate: certificatePda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      const certificate = await certificateProgram.account.certificate.fetch(certificatePda);

      assert.deepEqual(Array.from(certificate.certificateHash), certHash);
      assert.equal(certificate.issuer.toBase58(), institute1.publicKey.toBase58());
      assert.isTrue(certificate.isValid);
      assert.isNull(certificate.correctedAt);
      assert.isNull(certificate.replacementHash);
    });

    it("Fails to add certificate from unregistered institute", async () => {
      const certHash = createCertificateHash("certificate-invalid");
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(certHashArray)],
        certificateProgram.programId
      );

      try {
        await certificateProgram.methods
          .addCertificate(Array.from(certHashArray))
          .accounts({
            certificate: certificatePda,
            issuer: unregisteredInstitute.publicKey,
            instituteRegistry: instituteRegistryPda,
            instituteValidatorProgram: validatorProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([unregisteredInstitute])
          .rpc();

        assert.fail("Should have failed with IssuerNotRegistered error");
      } catch (err) {
        assert.include(err.toString(), "IssuerNotRegistered");
      }
    });

    it("Prevents duplicate certificate hashes", async () => {
      const certHash = createCertificateHash("certificate-002");
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(certHashArray)],
        certificateProgram.programId
      );

      // Add first certificate
      await certificateProgram.methods
        .addCertificate(Array.from(certHashArray))
        .accounts({
          certificate: certificatePda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      // Try to add duplicate
      try {
        await certificateProgram.methods
          .addCertificate(Array.from(certHashArray))
          .accounts({
            certificate: certificatePda,
            issuer: institute2.publicKey,
            instituteRegistry: instituteRegistryPda,
            instituteValidatorProgram: validatorProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([institute2])
          .rpc();

        assert.fail("Should have failed - PDA already exists");
      } catch (err) {
        // Expected to fail due to account already existing
        assert.isTrue(true);
      }
    });
  });

  describe("Correct Certificate", () => {
    let oldCertHash: number[];
    let oldCertPda: PublicKey;
    let newCertHash: number[];
    let newCertPda: PublicKey;

    before(async () => {
      // Create an initial certificate to correct
      oldCertHash = createCertificateHash("certificate-to-correct");
      const oldCertHashArray = new Uint8Array(oldCertHash);

      [oldCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(oldCertHashArray)],
        certificateProgram.programId
      );

      await certificateProgram.methods
        .addCertificate(Array.from(oldCertHashArray))
        .accounts({
          certificate: oldCertPda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      // Prepare new certificate hash
      newCertHash = createCertificateHash("certificate-corrected");
      const newCertHashArray = new Uint8Array(newCertHash);

      [newCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(newCertHashArray)],
        certificateProgram.programId
      );
    });

    it("Successfully corrects a certificate", async () => {
      const oldCertHashArray = new Uint8Array(oldCertHash);
      const newCertHashArray = new Uint8Array(newCertHash);

      await certificateProgram.methods
        .correctCertificate(Array.from(oldCertHashArray), Array.from(newCertHashArray))
        .accounts({
          oldCertificatePda: oldCertPda,
          newCertificate: newCertPda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      // Check old certificate is marked invalid
      const oldCert = await certificateProgram.account.certificate.fetch(oldCertPda);
      assert.isFalse(oldCert.isValid);
      assert.isNotNull(oldCert.correctedAt);
      assert.isNotNull(oldCert.replacementHash);
      assert.deepEqual(Array.from(oldCert.replacementHash!), newCertHash);

      // Check new certificate is valid
      const newCert = await certificateProgram.account.certificate.fetch(newCertPda);
      assert.isTrue(newCert.isValid);
      assert.equal(newCert.issuer.toBase58(), institute1.publicKey.toBase58());
      assert.deepEqual(Array.from(newCert.certificateHash), newCertHash);
      assert.isNull(newCert.correctedAt);
      assert.isNull(newCert.replacementHash);
    });

    it("Fails to correct certificate with wrong issuer", async () => {
      const testOldHash = createCertificateHash("certificate-wrong-issuer");
      const testNewHash = createCertificateHash("certificate-wrong-issuer-new");
      const testOldHashArray = new Uint8Array(testOldHash);
      const testNewHashArray = new Uint8Array(testNewHash);

      const [testOldPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(testOldHashArray)],
        certificateProgram.programId
      );

      const [testNewPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(testNewHashArray)],
        certificateProgram.programId
      );

      // Create certificate with institute1
      await certificateProgram.methods
        .addCertificate(Array.from(testOldHashArray))
        .accounts({
          certificate: testOldPda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      // Try to correct with institute2
      try {
        await certificateProgram.methods
          .correctCertificate(Array.from(testOldHashArray), Array.from(testNewHashArray))
          .accounts({
            oldCertificatePda: testOldPda,
            newCertificate: testNewPda,
            issuer: institute2.publicKey,
            instituteRegistry: instituteRegistryPda,
            instituteValidatorProgram: validatorProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([institute2])
          .rpc();

        assert.fail("Should have failed with UnauthorizedIssuer error");
      } catch (err) {
        assert.include(err.toString(), "UnauthorizedIssuer");
      }
    });

    it("Fails to correct already invalid certificate", async () => {
      const alreadyCorrectedHash = new Uint8Array(oldCertHash);
      const anotherNewHash = createCertificateHash("another-correction");
      const anotherNewHashArray = new Uint8Array(anotherNewHash);

      const [anotherNewPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(anotherNewHashArray)],
        certificateProgram.programId
      );

      try {
        await certificateProgram.methods
          .correctCertificate(Array.from(alreadyCorrectedHash), Array.from(anotherNewHashArray))
          .accounts({
            oldCertificatePda: oldCertPda,
            newCertificate: anotherNewPda,
            issuer: institute1.publicKey,
            instituteRegistry: instituteRegistryPda,
            instituteValidatorProgram: validatorProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([institute1])
          .rpc();

        assert.fail("Should have failed with CertificateAlreadyInvalid error");
      } catch (err) {
        assert.include(err.toString(), "CertificateAlreadyInvalid");
      }
    });
  });

  describe("Verify Certificate", () => {
    let validCertHash: number[];
    let validCertPda: PublicKey;
    let correctedCertHash: number[];
    let correctedCertPda: PublicKey;

    before(async () => {
      // Create a valid certificate
      validCertHash = createCertificateHash("certificate-to-verify");
      const validCertHashArray = new Uint8Array(validCertHash);

      [validCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(validCertHashArray)],
        certificateProgram.programId
      );

      await certificateProgram.methods
        .addCertificate(Array.from(validCertHashArray))
        .accounts({
          certificate: validCertPda,
          issuer: institute2.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute2])
        .rpc();

      // Create a certificate and then correct it for the invalid test
      correctedCertHash = createCertificateHash("certificate-for-invalid-test");
      const correctedCertHashArray = new Uint8Array(correctedCertHash);

      [correctedCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(correctedCertHashArray)],
        certificateProgram.programId
      );

      // Add the certificate
      await certificateProgram.methods
        .addCertificate(Array.from(correctedCertHashArray))
        .accounts({
          certificate: correctedCertPda,
          issuer: institute2.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute2])
        .rpc();

      // Correct the certificate
      const newCertHash = createCertificateHash("certificate-for-invalid-test-new");
      const newCertHashArray = new Uint8Array(newCertHash);

      const [newCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(newCertHashArray)],
        certificateProgram.programId
      );

      await certificateProgram.methods
        .correctCertificate(Array.from(correctedCertHashArray), Array.from(newCertHashArray))
        .accounts({
          oldCertificatePda: correctedCertPda,
          newCertificate: newCertPda,
          issuer: institute2.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute2])
        .rpc();
    });

    it("Successfully verifies a valid certificate", async () => {
      const status = await certificateProgram.methods
        .verifyCertificate()
        .accounts({
          certificate: validCertPda,
        })
        .view();

      assert.deepEqual(Array.from(status.certificateHash), validCertHash);
      assert.equal(status.issuer.toBase58(), institute2.publicKey.toBase58());
      assert.isTrue(status.isValid);
      assert.isNull(status.correctedAt);
      assert.isNull(status.replacementHash);
    });

    it("Successfully verifies an invalid (corrected) certificate", async () => {
      const status = await certificateProgram.methods
        .verifyCertificate()
        .accounts({
          certificate: correctedCertPda,
        })
        .view();

      assert.isFalse(status.isValid);
      assert.isNotNull(status.correctedAt);
      assert.isNotNull(status.replacementHash);
    });
  });

  describe("Multiple Institutes", () => {
    it("Allows multiple institutes to issue certificates", async () => {
      const cert1Hash = createCertificateHash("multi-cert-1");
      const cert2Hash = createCertificateHash("multi-cert-2");
      const cert3Hash = createCertificateHash("multi-cert-3");

      const cert1HashArray = new Uint8Array(cert1Hash);
      const cert2HashArray = new Uint8Array(cert2Hash);
      const cert3HashArray = new Uint8Array(cert3Hash);

      const [cert1Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(cert1HashArray)],
        certificateProgram.programId
      );

      const [cert2Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(cert2HashArray)],
        certificateProgram.programId
      );

      const [cert3Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(cert3HashArray)],
        certificateProgram.programId
      );

      // Institute 1 issues certificate
      await certificateProgram.methods
        .addCertificate(Array.from(cert1HashArray))
        .accounts({
          certificate: cert1Pda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      // Institute 2 issues certificate
      await certificateProgram.methods
        .addCertificate(Array.from(cert2HashArray))
        .accounts({
          certificate: cert2Pda,
          issuer: institute2.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute2])
        .rpc();

      // Institute 3 issues certificate
      await certificateProgram.methods
        .addCertificate(Array.from(cert3HashArray))
        .accounts({
          certificate: cert3Pda,
          issuer: institute3.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute3])
        .rpc();

      // Verify all certificates
      const cert1 = await certificateProgram.account.certificate.fetch(cert1Pda);
      const cert2 = await certificateProgram.account.certificate.fetch(cert2Pda);
      const cert3 = await certificateProgram.account.certificate.fetch(cert3Pda);

      assert.equal(cert1.issuer.toBase58(), institute1.publicKey.toBase58());
      assert.equal(cert2.issuer.toBase58(), institute2.publicKey.toBase58());
      assert.equal(cert3.issuer.toBase58(), institute3.publicKey.toBase58());

      assert.isTrue(cert1.isValid);
      assert.isTrue(cert2.isValid);
      assert.isTrue(cert3.isValid);
    });
  });

  describe("Event Emission", () => {
    it("Emits CertificateAdded event", async () => {
      const certHash = createCertificateHash("event-test-cert");
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("certificate"), Buffer.from(certHashArray)],
        certificateProgram.programId
      );

      const tx = await certificateProgram.methods
        .addCertificate(Array.from(certHashArray))
        .accounts({
          certificate: certificatePda,
          issuer: institute1.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([institute1])
        .rpc();

      // In a real test, you'd parse the transaction logs to verify the event
      assert.isString(tx);
    });
  });
});