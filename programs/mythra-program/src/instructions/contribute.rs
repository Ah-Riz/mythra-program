use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{Campaign, Contribution};
use crate::errors::EventError;

/// Contribute SOL to a crowdfunding campaign
/// 
/// Backers can contribute any amount of SOL to an active campaign.
/// Contributions are held in the campaign escrow PDA until the campaign
/// is finalized (either funded or failed).
pub fn handler(
    ctx: Context<Contribute>,
    amount: u64,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let contribution = &mut ctx.accounts.contribution;
    let clock = Clock::get()?;
    
    // Validate campaign is active
    require!(
        campaign.is_active(),
        EventError::CampaignNotActive
    );
    
    // Validate deadline has not passed
    require!(
        !campaign.deadline_passed(clock.unix_timestamp),
        EventError::CampaignDeadlinePassed
    );
    
    // Validate contribution amount
    require!(
        amount > 0,
        EventError::InvalidContributionAmount
    );
    
    // Transfer SOL from contributor to campaign escrow
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.contributor.to_account_info(),
            to: ctx.accounts.campaign_escrow.to_account_info(),
        },
    );
    transfer(cpi_context, amount)?;
    
    // Initialize contribution record
    contribution.campaign = campaign.key();
    contribution.contributor = ctx.accounts.contributor.key();
    contribution.amount = amount;
    contribution.contributed_at = clock.unix_timestamp;
    contribution.refunded = false;
    contribution.profit_share = 0; // Will be calculated at distribution
    contribution.profit_claimed = false;
    contribution.bump = ctx.bumps.contribution;
    
    // Update campaign totals
    campaign.total_raised += amount;
    campaign.total_contributors = campaign.total_contributors.checked_add(1).ok_or(EventError::ArithmeticOverflow)?;
    
    msg!(
        "Contribution received: {} lamports from {} (Total raised: {} / {})",
        amount,
        ctx.accounts.contributor.key(),
        campaign.total_raised,
        campaign.funding_goal
    );
    
    // Check if goal reached
    if campaign.goal_reached() {
        msg!("🎉 Funding goal reached! Campaign can be finalized.");
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    /// Campaign being contributed to
    #[account(
        mut,
        seeds = [
            b"campaign",
            campaign.event.as_ref(),
        ],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Contribution record to be created
    #[account(
        init,
        payer = contributor,
        space = Contribution::LEN,
        seeds = [
            b"contribution",
            campaign.key().as_ref(),
            contributor.key().as_ref(),
        ],
        bump
    )]
    pub contribution: Account<'info, Contribution>,
    
    /// Campaign escrow PDA (holds all contributions)
    /// CHECK: PDA derived from campaign, receives SOL transfers
    #[account(
        mut,
        seeds = [
            b"campaign_escrow",
            campaign.key().as_ref(),
        ],
        bump
    )]
    pub campaign_escrow: AccountInfo<'info>,
    
    /// Contributor making the contribution
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
