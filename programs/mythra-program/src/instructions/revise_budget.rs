use anchor_lang::prelude::*;
use crate::state::{Campaign, Budget, BudgetStatus, Milestone};
use crate::instructions::submit_budget::MilestoneInput;

/// Revise a rejected budget
/// 
/// If a budget is rejected, the organizer can revise and resubmit.
/// Maximum 2 revisions allowed. Creates a new budget account with
/// incremented revision count.
pub fn handler(
    ctx: Context<ReviseBudget>,
    total_amount: u64,
    description: String,
    milestones: Vec<MilestoneInput>,
    voting_period_seconds: i64,
) -> Result<()> {
    let old_budget = &ctx.accounts.old_budget;
    let new_budget = &mut ctx.accounts.new_budget;
    let campaign = &ctx.accounts.campaign;
    let clock = Clock::get()?;
    
    // Validate old budget can be revised
    require!(
        old_budget.can_revise(),
        ErrorCode::CannotReviseBudget
    );
    
    // Validate hasn't exceeded revision limit
    require!(
        old_budget.revision_count < 2,
        ErrorCode::MaxRevisionsReached
    );
    
    // Validate budget doesn't exceed raised funds
    require!(
        total_amount <= campaign.total_raised,
        ErrorCode::BudgetExceedsFunds
    );
    
    // Validate description length
    require!(
        description.len() <= Budget::MAX_DESCRIPTION_LEN,
        ErrorCode::BudgetDescriptionTooLong
    );
    
    // Validate exactly 3 milestones
    require!(
        milestones.len() == 3,
        ErrorCode::InvalidMilestonePercentages
    );
    
    // Validate milestone percentages
    let total_percentage: u16 = milestones.iter().map(|m| m.release_percentage).sum();
    require!(
        total_percentage == 10_000,
        ErrorCode::InvalidMilestonePercentages
    );
    
    // Validate milestone descriptions
    for milestone in &milestones {
        require!(
            milestone.description.len() <= Budget::MAX_MILESTONE_DESC_LEN,
            ErrorCode::MilestoneDescriptionTooLong
        );
    }
    
    // Initialize new budget
    new_budget.campaign = campaign.key();
    new_budget.total_amount = total_amount;
    new_budget.description = description;
    
    // Set milestones
    for (i, input) in milestones.iter().enumerate() {
        new_budget.milestones[i] = Milestone {
            description: input.description.clone(),
            release_percentage: input.release_percentage,
            unlock_date: input.unlock_date,
            released: false,
            released_amount: 0,
        };
    }
    
    new_budget.status = BudgetStatus::Pending;
    new_budget.voting_end = clock.unix_timestamp + voting_period_seconds;
    new_budget.votes_for = 0;
    new_budget.votes_against = 0;
    new_budget.revision_count = old_budget.revision_count + 1;
    new_budget.created_at = clock.unix_timestamp;
    new_budget.bump = ctx.bumps.new_budget;
    
    msg!(
        "Budget revised (revision #{}). New voting ends at {}",
        new_budget.revision_count,
        new_budget.voting_end
    );
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(total_amount: u64, description: String, milestones: Vec<MilestoneInput>)]
pub struct ReviseBudget<'info> {
    /// Campaign
    #[account(
        has_one = organizer @ ErrorCode::UnauthorizedCampaignAction
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Old rejected budget
    #[account(
        seeds = [
            b"budget",
            campaign.key().as_ref(),
        ],
        bump = old_budget.bump
    )]
    pub old_budget: Account<'info, Budget>,
    
    /// New revised budget
    #[account(
        init,
        payer = organizer,
        space = Budget::LEN,
        seeds = [
            b"budget_revision",
            campaign.key().as_ref(),
            &[old_budget.revision_count + 1],
        ],
        bump
    )]
    pub new_budget: Account<'info, Budget>,
    
    /// Organizer (signer)
    #[account(mut)]
    pub organizer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// Use EventError enum
use crate::errors::EventError as ErrorCode;
