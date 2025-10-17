use anchor_lang::prelude::*;
use crate::state::{Budget, BudgetStatus, BudgetVote, Contribution, Campaign};
use crate::errors::EventError;

/// Vote on a budget proposal
/// 
/// Backers can vote to approve or reject a budget. Voting power
/// is equal to contribution amount (linear voting for MVP).
/// Voting period is time-limited (3 days).
pub fn handler(
    ctx: Context<VoteOnBudget>,
    approve: bool,
) -> Result<()> {
    let budget = &mut ctx.accounts.budget;
    let contribution = &ctx.accounts.contribution;
    let vote = &mut ctx.accounts.vote;
    let clock = Clock::get()?;
    
    // Validate budget is in pending status
    require!(
        budget.status == BudgetStatus::Pending,
        EventError::BudgetNotPending
    );
    
    // Validate voting period hasn't ended
    require!(
        !budget.voting_ended(clock.unix_timestamp),
        EventError::VotingPeriodEnded
    );
    
    // Validate voter is a contributor
    require!(
        contribution.campaign == budget.campaign,
        EventError::NotAContributor
    );
    
    // Record vote
    vote.budget = budget.key();
    vote.voter = ctx.accounts.voter.key();
    vote.contribution_amount = contribution.amount;
    vote.approve = approve;
    vote.voted_at = clock.unix_timestamp;
    vote.bump = ctx.bumps.vote;
    
    // Update budget vote tallies
    let voting_power = vote.voting_power();
    if approve {
        budget.votes_for += voting_power;
        msg!("Vote YES: {} lamports voting power", voting_power);
    } else {
        budget.votes_against += voting_power;
        msg!("Vote NO: {} lamports voting power", voting_power);
    }
    
    msg!(
        "Current tally: {} FOR, {} AGAINST",
        budget.votes_for,
        budget.votes_against
    );
    
    Ok(())
}

#[derive(Accounts)]
pub struct VoteOnBudget<'info> {
    /// Budget being voted on
    #[account(mut)]
    pub budget: Account<'info, Budget>,
    
    /// Campaign this budget belongs to
    pub campaign: Account<'info, Campaign>,
    
    /// Voter's contribution record (proves they're a backer)
    #[account(
        seeds = [
            b"contribution",
            campaign.key().as_ref(),
            voter.key().as_ref(),
        ],
        bump = contribution.bump,
        has_one = campaign
    )]
    pub contribution: Account<'info, Contribution>,
    
    /// Vote record to create (prevents double voting)
    #[account(
        init,
        payer = voter,
        space = BudgetVote::LEN,
        seeds = [
            b"budget_vote",
            budget.key().as_ref(),
            voter.key().as_ref(),
        ],
        bump
    )]
    pub vote: Account<'info, BudgetVote>,
    
    /// Voter (must be a contributor)
    #[account(mut)]
    pub voter: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
