use anchor_lang::prelude::*;

/// Budget account for campaign expense management
/// 
/// Organizers submit a budget with 3 fixed milestones that shows
/// how they plan to spend the crowdfunding money. Backers vote to
/// approve or reject the budget.
#[account]
pub struct Budget {
    /// The campaign this budget belongs to
    pub campaign: Pubkey,
    
    /// Total budget amount (should not exceed campaign.total_raised)
    pub total_amount: u64,
    
    /// Description of budget (max 200 chars)
    pub description: String,
    
    /// Fixed 3 milestones for MVP
    pub milestones: [Milestone; 3],
    
    /// Current status
    pub status: BudgetStatus,
    
    /// When voting ends (time-limited!)
    pub voting_end: i64,
    
    /// Sum of contribution amounts voting YES
    pub votes_for: u64,
    
    /// Sum of contribution amounts voting NO
    pub votes_against: u64,
    
    /// Number of revisions (max 2)
    pub revision_count: u8,
    
    /// When budget was created
    pub created_at: i64,
    
    /// PDA bump
    pub bump: u8,
}

impl Budget {
    /// Calculate space needed for Budget account
    /// 3 milestones with 100 char descriptions each
    pub const MAX_DESCRIPTION_LEN: usize = 200;
    pub const MAX_MILESTONE_DESC_LEN: usize = 100;
    
    pub const LEN: usize = 8 + // discriminator
        32 + // campaign
        8 +  // total_amount
        4 + Self::MAX_DESCRIPTION_LEN + // description (String)
        (Milestone::LEN * 3) + // milestones array
        1 +  // status (enum)
        8 +  // voting_end
        8 +  // votes_for
        8 +  // votes_against
        1 +  // revision_count
        8 +  // created_at
        1;   // bump
    
    /// Check if voting period has ended
    pub fn voting_ended(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.voting_end
    }
    
    /// Check if budget is approved based on votes
    pub fn is_approved(&self) -> bool {
        self.votes_for > self.votes_against && self.votes_for > 0
    }
    
    /// Check if can be revised (rejected and under revision limit)
    pub fn can_revise(&self) -> bool {
        self.status == BudgetStatus::Rejected && self.revision_count < 2
    }
    
    /// Calculate total milestone percentages (should equal 10000 = 100%)
    pub fn validate_milestone_percentages(&self) -> bool {
        let total: u16 = self.milestones.iter().map(|m| m.release_percentage).sum();
        total == 10_000
    }
}

/// Individual milestone in the budget
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Milestone {
    /// Description of this milestone (e.g., "Venue deposit")
    pub description: String,
    
    /// Percentage of budget to release (in basis points, e.g., 5000 = 50%)
    pub release_percentage: u16,
    
    /// When this milestone can be unlocked (relative to event)
    /// Negative = days before event, Positive = days after event
    pub unlock_date: i64,
    
    /// Whether funds have been released
    pub released: bool,
    
    /// Actual amount released (calculated from percentage)
    pub released_amount: u64,
}

impl Milestone {
    pub const LEN: usize = 
        4 + Budget::MAX_MILESTONE_DESC_LEN + // description
        2 +  // release_percentage
        8 +  // unlock_date
        1 +  // released
        8;   // released_amount
    
    /// Check if milestone is ready to be released
    pub fn is_unlocked(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.unlock_date && !self.released
    }
}

/// Budget lifecycle status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum BudgetStatus {
    /// Submitted, waiting for votes
    Pending,
    
    /// Approved by backers, ready for milestone releases
    Approved,
    
    /// Rejected by backers, can be revised
    Rejected,
    
    /// All milestones released, budget complete
    Executed,
}

impl Default for BudgetStatus {
    fn default() -> Self {
        BudgetStatus::Pending
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_milestone_percentages() {
        let budget = Budget {
            campaign: Pubkey::default(),
            total_amount: 100_000_000_000,
            description: "Test budget".to_string(),
            milestones: [
                Milestone {
                    description: "M1".to_string(),
                    release_percentage: 5000, // 50%
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
                Milestone {
                    description: "M2".to_string(),
                    release_percentage: 3000, // 30%
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
                Milestone {
                    description: "M3".to_string(),
                    release_percentage: 2000, // 20%
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
            ],
            status: BudgetStatus::Pending,
            voting_end: 0,
            votes_for: 0,
            votes_against: 0,
            revision_count: 0,
            created_at: 0,
            bump: 0,
        };
        
        assert!(budget.validate_milestone_percentages());
    }
    
    #[test]
    fn test_voting_approval() {
        let mut budget = Budget {
            campaign: Pubkey::default(),
            total_amount: 0,
            description: String::new(),
            milestones: [
                Milestone {
                    description: String::new(),
                    release_percentage: 3333,
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
                Milestone {
                    description: String::new(),
                    release_percentage: 3333,
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
                Milestone {
                    description: String::new(),
                    release_percentage: 3334,
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
            ],
            status: BudgetStatus::Pending,
            voting_end: 1000,
            votes_for: 60_000_000_000,
            votes_against: 40_000_000_000,
            revision_count: 0,
            created_at: 0,
            bump: 0,
        };
        
        assert!(budget.is_approved());
        
        budget.votes_for = 40_000_000_000;
        budget.votes_against = 60_000_000_000;
        assert!(!budget.is_approved());
    }
    
    #[test]
    fn test_can_revise() {
        let mut budget = Budget {
            campaign: Pubkey::default(),
            total_amount: 0,
            description: String::new(),
            milestones: [
                Milestone {
                    description: String::new(),
                    release_percentage: 3333,
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
                Milestone {
                    description: String::new(),
                    release_percentage: 3333,
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
                Milestone {
                    description: String::new(),
                    release_percentage: 3334,
                    unlock_date: 0,
                    released: false,
                    released_amount: 0,
                },
            ],
            status: BudgetStatus::Rejected,
            voting_end: 0,
            votes_for: 0,
            votes_against: 0,
            revision_count: 0,
            created_at: 0,
            bump: 0,
        };
        
        assert!(budget.can_revise());
        
        budget.revision_count = 2;
        assert!(!budget.can_revise());
        
        budget.revision_count = 0;
        budget.status = BudgetStatus::Approved;
        assert!(!budget.can_revise());
    }
}
