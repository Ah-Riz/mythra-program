use anchor_lang::prelude::*;
use crate::state::{Campaign, Contribution};
use crate::errors::EventError;

/// Claim refund from a failed campaign
/// 
/// If a campaign fails to reach its funding goal by the deadline,
/// backers can claim a full refund of their contribution.
/// Each contributor must call this individually to receive their refund.
pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let contribution = &mut ctx.accounts.contribution;
    
    // Validate campaign has failed
    require!(
        campaign.refunds_available(),
        EventError::CannotRefundFundedCampaign
    );
    
    // Validate contribution hasn't been refunded
    require!(
        contribution.can_refund(),
        EventError::ContributionAlreadyRefunded
    );
    
    // Validate contributor matches
    require!(
        contribution.contributor == ctx.accounts.contributor.key(),
        EventError::UnauthorizedCampaignAction
    );
    
    let refund_amount = contribution.amount;
    
    // Transfer refund from escrow to contributor
    let campaign_key = campaign.key();
    let escrow_seeds = &[
        b"campaign_escrow",
        campaign_key.as_ref(),
        &[ctx.bumps.campaign_escrow],
    ];
    let signer_seeds = &[&escrow_seeds[..]];
    
    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.campaign_escrow.to_account_info(),
            to: ctx.accounts.contributor.to_account_info(),
        },
        signer_seeds,
    );
    anchor_lang::system_program::transfer(cpi_context, refund_amount)?;
    
    // Mark contribution as refunded
    contribution.refunded = true;
    
    // Update campaign totals
    campaign.total_raised = campaign.total_raised.saturating_sub(refund_amount);
    
    msg!(
        "Refund processed: {} lamports to {}",
        refund_amount,
        ctx.accounts.contributor.key()
    );
    
    // Emit refund event
    emit!(RefundClaimed {
        campaign: campaign.key(),
        contributor: ctx.accounts.contributor.key(),
        amount: refund_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    /// Campaign that failed
    #[account(
        mut,
        seeds = [
            b"campaign",
            campaign.event.as_ref(),
        ],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Contribution record
    #[account(
        mut,
        seeds = [
            b"contribution",
            campaign.key().as_ref(),
            contributor.key().as_ref(),
        ],
        bump = contribution.bump,
        has_one = campaign,
        has_one = contributor
    )]
    pub contribution: Account<'info, Contribution>,
    
    /// Campaign escrow PDA (holds contributions)
    /// CHECK: PDA derived, sends refund
    #[account(
        mut,
        seeds = [
            b"campaign_escrow",
            campaign.key().as_ref(),
        ],
        bump
    )]
    pub campaign_escrow: AccountInfo<'info>,
    
    /// Contributor claiming refund
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event]
pub struct RefundClaimed {
    pub campaign: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
