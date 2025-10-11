use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_interface::{TokenInterface, Mint, TokenAccount, burn, Burn};
use crate::errors::EventError;
use crate::state::{Event, TicketTier, Ticket};

#[derive(Accounts)]
pub struct RefundTicket<'info> {
    /// Ticket account to be refunded
    #[account(
        mut,
        seeds = [b"ticket", ticket.mint.as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,
    
    /// Event account (must match ticket.event)
    #[account(
        constraint = event.key() == ticket.event @ EventError::UnauthorizedRefund,
        has_one = authority @ EventError::UnauthorizedRefund
    )]
    pub event: Account<'info, Event>,
    
    /// Tier account (for reference)
    #[account(
        constraint = tier.key() == ticket.tier @ EventError::UnauthorizedRefund
    )]
    pub tier: Account<'info, TicketTier>,
    
    /// Escrow account holding refund funds
    /// PDA: ["escrow", event.key()]
    #[account(
        mut,
        seeds = [b"escrow", event.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,
    
    /// NFT mint to be burned
    #[account(
        mut,
        constraint = mint.key() == ticket.mint @ EventError::InvalidMintOwner
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// Buyer's token account holding the NFT
    #[account(
        mut,
        constraint = buyer_token_account.mint == ticket.mint @ EventError::InvalidMintOwner,
        constraint = buyer_token_account.owner == ticket.owner @ EventError::InvalidMintOwner,
        constraint = buyer_token_account.amount == 1 @ EventError::TicketNotOwned
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Buyer receiving the refund
    /// CHECK: This is the ticket owner
    #[account(
        mut,
        constraint = buyer.key() == ticket.owner @ EventError::UnauthorizedRefund
    )]
    pub buyer: AccountInfo<'info>,
    
    /// Event authority that must approve refund
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
    ctx: Context<RefundTicket>,
    refund_amount: u64,
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let event = &ctx.accounts.event;
    let tier = &ctx.accounts.tier;
    let clock = Clock::get()?;
    
    // Validation: Ticket must not already be used
    require!(
        !ticket.used,
        EventError::TicketUsedCannotRefund
    );
    
    // Validation: Ticket must not already be refunded
    require!(
        !ticket.refunded,
        EventError::AlreadyRefunded
    );
    
    // Validation: Refunds only allowed before event starts
    // (In production, you might also check for event cancellation flag)
    require!(
        clock.unix_timestamp < event.start_ts,
        EventError::EventAlreadyStarted
    );
    
    // Validation: Check escrow has sufficient balance
    let rent = Rent::get()?;
    let rent_exempt_minimum = rent.minimum_balance(0);
    
    let available_balance = ctx.accounts.escrow.lamports()
        .checked_sub(rent_exempt_minimum)
        .ok_or(EventError::InsufficientBalance)?;
    
    require!(
        refund_amount <= available_balance,
        EventError::InsufficientBalance
    );
    
    // Burn the NFT
    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    
    // Note: In production, buyer should sign this transaction
    // For now, we require buyer to be present but authority signs
    burn(burn_ctx, 1)?;
    
    // Transfer refund from escrow to buyer
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
            from: ctx.accounts.escrow.to_account_info(),
            to: ctx.accounts.buyer.to_account_info(),
        },
        signer_seeds,
    );
    
    transfer(transfer_ctx, refund_amount)?;
    
    // Mark ticket as refunded
    ticket.refunded = true;
    ticket.refund_ts = clock.unix_timestamp;
    
    // Emit TicketRefunded event
    emit!(TicketRefunded {
        ticket_pubkey: ticket.key(),
        event_pubkey: event.key(),
        tier_pubkey: tier.key(),
        mint_pubkey: ticket.mint,
        owner: ticket.owner,
        refund_amount,
        refunded_by: ctx.accounts.authority.key(),
        timestamp: ticket.refund_ts,
    });
    
    msg!("Ticket refunded successfully");
    msg!("Ticket: {}", ticket.key());
    msg!("Owner: {}", ticket.owner);
    msg!("Refund amount: {} lamports", refund_amount);
    msg!("NFT burned: {}", ticket.mint);
    
    Ok(())
}

#[event]
pub struct TicketRefunded {
    pub ticket_pubkey: Pubkey,
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub mint_pubkey: Pubkey,
    pub owner: Pubkey,
    pub refund_amount: u64,
    pub refunded_by: Pubkey,
    pub timestamp: i64,
}
