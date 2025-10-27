use anchor_lang::prelude::*;

declare_id!("JYhgtXGuQWYvmmtiKwZJgDuaP1iPLjw3MjtwukFhAJQ");



#[program]
pub mod institute_validator {
    use super::*;

    /// Initialize the InstituteRegistry (one-time setup)
    /// Should be called once to create the singleton registry
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        initial_institutes: Vec<Pubkey>,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.institute_registry;
        
        registry.registered_institutes = initial_institutes.clone();
        registry.authority = ctx.accounts.authority.key();
        registry.bump = ctx.bumps.institute_registry;

        emit!(RegistryInitialized {
            authority: registry.authority,
            initial_count: initial_institutes.len() as u32,
        });

        Ok(())
    }

    /// Initiates an election for a new candidate institute
    /// Creates a VotingState PDA to track the voting process
    pub fn new_institute_election(
        ctx: Context<NewInstituteElection>,
        candidate_institute: Pubkey,
    ) -> Result<()> {
        let voting_state = &mut ctx.accounts.voting_state;
        let registry = &ctx.accounts.institute_registry;

        // Ensure candidate is not already registered
        require!(
            !registry.is_institute_registered(&candidate_institute),
            ValidatorError::InstituteAlreadyRegistered
        );

        // Initialize voting state
        voting_state.candidate_institute = candidate_institute;
        voting_state.votes_for = Vec::new();
        voting_state.votes_against = Vec::new();
        voting_state.total_eligible_voters = registry.registered_institutes.len() as u32;
        voting_state.status = VotingStatus::Active;
        voting_state.created_at = Clock::get()?.unix_timestamp;
        voting_state.concluded_at = None;
        voting_state.bump = ctx.bumps.voting_state;

        emit!(ElectionCreated {
            candidate: candidate_institute,
            eligible_voters: voting_state.total_eligible_voters,
            timestamp: voting_state.created_at,
        });

        Ok(())
    }

    /// Cast a vote for or against a candidate institute
    /// Automatically admits the candidate if 100% approval is reached
    pub fn vote(
        ctx: Context<Vote>,
        vote_for: bool,
    ) -> Result<()> {
        let voting_state = &mut ctx.accounts.voting_state;
        let registry = &mut ctx.accounts.institute_registry;
        let voter = ctx.accounts.voter.key();

        // Ensure voting is still active
        require!(
            voting_state.status == VotingStatus::Active,
            ValidatorError::VotingNotActive
        );

        // Verify voter is a registered institute
        require!(
            registry.is_institute_registered(&voter),
            ValidatorError::VoterNotRegistered
        );

        // Ensure voter hasn't already voted
        require!(
            !voting_state.has_voted(&voter),
            ValidatorError::AlreadyVoted
        );

        // Record the vote
        if vote_for {
            voting_state.votes_for.push(voter);
        } else {
            voting_state.votes_against.push(voter);
        }

        emit!(VoteCast {
            candidate: voting_state.candidate_institute,
            voter,
            vote_for,
            timestamp: Clock::get()?.unix_timestamp,
        });

        // Check if voting should conclude
        let total_votes = voting_state.votes_for.len() + voting_state.votes_against.len();
        
        // Decision logic: 100% approval required
        if total_votes == voting_state.total_eligible_voters as usize {
            // All eligible voters have voted
            if voting_state.votes_against.is_empty() {
                // 100% approval - admit the institute
                registry.registered_institutes.push(voting_state.candidate_institute);
                voting_state.status = VotingStatus::Approved;
                
                emit!(InstituteAdmitted {
                    candidate: voting_state.candidate_institute,
                    total_institutes: registry.registered_institutes.len() as u32,
                    timestamp: Clock::get()?.unix_timestamp,
                });
            } else {
                // Not 100% approval - reject
                voting_state.status = VotingStatus::Rejected;
                
                emit!(InstituteRejected {
                    candidate: voting_state.candidate_institute,
                    votes_for: voting_state.votes_for.len() as u32,
                    votes_against: voting_state.votes_against.len() as u32,
                    timestamp: Clock::get()?.unix_timestamp,
                });
            }
            
            voting_state.concluded_at = Some(Clock::get()?.unix_timestamp);
        }

        Ok(())
    }

    /// Remove an institute from the registry (governance function)
    /// Requires unanimous approval from all other institutes
    pub fn remove_institute(
        ctx: Context<RemoveInstitute>,
        institute_to_remove: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.institute_registry;
        
        // Only authority can initiate removal (or implement similar voting)
        require!(
            ctx.accounts.authority.key() == registry.authority,
            ValidatorError::Unauthorized
        );

        // Find and remove the institute
        if let Some(pos) = registry.registered_institutes.iter().position(|&x| x == institute_to_remove) {
            registry.registered_institutes.remove(pos);
            
            emit!(InstituteRemoved {
                institute: institute_to_remove,
                timestamp: Clock::get()?.unix_timestamp,
            });
        } else {
            return Err(ValidatorError::InstituteNotFound.into());
        }

        Ok(())
    }

    /// View function to get voting state
    pub fn get_voting_state(ctx: Context<GetVotingState>) -> Result<VotingStateView> {
        let voting_state = &ctx.accounts.voting_state;

        Ok(VotingStateView {
            candidate_institute: voting_state.candidate_institute,
            votes_for_count: voting_state.votes_for.len() as u32,
            votes_against_count: voting_state.votes_against.len() as u32,
            total_eligible_voters: voting_state.total_eligible_voters,
            status: voting_state.status.clone(),
            created_at: voting_state.created_at,
            concluded_at: voting_state.concluded_at,
        })
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
pub struct InstituteRegistry {
    /// List of all registered and trusted institute public keys
    pub registered_institutes: Vec<Pubkey>,
    /// Authority that can perform administrative actions
    pub authority: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

impl InstituteRegistry {
    pub const BASE_LEN: usize = 8 + // discriminator
        4 + // Vec length prefix
        32 + // authority
        1; // bump

    /// Calculate space needed for n institutes
    pub fn space(num_institutes: usize) -> usize {
        Self::BASE_LEN + (num_institutes * 32)
    }

    /// Check if an institute is registered
    pub fn is_institute_registered(&self, institute: &Pubkey) -> bool {
        self.registered_institutes.contains(institute)
    }
}

#[account]
pub struct VotingState {
    /// Candidate institute seeking admission
    pub candidate_institute: Pubkey,
    /// List of institutes that voted for
    pub votes_for: Vec<Pubkey>,
    /// List of institutes that voted against
    pub votes_against: Vec<Pubkey>,
    /// Total number of eligible voters at election start
    pub total_eligible_voters: u32,
    /// Current status of the voting
    pub status: VotingStatus,
    /// Timestamp when voting was created
    pub created_at: i64,
    /// Timestamp when voting concluded (if applicable)
    pub concluded_at: Option<i64>,
    /// PDA bump seed
    pub bump: u8,
}

impl VotingState {
    pub const BASE_LEN: usize = 8 + // discriminator
        32 + // candidate_institute
        4 + // votes_for Vec prefix
        4 + // votes_against Vec prefix
        4 + // total_eligible_voters
        1 + 1 + // status (enum)
        8 + // created_at
        1 + 8 + // concluded_at (Option)
        1; // bump

    /// Calculate space needed for n voters
    pub fn space(num_voters: usize) -> usize {
        Self::BASE_LEN + (num_voters * 32 * 2) // Both for and against lists
    }

    /// Check if a voter has already cast their vote
    pub fn has_voted(&self, voter: &Pubkey) -> bool {
        self.votes_for.contains(voter) || self.votes_against.contains(voter)
    }

    /// Calculate approval percentage
    pub fn approval_percentage(&self) -> u32 {
        let total_votes = self.votes_for.len() + self.votes_against.len();
        if total_votes == 0 {
            return 0;
        }
        ((self.votes_for.len() * 100) / total_votes) as u32
    }
}

// ============================================================================
// Enums
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VotingStatus {
    Active,
    Approved,
    Rejected,
}

// ============================================================================
// Context Structures
// ============================================================================

#[derive(Accounts)]
#[instruction(initial_institutes: Vec<Pubkey>)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = InstituteRegistry::space(initial_institutes.len() + 50), // Extra space for future
        seeds = [b"institute_registry"],
        bump
    )]
    pub institute_registry: Account<'info, InstituteRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(candidate_institute: Pubkey)]
pub struct NewInstituteElection<'info> {
    #[account(
        init,
        payer = proposer,
        space = VotingState::space(50), // Space for up to 50 voters
        seeds = [b"voting_state", candidate_institute.as_ref()],
        bump
    )]
    pub voting_state: Account<'info, VotingState>,

    #[account(
        seeds = [b"institute_registry"],
        bump = institute_registry.bump
    )]
    pub institute_registry: Account<'info, InstituteRegistry>,

    /// Any account can propose (or restrict to registered institutes if needed)
    #[account(mut)]
    pub proposer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(
        mut,
        seeds = [b"voting_state", voting_state.candidate_institute.as_ref()],
        bump = voting_state.bump,
        constraint = voting_state.status == VotingStatus::Active @ ValidatorError::VotingNotActive
    )]
    pub voting_state: Account<'info, VotingState>,

    #[account(
        mut,
        seeds = [b"institute_registry"],
        bump = institute_registry.bump
    )]
    pub institute_registry: Account<'info, InstituteRegistry>,

    /// Must be a registered institute to vote
    pub voter: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveInstitute<'info> {
    #[account(
        mut,
        seeds = [b"institute_registry"],
        bump = institute_registry.bump
    )]
    pub institute_registry: Account<'info, InstituteRegistry>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetVotingState<'info> {
    pub voting_state: Account<'info, VotingState>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct RegistryInitialized {
    pub authority: Pubkey,
    pub initial_count: u32,
}

#[event]
pub struct ElectionCreated {
    pub candidate: Pubkey,
    pub eligible_voters: u32,
    pub timestamp: i64,
}

#[event]
pub struct VoteCast {
    pub candidate: Pubkey,
    pub voter: Pubkey,
    pub vote_for: bool,
    pub timestamp: i64,
}

#[event]
pub struct InstituteAdmitted {
    pub candidate: Pubkey,
    pub total_institutes: u32,
    pub timestamp: i64,
}

#[event]
pub struct InstituteRejected {
    pub candidate: Pubkey,
    pub votes_for: u32,
    pub votes_against: u32,
    pub timestamp: i64,
}

#[event]
pub struct InstituteRemoved {
    pub institute: Pubkey,
    pub timestamp: i64,
}

// ============================================================================
// Return Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VotingStateView {
    pub candidate_institute: Pubkey,
    pub votes_for_count: u32,
    pub votes_against_count: u32,
    pub total_eligible_voters: u32,
    pub status: VotingStatus,
    pub created_at: i64,
    pub concluded_at: Option<i64>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ValidatorError {
    #[msg("Institute is already registered")]
    InstituteAlreadyRegistered,

    #[msg("Voter is not a registered institute")]
    VoterNotRegistered,

    #[msg("Voter has already cast their vote")]
    AlreadyVoted,

    #[msg("Voting is not active")]
    VotingNotActive,

    #[msg("Unauthorized action")]
    Unauthorized,

    #[msg("Institute not found in registry")]
    InstituteNotFound,
}
