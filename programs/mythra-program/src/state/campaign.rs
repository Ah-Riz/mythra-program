use anchor_lang::prelude::*;

/// Campaign account for crowdfunding events
/// 
/// A campaign is created by an event organizer to crowdfund an event.
/// Backers contribute SOL which is held in escrow until the funding goal is reached.
/// If the goal is not reached by the deadline, backers can claim refunds.
#[account]
pub struct Campaign {
    /// The event this campaign is funding
    pub event: Pubkey,
    
    /// The organizer who created this campaign (must match event.authority)
    pub organizer: Pubkey,
    
    /// Funding goal in lamports
    pub funding_goal: u64,
    
    /// Total amount raised so far in lamports
    pub total_raised: u64,
    
    /// Deadline timestamp (Unix timestamp)
    /// Campaign must reach goal by this time or it fails
    pub deadline: i64,
    
    /// Current status of the campaign
    pub status: CampaignStatus,
    
    /// Number of unique contributors
    pub total_contributors: u32,
    
    /// When the campaign was created
    pub created_at: i64,
    
    /// Total approved expenses from budget
    pub total_expenses: u64,
    
    /// Total revenue from ticket sales
    pub total_revenue: u64,
    
    /// Calculated profit pool for backers (60% of profit)
    pub backer_pool: u64,
    
    /// Calculated profit pool for organizer (35-40% of profit)
    pub organizer_pool: u64,
    
    /// Platform fee pool (5% of profit)
    pub platform_pool: u64,
    
    /// Whether profit distribution has been calculated
    pub distribution_complete: bool,
    
    /// Whether organizer has claimed their profit share
    pub organizer_claimed: bool,
    
    /// PDA bump seed
    pub bump: u8,
}

impl Campaign {
    /// Calculate space needed for Campaign account
    pub const LEN: usize = 8 + // discriminator
        32 + // event
        32 + // organizer
        8 +  // funding_goal
        8 +  // total_raised
        8 +  // deadline
        1 +  // status (enum)
        4 +  // total_contributors
        8 +  // created_at
        8 +  // total_expenses
        8 +  // total_revenue
        8 +  // backer_pool
        8 +  // organizer_pool
        8 +  // platform_pool
        1 +  // distribution_complete
        1 +  // organizer_claimed
        1;   // bump
    
    /// Check if campaign is still accepting contributions
    pub fn is_active(&self) -> bool {
        self.status == CampaignStatus::Pending
    }
    
    /// Check if campaign has reached its funding goal
    pub fn goal_reached(&self) -> bool {
        self.total_raised >= self.funding_goal
    }
    
    /// Check if deadline has passed
    pub fn deadline_passed(&self, current_timestamp: i64) -> bool {
        current_timestamp > self.deadline
    }
    
    /// Check if campaign can be finalized
    pub fn can_finalize(&self, current_timestamp: i64) -> bool {
        self.status == CampaignStatus::Pending && 
        (self.goal_reached() || self.deadline_passed(current_timestamp))
    }
    
    /// Check if refunds are available
    pub fn refunds_available(&self) -> bool {
        self.status == CampaignStatus::Failed
    }
    
    /// Check if profit distribution can be calculated
    pub fn can_distribute(&self, event_ended: bool) -> bool {
        self.status == CampaignStatus::Funded && 
        event_ended && 
        !self.distribution_complete
    }
}

/// Campaign status lifecycle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum CampaignStatus {
    /// Campaign is active and accepting contributions
    Pending,
    
    /// Campaign reached its goal, event can proceed
    Funded,
    
    /// Campaign failed to reach goal by deadline, refunds available
    Failed,
    
    /// Event completed and profits distributed
    Completed,
}

impl Default for CampaignStatus {
    fn default() -> Self {
        CampaignStatus::Pending
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_campaign_len() {
        // Verify our LEN calculation is correct
        assert!(Campaign::LEN >= 200);
    }
    
    #[test]
    fn test_goal_reached() {
        let mut campaign = Campaign {
            event: Pubkey::default(),
            organizer: Pubkey::default(),
            funding_goal: 100_000_000_000, // 100 SOL
            total_raised: 120_000_000_000,  // 120 SOL
            deadline: 0,
            status: CampaignStatus::Pending,
            total_contributors: 0,
            created_at: 0,
            total_expenses: 0,
            total_revenue: 0,
            backer_pool: 0,
            organizer_pool: 0,
            platform_pool: 0,
            distribution_complete: false,
            organizer_claimed: false,
            bump: 0,
        };
        
        assert!(campaign.goal_reached());
        
        campaign.total_raised = 50_000_000_000; // 50 SOL
        assert!(!campaign.goal_reached());
    }
    
    #[test]
    fn test_deadline_passed() {
        let campaign = Campaign {
            event: Pubkey::default(),
            organizer: Pubkey::default(),
            funding_goal: 100_000_000_000,
            total_raised: 0,
            deadline: 1000,
            status: CampaignStatus::Pending,
            total_contributors: 0,
            created_at: 0,
            total_expenses: 0,
            total_revenue: 0,
            backer_pool: 0,
            organizer_pool: 0,
            platform_pool: 0,
            distribution_complete: false,
            organizer_claimed: false,
            bump: 0,
        };
        
        assert!(!campaign.deadline_passed(500));
        assert!(campaign.deadline_passed(1001));
    }
    
    #[test]
    fn test_can_finalize() {
        let mut campaign = Campaign {
            event: Pubkey::default(),
            organizer: Pubkey::default(),
            funding_goal: 100_000_000_000,
            total_raised: 120_000_000_000,
            deadline: 1000,
            status: CampaignStatus::Pending,
            total_contributors: 0,
            created_at: 0,
            total_expenses: 0,
            total_revenue: 0,
            backer_pool: 0,
            organizer_pool: 0,
            platform_pool: 0,
            distribution_complete: false,
            organizer_claimed: false,
            bump: 0,
        };
        
        // Can finalize if goal reached (even before deadline)
        assert!(campaign.can_finalize(500));
        
        // Can finalize if deadline passed (even if goal not reached)
        campaign.total_raised = 50_000_000_000;
        assert!(campaign.can_finalize(1001));
        
        // Cannot finalize if already finalized
        campaign.status = CampaignStatus::Funded;
        assert!(!campaign.can_finalize(500));
    }
}
