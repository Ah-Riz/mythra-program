use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_interface::{TokenInterface, TokenAccount, transfer_checked, TransferChecked, Mint};
use crate::errors::EventError;
use crate::state::{Event, TicketTier, Ticket};

#[derive(Accounts)]
pub struct TransferTicket<'info> {
    /// Ticket account to be transferred
    #[account(
        mut,
        seeds = [b"ticket", ticket.mint.as_ref()],
        bump = ticket.bump,
        constraint = ticket.owner == sender.key() @ EventError::InvalidOwner
    )]
    pub ticket: Account<'info, Ticket>,
    
    /// Event account (must match ticket.event)
    #[account(
        constraint = event.key() == ticket.event @ EventError::UnauthorizedRefund
    )]
    pub event: Account<'info, Event>,
    
    /// Tier account (for resale validation)
    #[account(
        constraint = tier.key() == ticket.tier @ EventError::UnauthorizedRefund,
        constraint = tier.resale_enabled @ EventError::ResaleDisabled
    )]
    pub tier: Account<'info, TicketTier>,
    
    /// NFT mint account
    #[account(
        constraint = mint.key() == ticket.mint @ EventError::InvalidMintOwner
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// Sender's token account (current owner)
    #[account(
        mut,
        constraint = sender_token_account.mint == ticket.mint @ EventError::InvalidMintOwner,
        constraint = sender_token_account.owner == sender.key() @ EventError::InvalidOwner,
        constraint = sender_token_account.amount == 1 @ EventError::TicketNotOwned
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Recipient's token account (new owner)
    #[account(
        mut,
        constraint = recipient_token_account.mint == ticket.mint @ EventError::InvalidMintOwner,
        constraint = recipient_token_account.owner == recipient.key() @ EventError::InvalidOwner
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Sender (current ticket owner) - must sign
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// Recipient (new ticket owner)
    /// CHECK: This is the new owner
    pub recipient: AccountInfo<'info>,
    
    /// Platform treasury for royalty payment
    /// CHECK: This is the platform treasury
    #[account(mut)]
    pub platform_treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
    ctx: Context<TransferTicket>,
    sale_price: Option<u64>,
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let tier = &ctx.accounts.tier;
    let event = &ctx.accounts.event;
    let clock = Clock::get()?;
    
    // Validation: Ticket must not be used
    require!(
        !ticket.used,
        EventError::TicketAlreadyUsed
    );
    
    // Validation: Ticket must not be refunded
    require!(
        !ticket.refunded,
        EventError::AlreadyRefunded
    );
    
    // Calculate and transfer royalty if sale price is provided
    if let Some(price) = sale_price {
        if tier.royalty_bps > 0 && price > 0 {
            let royalty_amount = price
                .checked_mul(tier.royalty_bps as u64)
                .ok_or(EventError::InvalidPrice)?
                .checked_div(10000)
                .ok_or(EventError::InvalidPrice)?;
            
            if royalty_amount > 0 {
                // Transfer royalty to platform treasury
                let transfer_ctx = CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.sender.to_account_info(),
                        to: ctx.accounts.platform_treasury.to_account_info(),
                    },
                );
                
                transfer(transfer_ctx, royalty_amount)?;
                
                msg!("Royalty transferred: {} lamports", royalty_amount);
            }
        }
    }
    
    // Transfer the NFT from sender to recipient
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.sender.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        },
    );
    
    transfer_checked(transfer_ctx, 1, ctx.accounts.mint.decimals)?;
    
    // Update ticket owner
    let old_owner = ticket.owner;
    ticket.owner = ctx.accounts.recipient.key();
    
    // Emit TicketTransferred event
    emit!(TicketTransferred {
        ticket_pubkey: ticket.key(),
        event_pubkey: event.key(),
        tier_pubkey: tier.key(),
        mint_pubkey: ticket.mint,
        from_owner: old_owner,
        to_owner: ticket.owner,
        sale_price,
        royalty_bps: tier.royalty_bps,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Ticket transferred successfully");
    msg!("Ticket: {}", ticket.key());
    msg!("From: {}", old_owner);
    msg!("To: {}", ticket.owner);
    if let Some(price) = sale_price {
        msg!("Sale price: {} lamports", price);
    }
    
    Ok(())
}

#[event]
pub struct TicketTransferred {
    pub ticket_pubkey: Pubkey,
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub mint_pubkey: Pubkey,
    pub from_owner: Pubkey,
    pub to_owner: Pubkey,
    pub sale_price: Option<u64>,
    pub royalty_bps: u16,
    pub timestamp: i64,
}
