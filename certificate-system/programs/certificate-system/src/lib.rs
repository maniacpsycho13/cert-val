use anchor_lang::prelude::*;

declare_id!("BkxAccdVywyovJuU5RqdR1jHpWT7z6wfgZc9akEdSpqE");

#[program]
pub mod certificate_system {
    use super::*;

    /// Adds a new certificate to the registry
    /// Validates that the issuer exists in the InstituteRegistry
    pub fn add_certificate(
        ctx: Context<AddCertificate>,
        certificate_hash: [u8; 32],
    ) -> Result<()> {
        let certificate = &mut ctx.accounts.certificate;
        let issuer = ctx.accounts.issuer.key();

        // Verify the institute_registry PDA
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"institute_registry"],
            ctx.accounts.institute_validator_program.key,
        );
        require!(
            ctx.accounts.institute_registry.key() == expected_pda,
            CertificateError::InvalidInstituteRegistry
        );

        // Verify the account is owned by the institute_validator_program
        require!(
            ctx.accounts.institute_registry.owner == ctx.accounts.institute_validator_program.key,
            CertificateError::InvalidInstituteRegistry
        );

        // Deserialize and validate the InstituteRegistry account
        let institute_registry = InstituteRegistry::try_deserialize(
            &mut &ctx.accounts.institute_registry.data.borrow()[..]
        )?;

        // Validate that the issuer exists in the InstituteRegistry
        require!(
            institute_registry.is_institute_registered(&issuer),
            CertificateError::IssuerNotRegistered
        );

        // Initialize certificate data
        certificate.certificate_hash = certificate_hash;
        certificate.issuer = issuer;
        certificate.is_valid = true;
        certificate.issued_at = Clock::get()?.unix_timestamp;
        certificate.bump = ctx.bumps.certificate;

        emit!(CertificateAdded {
            certificate_hash,
            issuer,
            timestamp: certificate.issued_at,
        });

        Ok(())
    }

    /// Corrects an existing certificate by marking it invalid and creating a new one
    pub fn correct_certificate(
        ctx: Context<CorrectCertificate>,
        old_hash: [u8; 32],
        new_hash: [u8; 32],
    ) -> Result<()> {
        let old_certificate = &mut ctx.accounts.old_certificate_pda;
        let new_certificate = &mut ctx.accounts.new_certificate;
        let issuer = ctx.accounts.issuer.key();

        // Verify the old certificate belongs to this issuer
        require!(
            old_certificate.issuer == issuer,
            CertificateError::UnauthorizedIssuer
        );

        // Verify old hash matches
        require!(
            old_certificate.certificate_hash == old_hash,
            CertificateError::InvalidCertificateHash
        );

        // Verify the institute_registry PDA
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"institute_registry"],
            ctx.accounts.institute_validator_program.key,
        );
        require!(
            ctx.accounts.institute_registry.key() == expected_pda,
            CertificateError::InvalidInstituteRegistry
        );

        // Verify the account is owned by the institute_validator_program
        require!(
            ctx.accounts.institute_registry.owner == ctx.accounts.institute_validator_program.key,
            CertificateError::InvalidInstituteRegistry
        );

        // Deserialize and validate the InstituteRegistry account
        let institute_registry = InstituteRegistry::try_deserialize(
            &mut &ctx.accounts.institute_registry.data.borrow()[..]
        )?;

        // Validate that the issuer is still registered
        require!(
            institute_registry.is_institute_registered(&issuer),
            CertificateError::IssuerNotRegistered
        );

        // Mark old certificate as invalid
        old_certificate.is_valid = false;
        old_certificate.corrected_at = Some(Clock::get()?.unix_timestamp);
        old_certificate.replacement_hash = Some(new_hash);

        // Initialize new certificate
        new_certificate.certificate_hash = new_hash;
        new_certificate.issuer = issuer;
        new_certificate.is_valid = true;
        new_certificate.issued_at = Clock::get()?.unix_timestamp;
        new_certificate.corrected_at = None;
        new_certificate.replacement_hash = None;
        new_certificate.bump = ctx.bumps.new_certificate;

        emit!(CertificateCorrected {
            old_hash,
            new_hash,
            issuer,
            timestamp: new_certificate.issued_at,
        });

        Ok(())
    }

    /// View function to verify certificate status
    /// This is primarily for demonstration; clients typically read PDA directly via RPC
    pub fn verify_certificate(ctx: Context<VerifyCertificate>) -> Result<CertificateStatus> {
        let certificate = &ctx.accounts.certificate;

        Ok(CertificateStatus {
            certificate_hash: certificate.certificate_hash,
            issuer: certificate.issuer,
            is_valid: certificate.is_valid,
            issued_at: certificate.issued_at,
            corrected_at: certificate.corrected_at,
            replacement_hash: certificate.replacement_hash,
        })
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
pub struct Certificate {
    /// SHA-256 hash of the certificate
    pub certificate_hash: [u8; 32],
    /// Public key of the issuing institute
    pub issuer: Pubkey,
    /// Validity status of the certificate
    pub is_valid: bool,
    /// Timestamp when certificate was issued
    pub issued_at: i64,
    /// Timestamp when certificate was corrected (if applicable)
    pub corrected_at: Option<i64>,
    /// Replacement certificate hash (if corrected)
    pub replacement_hash: Option<[u8; 32]>,
    /// PDA bump seed
    pub bump: u8,
}

impl Certificate {
    pub const LEN: usize = 8 + // discriminator
        32 + // certificate_hash
        32 + // issuer
        1 + // is_valid
        8 + // issued_at
        1 + 8 + // corrected_at (Option)
        1 + 32 + // replacement_hash (Option)
        1; // bump
}

/// InstituteRegistry account (owned by InstituteValidator program)
/// This is a cross-program account read for validation
#[account]
pub struct InstituteRegistry {
    /// List of registered institute public keys
    pub registered_institutes: Vec<Pubkey>,
    /// Authority that can modify the registry
    pub authority: Pubkey,
    /// Bump seed for PDA
    pub bump: u8,
}

impl InstituteRegistry {
    /// Check if an institute is registered
    pub fn is_institute_registered(&self, institute: &Pubkey) -> bool {
        self.registered_institutes.contains(institute)
    }
}

// ============================================================================
// Context Structures
// ============================================================================

#[derive(Accounts)]
#[instruction(certificate_hash: [u8; 32])]
pub struct AddCertificate<'info> {
    #[account(
        init,
        payer = issuer,
        space = Certificate::LEN,
        seeds = [b"certificate", certificate_hash.as_ref()],
        bump
    )]
    pub certificate: Account<'info, Certificate>,

    /// Institute issuing the certificate (must be signer)
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// InstituteValidator program
    /// CHECK: Program ID validation happens in instruction logic
    pub institute_validator_program: AccountInfo<'info>,

    /// InstituteRegistry PDA from InstituteValidator program
    /// CHECK: PDA validation happens in instruction logic
    pub institute_registry: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(old_hash: [u8; 32], new_hash: [u8; 32])]
pub struct CorrectCertificate<'info> {
    #[account(
        mut,
        seeds = [b"certificate", old_hash.as_ref()],
        bump = old_certificate_pda.bump,
        constraint = old_certificate_pda.is_valid == true @ CertificateError::CertificateAlreadyInvalid
    )]
    pub old_certificate_pda: Account<'info, Certificate>,

    #[account(
        init,
        payer = issuer,
        space = Certificate::LEN,
        seeds = [b"certificate", new_hash.as_ref()],
        bump
    )]
    pub new_certificate: Account<'info, Certificate>,

    /// Institute correcting the certificate (must be signer and original issuer)
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// InstituteValidator program
    /// CHECK: Program ID validation happens in instruction logic
    pub institute_validator_program: AccountInfo<'info>,

    /// InstituteRegistry PDA from InstituteValidator program
    /// CHECK: PDA validation happens in instruction logic
    pub institute_registry: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyCertificate<'info> {
    /// Certificate to verify
    pub certificate: Account<'info, Certificate>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct CertificateAdded {
    pub certificate_hash: [u8; 32],
    pub issuer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CertificateCorrected {
    pub old_hash: [u8; 32],
    pub new_hash: [u8; 32],
    pub issuer: Pubkey,
    pub timestamp: i64,
}

// ============================================================================
// Return Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CertificateStatus {
    pub certificate_hash: [u8; 32],
    pub issuer: Pubkey,
    pub is_valid: bool,
    pub issued_at: i64,
    pub corrected_at: Option<i64>,
    pub replacement_hash: Option<[u8; 32]>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum CertificateError {
    #[msg("Issuer is not registered in the InstituteRegistry")]
    IssuerNotRegistered,

    #[msg("Unauthorized issuer attempting to modify certificate")]
    UnauthorizedIssuer,

    #[msg("Invalid certificate hash provided")]
    InvalidCertificateHash,

    #[msg("Certificate is already marked as invalid")]
    CertificateAlreadyInvalid,

    #[msg("Invalid InstituteRegistry account")]
    InvalidInstituteRegistry,
}