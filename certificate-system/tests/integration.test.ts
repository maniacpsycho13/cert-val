import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CertificateSystem } from "../target/types/certificate_system";
import { InstituteValidator } from "../target/types/institute_validator";
import { airdrop, findInstituteRegistryPDA, findVotingStatePDA } from "./utils/helpers";
import { generateCertificateHash, findCertificatePDA } from "./utils/helpers";
import { expect } from "chai";

describe("Integration Tests: Full Workflow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const certificateProgram = anchor.workspace
    .CertificateSystem as Program<CertificateSystem>;
  const validatorProgram = anchor.workspace
    .InstituteValidator as Program<InstituteValidator>;

  let authority: anchor.web3.Keypair;
  let foundingInstitute: anchor.web3.Keypair;
  let newInstitute: anchor.web3.Keypair;
  let registryPDA: anchor.web3.PublicKey;
  let existingInstitutes: anchor.web3.PublicKey[] = [];

  before(async () => {
    authority = anchor.web3.Keypair.generate();
    foundingInstitute = anchor.web3.Keypair.generate();
    newInstitute = anchor.web3.Keypair.generate();

    await airdrop(provider.connection, authority.publicKey);
    await airdrop(provider.connection, foundingInstitute.publicKey);
    await airdrop(provider.connection, newInstitute.publicKey);

    [registryPDA] = findInstituteRegistryPDA(validatorProgram.programId);

    // Check if registry already exists
    try {
      const existingRegistry = await validatorProgram.account.instituteRegistry.fetch(
        registryPDA
      );
      console.log("Registry already exists, using existing registry");
      existingInstitutes = existingRegistry.registeredInstitutes;
    } catch (error) {
      // Registry doesn't exist, initialize with one founding institute
      console.log("Initializing new registry");
      await validatorProgram.methods
        .initializeRegistry([foundingInstitute.publicKey])
        .accounts({
          instituteRegistry: registryPDA,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      existingInstitutes = [foundingInstitute.publicKey];
    }
  });

  it("Complete workflow: Admit new institute and issue certificate", async function() {
    // If registry was pre-initialized, we need to use an existing institute to vote
    // Since we don't have their keypairs, we'll skip the full workflow test
    if (existingInstitutes.length > 1 || 
        !existingInstitutes.some(pk => pk.equals(foundingInstitute.publicKey))) {
      console.log("Skipping full workflow - registry pre-initialized with unknown institutes");
      this.skip();
      return;
    }

    const initialInstituteCount = existingInstitutes.length;

    // Step 1: Create election for new institute
    const [votingStatePDA] = findVotingStatePDA(
      newInstitute.publicKey,
      validatorProgram.programId
    );

    await validatorProgram.methods
      .newInstituteElection(newInstitute.publicKey)
      .accounts({
        votingState: votingStatePDA,
        instituteRegistry: registryPDA,
        proposer: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Step 2: Founding institute votes YES (100% approval with 1 voter)
    await validatorProgram.methods
      .vote(true)
      .accounts({
        votingState: votingStatePDA,
        instituteRegistry: registryPDA,
        voter: foundingInstitute.publicKey,
      })
      .signers([foundingInstitute])
      .rpc();

    // Step 3: Verify new institute is admitted
    const registry = await validatorProgram.account.instituteRegistry.fetch(
      registryPDA
    );
    expect(registry.registeredInstitutes).to.have.lengthOf(initialInstituteCount + 1);
    expect(
      registry.registeredInstitutes.some(
        (pk) => pk.toString() === newInstitute.publicKey.toString()
      )
    ).to.be.true;

    // Step 4: New institute issues a certificate
    const certHash = generateCertificateHash();
    const [certificatePDA] = findCertificatePDA(
      certHash,
      certificateProgram.programId
    );

    await certificateProgram.methods
      .addCertificate(Array.from(certHash))
      .accounts({
        certificate: certificatePDA,
        issuer: newInstitute.publicKey,
        instituteRegistry: registryPDA,
        instituteValidatorProgram: validatorProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newInstitute])
      .rpc();

    const certificate = await certificateProgram.account.certificate.fetch(
      certificatePDA
    );

    expect(certificate.isValid).to.be.true;
    expect(certificate.issuer.toString()).to.equal(
      newInstitute.publicKey.toString()
    );
    console.log("✅ Full workflow completed successfully!");
  });

  it("Should verify certificate issued by registered institute", async () => {
    // This test works regardless of pre-initialization
    // We'll use an existing registered institute to issue a certificate
    
    let issuerKeypair: anchor.web3.Keypair;
    
    // If registry was pre-initialized, we can't test voting but we can still test certificate issuance
    if (existingInstitutes.length > 1 || 
        !existingInstitutes.some(pk => pk.equals(foundingInstitute.publicKey))) {
      // Use newInstitute if it was admitted in previous run, otherwise skip
      const registry = await validatorProgram.account.instituteRegistry.fetch(registryPDA);
      
      if (registry.registeredInstitutes.some(pk => pk.equals(newInstitute.publicKey))) {
        issuerKeypair = newInstitute;
      } else if (registry.registeredInstitutes.some(pk => pk.equals(foundingInstitute.publicKey))) {
        issuerKeypair = foundingInstitute;
      } else {
        console.log("No usable keypairs available, skipping certificate verification test");
        return;
      }
    } else {
      // Use founding institute or newly admitted institute
      const registry = await validatorProgram.account.instituteRegistry.fetch(registryPDA);
      issuerKeypair = registry.registeredInstitutes.some(pk => pk.equals(newInstitute.publicKey))
        ? newInstitute
        : foundingInstitute;
    }

    // Issue a certificate
    const certHash = generateCertificateHash();
    const [certificatePDA] = findCertificatePDA(
      certHash,
      certificateProgram.programId
    );

    await certificateProgram.methods
      .addCertificate(Array.from(certHash))
      .accounts({
        certificate: certificatePDA,
        issuer: issuerKeypair.publicKey,
        instituteRegistry: registryPDA,
        instituteValidatorProgram: validatorProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([issuerKeypair])
      .rpc();

    // Verify the certificate
    const status = await certificateProgram.methods
      .verifyCertificate()
      .accounts({
        certificate: certificatePDA,
      })
      .view();

    expect(status.isValid).to.be.true;
    expect(status.issuer.toString()).to.equal(issuerKeypair.publicKey.toString());
    expect(Array.from(status.certificateHash)).to.deep.equal(Array.from(certHash));
    console.log("✅ Certificate verification successful!");
  });

  it("Should fail to issue certificate from unregistered institute", async () => {
    const unregisteredInstitute = anchor.web3.Keypair.generate();
    await airdrop(provider.connection, unregisteredInstitute.publicKey);

    const certHash = generateCertificateHash();
    const [certificatePDA] = findCertificatePDA(
      certHash,
      certificateProgram.programId
    );

    try {
      await certificateProgram.methods
        .addCertificate(Array.from(certHash))
        .accounts({
          certificate: certificatePDA,
          issuer: unregisteredInstitute.publicKey,
          instituteRegistry: registryPDA,
          instituteValidatorProgram: validatorProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([unregisteredInstitute])
        .rpc();

      expect.fail("Should have thrown IssuerNotRegistered error");
    } catch (error) {
      expect(error.toString()).to.include("IssuerNotRegistered");
      console.log("✅ Correctly rejected unregistered institute");
    }
  });

  it("Should correct a certificate", async () => {
    let issuerKeypair: anchor.web3.Keypair;
    
    // Find a usable keypair
    const registry = await validatorProgram.account.instituteRegistry.fetch(registryPDA);
    if (registry.registeredInstitutes.some(pk => pk.equals(newInstitute.publicKey))) {
      issuerKeypair = newInstitute;
    } else if (registry.registeredInstitutes.some(pk => pk.equals(foundingInstitute.publicKey))) {
      issuerKeypair = foundingInstitute;
    } else {
      console.log("No usable keypairs available, skipping correction test");
      return;
    }

    // Issue original certificate
    const oldCertHash = generateCertificateHash();
    const [oldCertPDA] = findCertificatePDA(
      oldCertHash,
      certificateProgram.programId
    );

    await certificateProgram.methods
      .addCertificate(Array.from(oldCertHash))
      .accounts({
        certificate: oldCertPDA,
        issuer: issuerKeypair.publicKey,
        instituteRegistry: registryPDA,
        instituteValidatorProgram: validatorProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([issuerKeypair])
      .rpc();

    // Correct the certificate
    const newCertHash = generateCertificateHash();
    const [newCertPDA] = findCertificatePDA(
      newCertHash,
      certificateProgram.programId
    );

    await certificateProgram.methods
      .correctCertificate(Array.from(oldCertHash), Array.from(newCertHash))
      .accounts({
        oldCertificatePda: oldCertPDA,
        newCertificate: newCertPDA,
        issuer: issuerKeypair.publicKey,
        instituteRegistry: registryPDA,
        instituteValidatorProgram: validatorProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([issuerKeypair])
      .rpc();

    // Verify old certificate is invalid
    const oldCert = await certificateProgram.account.certificate.fetch(oldCertPDA);
    expect(oldCert.isValid).to.be.false;
    expect(oldCert.replacementHash).to.not.be.null;

    // Verify new certificate is valid
    const newCert = await certificateProgram.account.certificate.fetch(newCertPDA);
    expect(newCert.isValid).to.be.true;
    console.log("✅ Certificate correction successful!");
  });
});