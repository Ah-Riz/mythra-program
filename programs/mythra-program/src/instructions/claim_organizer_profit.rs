use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{Campaign, CampaignStatus};
use crate::errors::EventError;

/// Allow organizer to claim their profit share
/// 
/// The organizer receives 35% of the profit after:
/// 1. Event has ended
/// 2. Distribution has been calculated
/// 3. There is profit (revenue > expenses)
/// 
/// This instruction:
/// 1. Validates organizer hasn't claimed yet
/// 2. Transfers SOL from campaign escrow to organizer
/// 3. Marks organizer profit as claimed
pub fn handler(ctx: Context<ClaimOrganizerProfit>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    
    // Validation: Distribution must be complete
    require!(
        campaign.distribution_complete,
        EventError::DistributionNotComplete
    );
    
    // Validation: Campaign must be completed
    require!(
        campaign.status == CampaignStatus::Completed,
        EventError::InvalidCampaignStatus
    );
    
    // Validation: Organizer hasn't claimed yet
    require!(
        !campaign.organizer_claimed,
        EventError::OrganizerAlreadyClaimed
    );
    
    let organizer_share = campaign.organizer_pool;
    
    msg!("Organizer pool: {} lamports", organizer_share);
    
    // Mark as claimed
    campaign.organizer_claimed = true;
    
    // If there's profit to claim, transfer it
    if organizer_share > 0 {
        // Validate escrow has sufficient balance
        let escrow_balance = ctx.accounts.campaign_escrow.lamports();
        require!(
            escrow_balance >= organizer_share,
            EventError::InsufficientBalance
        );

        let campaign_key = campaign.key();
        let seeds = &[
            b"campaign_escrow",
            campaign_key.as_ref(),
            &[ctx.bumps.campaign_escrow],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.campaign_escrow.to_account_info(),
                to: ctx.accounts.organizer.to_account_info(),
            },
            signer_seeds,
        );
        
        transfer(transfer_ctx, organizer_share)?;
        
        msg!("Transferred {} lamports to organizer", organizer_share);
    } else {
        msg!("No profit to claim (loss scenario)");
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimOrganizerProfit<'info> {
    /// Campaign account
    #[account(
        mut,
        has_one = organizer @ EventError::UnauthorizedClaim,
        constraint = campaign.distribution_complete @ EventError::DistributionNotComplete,
        constraint = campaign.status == CampaignStatus::Completed @ EventError::InvalidCampaignStatus,
        constraint = !campaign.organizer_claimed @ EventError::OrganizerAlreadyClaimed
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Campaign escrow PDA (holds the funds)
    #[account(
        mut,
        seeds = [b"campaign_escrow", campaign.key().as_ref()],
        bump
    )]
    pub campaign_escrow: SystemAccount<'info>,
    
    /// Organizer receiving the profit
    #[account(mut)]
    pub organizer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
