use anchor_lang::prelude::*;
use crate::state::{Budget, BudgetStatus};
use crate::errors::EventError;

/// Finalize budget voting
/// 
/// After voting period ends, anyone can call this to finalize
/// the result. If votes_for > votes_against, budget is approved.
/// Otherwise, it's rejected and can be revised.
pub fn handler(ctx: Context<FinalizeBudgetVote>) -> Result<()> {
    let budget = &mut ctx.accounts.budget;
    let clock = Clock::get()?;
    
    // Validate budget is pending
    require!(
        budget.status == BudgetStatus::Pending,
        EventError::BudgetNotPending
    );
    
    // Validate voting period has ended
    require!(
        budget.voting_ended(clock.unix_timestamp),
        EventError::VotingPeriodNotEnded
    );
    
    // Determine result
    if budget.is_approved() {
        budget.status = BudgetStatus::Approved;
        
        msg!(
            "✅ Budget APPROVED! {} FOR vs {} AGAINST",
            budget.votes_for,
            budget.votes_against
        );
        
        emit!(BudgetFinalized {
            budget: budget.key(),
            status: BudgetStatus::Approved,
            votes_for: budget.votes_for,
            votes_against: budget.votes_against,
            timestamp: clock.unix_timestamp,
        });
    } else {
        budget.status = BudgetStatus::Rejected;
        
        msg!(
            "❌ Budget REJECTED. {} FOR vs {} AGAINST",
            budget.votes_for,
            budget.votes_against
        );
        msg!("Organizer can revise and resubmit (max 2 revisions)");
        
        emit!(BudgetFinalized {
            budget: budget.key(),
            status: BudgetStatus::Rejected,
            votes_for: budget.votes_for,
            votes_against: budget.votes_against,
            timestamp: clock.unix_timestamp,
        });
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeBudgetVote<'info> {
    /// Budget to finalize
    #[account(mut)]
    pub budget: Account<'info, Budget>,
}

#[event]
pub struct BudgetFinalized {
    pub budget: Pubkey,
    pub status: BudgetStatus,
    pub votes_for: u64,
    pub votes_against: u64,
    pub timestamp: i64,
}
