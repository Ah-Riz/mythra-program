use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenInterface, TokenAccount};
use crate::errors::EventError;
use crate::state::Ticket;

#[derive(Accounts)]
pub struct MarkTicketUsed<'info> {
    #[account(
        mut,
        seeds = [b"ticket", ticket.mint.as_ref()],
        bump = ticket.bump,
        constraint = ticket.owner == owner.key() @ EventError::UnauthorizedTicketUse
    )]
    pub ticket: Account<'info, Ticket>,
    
    #[account(
        constraint = owner_token_account.mint == ticket.mint @ EventError::TicketNotOwned,
        constraint = owner_token_account.owner == owner.key() @ EventError::TicketNotOwned,
        constraint = owner_token_account.amount == 1 @ EventError::TicketNotOwned
    )]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub owner: Signer<'info>,
    
    /// CHECK: Gate operator/scanner who is marking the ticket as used
    pub gate_operator: AccountInfo<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
    ctx: Context<MarkTicketUsed>,
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    
    // Validation: ticket must not already be used
    require!(
        !ticket.used,
        EventError::TicketAlreadyUsed
    );
    
    let clock = Clock::get()?;
    
    // Mark ticket as used
    ticket.used = true;
    ticket.checked_in_ts = clock.unix_timestamp;
    ticket.gate_operator = ctx.accounts.gate_operator.key();
    
    // Emit TicketUsed event
    emit!(TicketUsed {
        ticket_pubkey: ticket.key(),
        owner: ticket.owner,
        mint: ticket.mint,
        event: ticket.event,
        tier: ticket.tier,
        gate_operator: ticket.gate_operator,
        checked_in_ts: ticket.checked_in_ts,
    });
    
    msg!("Ticket marked as used: {}", ticket.key());
    msg!("Owner: {}", ticket.owner);
    msg!("Checked in at: {}", ticket.checked_in_ts);
    msg!("Gate operator: {}", ticket.gate_operator);
    
    Ok(())
}

#[event]
pub struct TicketUsed {
    pub ticket_pubkey: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub event: Pubkey,
    pub tier: Pubkey,
    pub gate_operator: Pubkey,
    pub checked_in_ts: i64,
}
