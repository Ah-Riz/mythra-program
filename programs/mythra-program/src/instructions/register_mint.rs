use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenInterface, Mint, TokenAccount};
use crate::errors::EventError;
use crate::state::{Event, TicketTier, Ticket};

#[derive(Accounts)]
pub struct RegisterMint<'info> {
    #[account(
        init,
        payer = authority,
        space = Ticket::SPACE,
        seeds = [b"ticket", mint.key().as_ref()],
        bump
    )]
    pub ticket: Account<'info, Ticket>,
    
    #[account(
        has_one = authority @ EventError::UnauthorizedTierCreation
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        constraint = tier.event == event.key() @ EventError::UnauthorizedTierCreation
    )]
    pub tier: Account<'info, TicketTier>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        constraint = buyer_token_account.mint == mint.key() @ EventError::InvalidMintOwner,
        constraint = buyer_token_account.owner == buyer.key() @ EventError::InvalidMintOwner,
        constraint = buyer_token_account.amount == 1 @ EventError::InvalidSupply
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Buyer who owns the NFT
    pub buyer: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
    ctx: Context<RegisterMint>,
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let mint = &ctx.accounts.mint;
    let tier = &mut ctx.accounts.tier;
    
    // Validation: mint supply must be exactly 1
    require!(
        mint.supply == 1,
        EventError::InvalidSupply
    );
    
    // Validation: check tier has available supply
    require!(
        tier.is_available(),
        EventError::ExceedsTotalSupply
    );
    
    // Increment tier's current supply
    tier.current_supply = tier.current_supply
        .checked_add(1)
        .ok_or(EventError::ExceedsTotalSupply)?;
    
    // Store ticket data
    ticket.owner = ctx.accounts.buyer.key();
    ticket.event = ctx.accounts.event.key();
    ticket.tier = tier.key();
    ticket.mint = mint.key();
    ticket.used = false;
    ticket.refunded = false;
    ticket.checked_in_ts = 0;
    ticket.gate_operator = Pubkey::default();
    ticket.refund_ts = 0;
    ticket.bump = ctx.bumps.ticket;
    
    // Emit TicketRegistered event
    emit!(TicketRegistered {
        ticket_pubkey: ticket.key(),
        event_pubkey: ctx.accounts.event.key(),
        tier_pubkey: tier.key(),
        mint_pubkey: mint.key(),
        owner: ticket.owner,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Ticket registered: {}", ticket.key());
    msg!("Mint: {}", mint.key());
    msg!("Owner: {}", ticket.owner);
    msg!("Tier supply: {}/{}", tier.current_supply, tier.max_supply);
    
    Ok(())
}

#[event]
pub struct TicketRegistered {
    pub ticket_pubkey: Pubkey,
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub mint_pubkey: Pubkey,
    pub owner: Pubkey,
    pub timestamp: i64,
}
