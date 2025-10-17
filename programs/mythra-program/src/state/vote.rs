use anchor_lang::prelude::*;

/// Vote record for budget approval
/// 
/// Each backer can vote once on a budget. Their voting power
/// is equal to their contribution amount (linear voting for MVP).
#[account]
pub struct BudgetVote {
    /// The budget being voted on
    pub budget: Pubkey,
    
    /// The voter (must be a contributor to the campaign)
    pub voter: Pubkey,
    
    /// Voter's contribution amount (determines voting power)
    pub contribution_amount: u64,
    
    /// Vote choice: true = approve, false = reject
    pub approve: bool,
    
    /// When the vote was cast
    pub voted_at: i64,
    
    /// PDA bump
    pub bump: u8,
}

impl BudgetVote {
    /// Calculate space needed for BudgetVote account
    pub const LEN: usize = 8 + // discriminator
        32 + // budget
        32 + // voter
        8 +  // contribution_amount
        1 +  // approve
        8 +  // voted_at
        1;   // bump
    
    /// Get voting power (equal to contribution amount for MVP)
    pub fn voting_power(&self) -> u64 {
        self.contribution_amount
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_voting_power() {
        let vote = BudgetVote {
            budget: Pubkey::default(),
            voter: Pubkey::default(),
            contribution_amount: 10_000_000_000, // 10 SOL
            approve: true,
            voted_at: 0,
            bump: 0,
        };
        
        // Voting power equals contribution amount in MVP
        assert_eq!(vote.voting_power(), 10_000_000_000);
    }
}
