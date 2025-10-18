use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{Campaign, CampaignStatus, Contribution};
use crate::errors::EventError;

/// Allow backers to claim their proportional profit share
/// 
/// Each backer's share is calculated as:
/// share = (backer_contribution / total_raised) * backer_pool
/// 
/// This instruction:
/// 1. Calculates the backer's proportional share
/// 2. Transfers SOL from campaign escrow to backer
/// 3. Marks the profit as claimed
pub fn handler(ctx: Context<ClaimBackerProfit>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let contribution = &mut ctx.accounts.contribution;
    
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
    
    // Validation: Backer hasn't claimed yet
    require!(
        !contribution.profit_claimed,
        EventError::ProfitAlreadyClaimed
    );
    
    // Calculate backer's proportional share
    let share = contribution.calculate_share(
        campaign.backer_pool,
        campaign.total_raised
    );
    
    // Store the share in contribution for tracking
    contribution.profit_share = share;
    
    msg!("Backer contribution: {} lamports", contribution.amount);
    msg!("Total raised: {} lamports", campaign.total_raised);
    msg!("Backer pool: {} lamports", campaign.backer_pool);
    msg!("Backer share: {} lamports", share);
    
    // Mark as claimed
    contribution.profit_claimed = true;
    
    // If there's profit to claim, transfer it
    if share > 0 {
        // Validate escrow has sufficient balance
        let escrow_balance = ctx.accounts.campaign_escrow.lamports();
        require!(
            escrow_balance >= share,
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
                to: ctx.accounts.contributor.to_account_info(),
            },
            signer_seeds,
        );
        
        transfer(transfer_ctx, share)?;
        
        msg!("Transferred {} lamports to backer", share);
    } else {
        msg!("No profit to claim (loss scenario)");
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimBackerProfit<'info> {
    /// Campaign account
    #[account(
        constraint = campaign.distribution_complete @ EventError::DistributionNotComplete,
        constraint = campaign.status == CampaignStatus::Completed @ EventError::InvalidCampaignStatus
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Contribution account for this backer
    #[account(
        mut,
        constraint = contribution.campaign == campaign.key() @ EventError::InvalidContribution,
        constraint = contribution.contributor == contributor.key() @ EventError::UnauthorizedClaim,
        constraint = !contribution.profit_claimed @ EventError::ProfitAlreadyClaimed
    )]
    pub contribution: Account<'info, Contribution>,
    
    /// Campaign escrow PDA (holds the funds)
    #[account(
        mut,
        seeds = [b"campaign_escrow", campaign.key().as_ref()],
        bump
    )]
    pub campaign_escrow: SystemAccount<'info>,
    
    /// Contributor receiving the profit
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
