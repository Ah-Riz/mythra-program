use anchor_lang::prelude::*;
use crate::errors::EventError;
use crate::state::Event;

#[derive(Accounts)]
pub struct CloseEvent<'info> {
    /// Event account to be closed
    #[account(
        mut,
        has_one = authority @ EventError::UnauthorizedUpdate,
        close = authority
    )]
    pub event: Account<'info, Event>,
    
    /// Escrow account (must be empty or rent-exempt only)
    #[account(
        mut,
        seeds = [b"escrow", event.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,
    
    /// Event authority - receives reclaimed rent
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseEvent>) -> Result<()> {
    let event = &ctx.accounts.event;
    let clock = Clock::get()?;
    
    // Validation: Event must have ended
    require!(
        clock.unix_timestamp >= event.end_ts,
        EventError::EventNotEnded
    );
    
    // Validation: Escrow account must be empty (only rent-exempt minimum allowed)
    let rent = Rent::get()?;
    let rent_exempt_minimum = rent.minimum_balance(0);
    
    let escrow_balance = ctx.accounts.escrow.lamports();
    
    // Allow small margin for rent-exempt minimum
    require!(
        escrow_balance <= rent_exempt_minimum,
        EventError::OutstandingFunds
    );
    
    // Emit EventClosed event before closing the account
    emit!(EventClosed {
        event_pubkey: event.key(),
        authority: event.authority,
        total_supply: event.total_supply,
        allocated_supply: event.allocated_supply,
        start_ts: event.start_ts,
        end_ts: event.end_ts,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Event closed successfully");
    msg!("Event: {}", event.key());
    msg!("Authority: {}", event.authority);
    msg!("Total supply: {}", event.total_supply);
    msg!("Allocated supply: {}", event.allocated_supply);
    
    // Account will be closed automatically via the #[account(close = authority)] attribute
    Ok(())
}

#[event]
pub struct EventClosed {
    pub event_pubkey: Pubkey,
    pub authority: Pubkey,
    pub total_supply: u32,
    pub allocated_supply: u32,
    pub start_ts: i64,
    pub end_ts: i64,
    pub timestamp: i64,
}
