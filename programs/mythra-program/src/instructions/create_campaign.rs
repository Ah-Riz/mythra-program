use anchor_lang::prelude::*;
use crate::state::{Campaign, CampaignStatus, Event};
use crate::errors::EventError;

/// Create a crowdfunding campaign for an event
/// 
/// This instruction allows event organizers to create a crowdfunding campaign
/// to raise funds before the event. Backers can contribute SOL which is held
/// in escrow until the funding goal is reached.
pub fn handler(
    ctx: Context<CreateCampaign>,
    funding_goal: u64,
    deadline: i64,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let event = &mut ctx.accounts.event;
    let clock = Clock::get()?;
    
    // Validate deadline is in the future
    require!(
        deadline > clock.unix_timestamp,
        EventError::DeadlineInPast
    );
    
    // Validate deadline is before event start time
    require!(
        deadline < event.start_ts,
        EventError::DeadlineAfterEventStart
    );
    
    // Validate funding goal is reasonable (at least 0.1 SOL)
    require!(
        funding_goal >= 100_000_000, // 0.1 SOL minimum
        EventError::InvalidContributionAmount
    );
    
    // Initialize campaign
    campaign.event = event.key();
    campaign.organizer = ctx.accounts.organizer.key();
    campaign.funding_goal = funding_goal;
    campaign.total_raised = 0;
    campaign.deadline = deadline;
    campaign.status = CampaignStatus::Pending;
    campaign.total_contributors = 0;
    campaign.created_at = clock.unix_timestamp;
    campaign.total_expenses = 0;
    campaign.total_revenue = 0;
    campaign.backer_pool = 0;
    campaign.organizer_pool = 0;
    campaign.platform_pool = 0;
    campaign.distribution_complete = false;
    campaign.organizer_claimed = false;
    campaign.bump = ctx.bumps.campaign;
    
    // Mark event as crowdfunding enabled
    event.crowdfunding_enabled = true;
    event.campaign = Some(campaign.key());
    
    msg!(
        "Campaign created for event with goal {} lamports, deadline {}",
        funding_goal,
        deadline
    );
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(funding_goal: u64, deadline: i64)]
pub struct CreateCampaign<'info> {
    /// The event being crowdfunded (must exist)
    #[account(
        mut,
        has_one = authority @ EventError::UnauthorizedCampaignAction
    )]
    pub event: Account<'info, Event>,
    
    /// Campaign PDA to be created
    #[account(
        init,
        payer = organizer,
        space = Campaign::LEN,
        seeds = [
            b"campaign",
            event.key().as_ref(),
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Event organizer (must match event.authority)
    #[account(mut)]
    pub organizer: Signer<'info>,
    
    /// Authority field of the event (for validation)
    /// CHECK: Validated through has_one constraint on event
    pub authority: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}
