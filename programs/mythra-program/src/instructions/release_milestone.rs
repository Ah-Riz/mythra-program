use anchor_lang::prelude::*;
use crate::state::{Campaign, Budget, BudgetStatus, Event};
use crate::errors::EventError;

/// Release funds for a milestone
/// 
/// Once a budget is approved and a milestone's unlock_date has passed,
/// the organizer can claim funds for that milestone. Funds are transferred
/// from campaign escrow to the organizer.
pub fn handler(
    ctx: Context<ReleaseMilestone>,
    milestone_index: u8,
) -> Result<()> {
    let budget = &mut ctx.accounts.budget;
    let campaign = &ctx.accounts.campaign;
    let clock = Clock::get()?;
    
    // Validate budget is approved
    require!(
        budget.status == BudgetStatus::Approved,
        EventError::BudgetNotApproved
    );
    
    // Validate milestone index
    require!(
        (milestone_index as usize) < budget.milestones.len(),
        ErrorCode::MilestoneNotReady
    );
    
    // Get milestone data before mutable borrow
    let milestone_data = budget.milestones[milestone_index as usize].clone();
    
    // Validate milestone is unlocked
    require!(
        milestone_data.is_unlocked(clock.unix_timestamp),
        EventError::MilestoneNotReady
    );
    
    // Validate not already released
    require!(
        !milestone_data.released,
        EventError::MilestoneAlreadyReleased
    );
    
    // Calculate release amount from percentage
    let release_amount = (budget.total_amount as u128 * milestone_data.release_percentage as u128 / 10_000) as u64;
    
    // Transfer funds from campaign escrow to organizer
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
            to: ctx.accounts.organizer.to_account_info(),
        },
        signer_seeds,
    );
    anchor_lang::system_program::transfer(cpi_context, release_amount)?;
    
    // Mark milestone as released
    let milestone = &mut budget.milestones[milestone_index as usize];
    milestone.released = true;
    milestone.released_amount = release_amount;
    
    // Update campaign expenses
    let campaign = &mut ctx.accounts.campaign;
    campaign.total_expenses += release_amount;
    
    // Check if all milestones released
    let all_released = budget.milestones.iter().all(|m| m.released);
    if all_released {
        budget.status = BudgetStatus::Executed;
        msg!("🎉 All milestones released! Budget execution complete.");
    }
    
    msg!(
        "Milestone {} released: {} lamports to organizer",
        milestone_index,
        release_amount
    );
    
    emit!(MilestoneReleased {
        budget: budget.key(),
        milestone_index,
        amount: release_amount,
        organizer: ctx.accounts.organizer.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(milestone_index: u8)]
pub struct ReleaseMilestone<'info> {
    /// Event (for validation)
    pub event: Account<'info, Event>,
    
    /// Campaign
    #[account(
        mut,
        has_one = event,
        has_one = organizer @ EventError::UnauthorizedCampaignAction
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Budget with milestones
    #[account(
        mut,
        seeds = [
            b"budget",
            campaign.key().as_ref(),
        ],
        bump = budget.bump,
        has_one = campaign
    )]
    pub budget: Account<'info, Budget>,
    
    /// Campaign escrow holding funds
    /// CHECK: PDA, funds transferred out
    #[account(
        mut,
        seeds = [
            b"campaign_escrow",
            campaign.key().as_ref(),
        ],
        bump
    )]
    pub campaign_escrow: AccountInfo<'info>,
    
    /// Organizer receiving milestone funds
    #[account(mut)]
    pub organizer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event]
pub struct MilestoneReleased {
    pub budget: Pubkey,
    pub milestone_index: u8,
    pub amount: u64,
    pub organizer: Pubkey,
    pub timestamp: i64,
}

use crate::errors::EventError as ErrorCode;
