use anchor_lang::prelude::*;
use crate::state::{Campaign, CampaignStatus, Budget, BudgetStatus, Milestone};
use crate::errors::EventError;

/// Input for milestone creation
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneInput {
    pub description: String,
    pub release_percentage: u16,
    pub unlock_date: i64,
}

/// Submit budget for campaign
/// 
/// Organizer submits a budget with 3 fixed milestones showing how
/// they plan to spend crowdfunding money. Voting period is configurable in seconds.
pub fn handler(
    ctx: Context<SubmitBudget>,
    total_amount: u64,
    description: String,
    milestones: Vec<MilestoneInput>,
    voting_period_seconds: i64,
) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let budget = &mut ctx.accounts.budget;
    let clock = Clock::get()?;
    
    // Validate campaign is funded
    require!(
        campaign.status == CampaignStatus::Funded,
        EventError::CampaignNotFunded
    );
    
    // Validate budget doesn't exceed raised funds
    require!(
        total_amount <= campaign.total_raised,
        EventError::BudgetExceedsFunds
    );
    
    // Validate description length
    require!(
        description.len() <= Budget::MAX_DESCRIPTION_LEN,
        EventError::BudgetDescriptionTooLong
    );
    
    // Validate exactly 3 milestones
    require!(
        milestones.len() == 3,
        EventError::InvalidMilestonePercentages
    );
    
    // Validate milestone percentages sum to 100%
    let total_percentage: u16 = milestones.iter().map(|m| m.release_percentage).sum();
    require!(
        total_percentage == 10_000,
        EventError::InvalidMilestonePercentages
    );
    
    // Validate milestone descriptions
    for milestone in &milestones {
        require!(
            milestone.description.len() <= Budget::MAX_MILESTONE_DESC_LEN,
            EventError::MilestoneDescriptionTooLong
        );
    }
    
    // Initialize budget
    budget.campaign = campaign.key();
    budget.total_amount = total_amount;
    budget.description = description;
    
    // Convert milestone inputs to full milestones
    for (i, input) in milestones.iter().enumerate() {
        budget.milestones[i] = Milestone {
            description: input.description.clone(),
            release_percentage: input.release_percentage,
            unlock_date: input.unlock_date,
            released: false,
            released_amount: 0,
        };
    }
    
    budget.status = BudgetStatus::Pending;
    budget.voting_end = clock.unix_timestamp + voting_period_seconds;
    budget.votes_for = 0;
    budget.votes_against = 0;
    budget.revision_count = 0;
    budget.created_at = clock.unix_timestamp;
    budget.bump = ctx.bumps.budget;
    
    msg!(
        "Budget submitted: {} lamports, voting ends at {}",
        total_amount,
        budget.voting_end
    );
    
    Ok(())
}

#[derive(Accounts)]
pub struct SubmitBudget<'info> {
    /// Campaign that was funded
    #[account(
        mut,
        has_one = organizer @ EventError::UnauthorizedCampaignAction
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Budget PDA to create
    #[account(
        init,
        payer = organizer,
        space = Budget::LEN,
        seeds = [
            b"budget",
            campaign.key().as_ref(),
        ],
        bump
    )]
    pub budget: Account<'info, Budget>,
    
    /// Campaign organizer (signer)
    #[account(mut)]
    pub organizer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
