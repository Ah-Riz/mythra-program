use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::errors::EventError;
use crate::state::Event;

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    /// Event account that tracks the event details
    #[account(
        mut,
        has_one = authority @ EventError::UnauthorizedWithdrawal,
        has_one = treasury @ EventError::UnauthorizedWithdrawal
    )]
    pub event: Account<'info, Event>,
    
    /// Escrow account that holds event funds
    /// PDA: ["escrow", event.key()]
    #[account(
        mut,
        seeds = [b"escrow", event.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,
    
    /// Treasury account that receives the withdrawn funds
    /// CHECK: This is the treasury account specified in the event
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    
    /// Event authority that must sign the withdrawal
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<WithdrawFunds>,
    amount: u64,
) -> Result<()> {
    let event = &ctx.accounts.event;
    let escrow = &ctx.accounts.escrow;
    
    // Validation: Check escrow has sufficient balance
    // Account for rent-exempt minimum (leave at least rent-exempt balance)
    let rent = Rent::get()?;
    let rent_exempt_minimum = rent.minimum_balance(0); // Minimum for empty account
    
    let available_balance = escrow.lamports()
        .checked_sub(rent_exempt_minimum)
        .ok_or(EventError::InsufficientBalance)?;
    
    require!(
        amount <= available_balance,
        EventError::InsufficientBalance
    );
    
    // Transfer lamports from escrow to treasury
    let event_key = event.key();
    let escrow_seeds = &[
        b"escrow",
        event_key.as_ref(),
        &[ctx.bumps.escrow],
    ];
    let signer_seeds = &[&escrow_seeds[..]];
    
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: escrow.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        },
        signer_seeds,
    );
    
    transfer(transfer_ctx, amount)?;
    
    // Emit FundsWithdrawn event
    emit!(FundsWithdrawn {
        event_pubkey: event.key(),
        escrow_pubkey: escrow.key(),
        treasury: ctx.accounts.treasury.key(),
        amount,
        remaining_balance: escrow.lamports().checked_sub(amount).unwrap_or(0),
        withdrawn_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Funds withdrawn from escrow");
    msg!("Event: {}", event.key());
    msg!("Amount: {} lamports", amount);
    msg!("Treasury: {}", ctx.accounts.treasury.key());
    msg!("Remaining escrow balance: {} lamports", 
        escrow.lamports().checked_sub(amount).unwrap_or(0));
    
    Ok(())
}

#[event]
pub struct FundsWithdrawn {
    pub event_pubkey: Pubkey,
    pub escrow_pubkey: Pubkey,
    pub treasury: Pubkey,
    pub amount: u64,
    pub remaining_balance: u64,
    pub withdrawn_by: Pubkey,
    pub timestamp: i64,
}
