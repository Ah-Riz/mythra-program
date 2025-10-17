use anchor_lang::prelude::*;

/// Contribution account tracks individual backer contributions to a campaign
/// 
/// Each contributor gets their own Contribution PDA to track:
/// - How much they contributed
/// - Whether they've claimed refund (if campaign failed)
/// - Their proportional profit share (if campaign succeeded)
#[account]
pub struct Contribution {
    /// The campaign this contribution belongs to
    pub campaign: Pubkey,
    
    /// The wallet that made this contribution
    pub contributor: Pubkey,
    
    /// Amount contributed in lamports
    pub amount: u64,
    
    /// When the contribution was made
    pub contributed_at: i64,
    
    /// Whether this contribution has been refunded (if campaign failed)
    pub refunded: bool,
    
    /// Calculated profit share for this contributor (set during distribution)
    pub profit_share: u64,
    
    /// Whether the contributor has claimed their profit share
    pub profit_claimed: bool,
    
    /// PDA bump seed
    pub bump: u8,
}

impl Contribution {
    /// Calculate space needed for Contribution account
    pub const LEN: usize = 8 + // discriminator
        32 + // campaign
        32 + // contributor
        8 +  // amount
        8 +  // contributed_at
        1 +  // refunded
        8 +  // profit_share
        1 +  // profit_claimed
        1;   // bump
    
    /// Calculate this contributor's voting power (equal to contribution amount for MVP)
    pub fn voting_power(&self) -> u64 {
        self.amount
    }
    
    /// Calculate proportional share of a pool
    /// 
    /// # Arguments
    /// * `pool_amount` - Total amount to be distributed
    /// * `total_raised` - Total amount raised in the campaign
    /// 
    /// # Returns
    /// This contributor's proportional share of the pool
    pub fn calculate_share(&self, pool_amount: u64, total_raised: u64) -> u64 {
        if total_raised == 0 {
            return 0;
        }
        
        // Calculate: (contribution / total_raised) * pool_amount
        // Use u128 to prevent overflow during calculation
        let contribution = self.amount as u128;
        let total = total_raised as u128;
        let pool = pool_amount as u128;
        
        let share = (contribution * pool) / total;
        
        // Safe to cast back to u64 since share <= pool_amount
        share as u64
    }
    
    /// Check if this contribution can be refunded
    pub fn can_refund(&self) -> bool {
        !self.refunded
    }
    
    /// Check if profit can be claimed
    pub fn can_claim_profit(&self) -> bool {
        !self.profit_claimed && self.profit_share > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_contribution_len() {
        // Verify our LEN calculation is correct
        assert!(Contribution::LEN >= 99);
    }
    
    #[test]
    fn test_voting_power() {
        let contribution = Contribution {
            campaign: Pubkey::default(),
            contributor: Pubkey::default(),
            amount: 10_000_000_000, // 10 SOL
            contributed_at: 0,
            refunded: false,
            profit_share: 0,
            profit_claimed: false,
            bump: 0,
        };
        
        // Voting power equals contribution amount in MVP
        assert_eq!(contribution.voting_power(), 10_000_000_000);
    }
    
    #[test]
    fn test_calculate_share() {
        let contribution = Contribution {
            campaign: Pubkey::default(),
            contributor: Pubkey::default(),
            amount: 10_000_000_000, // 10 SOL contribution
            contributed_at: 0,
            refunded: false,
            profit_share: 0,
            profit_claimed: false,
            bump: 0,
        };
        
        // Campaign raised 100 SOL total, profit pool is 50 SOL
        let total_raised = 100_000_000_000;
        let pool_amount = 50_000_000_000;
        
        // This contributor should get 10% of the pool (5 SOL)
        let share = contribution.calculate_share(pool_amount, total_raised);
        assert_eq!(share, 5_000_000_000);
    }
    
    #[test]
    fn test_calculate_share_proportional() {
        // Test with different contribution amounts
        let contributions = vec![
            (10_000_000_000, 100_000_000_000, 50_000_000_000), // 10 SOL of 100 SOL → 5 SOL
            (25_000_000_000, 100_000_000_000, 50_000_000_000), // 25 SOL of 100 SOL → 12.5 SOL
            (50_000_000_000, 100_000_000_000, 50_000_000_000), // 50 SOL of 100 SOL → 25 SOL
        ];
        
        for (amount, total, pool) in contributions {
            let contribution = Contribution {
                campaign: Pubkey::default(),
                contributor: Pubkey::default(),
                amount,
                contributed_at: 0,
                refunded: false,
                profit_share: 0,
                profit_claimed: false,
                bump: 0,
            };
            
            let share = contribution.calculate_share(pool, total);
            let expected = (amount as u128 * pool as u128 / total as u128) as u64;
            assert_eq!(share, expected);
        }
    }
    
    #[test]
    fn test_calculate_share_edge_cases() {
        let contribution = Contribution {
            campaign: Pubkey::default(),
            contributor: Pubkey::default(),
            amount: 10_000_000_000,
            contributed_at: 0,
            refunded: false,
            profit_share: 0,
            profit_claimed: false,
            bump: 0,
        };
        
        // Zero total raised should return 0
        assert_eq!(contribution.calculate_share(50_000_000_000, 0), 0);
        
        // Zero pool should return 0
        assert_eq!(contribution.calculate_share(0, 100_000_000_000), 0);
        
        // Contributor contributed 100% should get 100% of pool
        assert_eq!(
            contribution.calculate_share(50_000_000_000, 10_000_000_000),
            50_000_000_000
        );
    }
    
    #[test]
    fn test_can_refund() {
        let mut contribution = Contribution {
            campaign: Pubkey::default(),
            contributor: Pubkey::default(),
            amount: 10_000_000_000,
            contributed_at: 0,
            refunded: false,
            profit_share: 0,
            profit_claimed: false,
            bump: 0,
        };
        
        assert!(contribution.can_refund());
        
        contribution.refunded = true;
        assert!(!contribution.can_refund());
    }
    
    #[test]
    fn test_can_claim_profit() {
        let mut contribution = Contribution {
            campaign: Pubkey::default(),
            contributor: Pubkey::default(),
            amount: 10_000_000_000,
            contributed_at: 0,
            refunded: false,
            profit_share: 5_000_000_000,
            profit_claimed: false,
            bump: 0,
        };
        
        assert!(contribution.can_claim_profit());
        
        contribution.profit_claimed = true;
        assert!(!contribution.can_claim_profit());
        
        // Cannot claim if no profit share
        contribution.profit_claimed = false;
        contribution.profit_share = 0;
        assert!(!contribution.can_claim_profit());
    }
}
