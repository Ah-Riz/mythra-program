use anchor_lang::prelude::*;
use crate::state::{Campaign, CampaignStatus};
use crate::errors::EventError;

/// Finalize a crowdfunding campaign
/// 
/// This instruction checks if the campaign has reached its goal or deadline
/// and updates its status accordingly:
/// - If goal reached → Status: Funded (event can proceed)
/// - If deadline passed without goal → Status: Failed (refunds available)
/// 
/// Can be called by anyone once the conditions are met.
pub fn handler(ctx: Context<FinalizeCampaign>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let clock = Clock::get()?;
    
    // Validate campaign can be finalized
    require!(
        campaign.can_finalize(clock.unix_timestamp),
        EventError::AlreadyFinalized
    );
    
    // Determine campaign outcome
    if campaign.goal_reached() {
        // Success: Goal reached (even if before deadline)
        campaign.status = CampaignStatus::Funded;
        
        msg!(
            "✅ Campaign FUNDED! Raised {} / {} lamports from {} contributors",
            campaign.total_raised,
            campaign.funding_goal,
            campaign.total_contributors
        );
        msg!("Event can now proceed with budget submission and ticket sales.");
        
        // Emit success event
        emit!(CampaignFinalized {
            campaign: campaign.key(),
            status: CampaignStatus::Funded,
            total_raised: campaign.total_raised,
            total_contributors: campaign.total_contributors,
            timestamp: clock.unix_timestamp,
        });
    } else {
        // Failure: Deadline passed without reaching goal
        campaign.status = CampaignStatus::Failed;
        
        msg!(
            "❌ Campaign FAILED. Only raised {} / {} lamports",
            campaign.total_raised,
            campaign.funding_goal
        );
        msg!("Backers can now claim refunds.");
        
        // Emit failure event
        emit!(CampaignFinalized {
            campaign: campaign.key(),
            status: CampaignStatus::Failed,
            total_raised: campaign.total_raised,
            total_contributors: campaign.total_contributors,
            timestamp: clock.unix_timestamp,
        });
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeCampaign<'info> {
    /// Campaign to finalize
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
}

#[event]
pub struct CampaignFinalized {
    pub campaign: Pubkey,
    pub status: CampaignStatus,
    pub total_raised: u64,
    pub total_contributors: u32,
    pub timestamp: i64,
}
