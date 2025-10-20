use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token::{Token, Mint, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use crate::errors::EventError;
use crate::state::{Event, TicketTier, Ticket};

#[derive(Accounts)]
pub struct PurchaseTicket<'info> {
    /// Ticket account to be created
    #[account(
        init,
        payer = buyer,
        space = Ticket::SPACE,
        seeds = [b"ticket", mint.key().as_ref()],
        bump
    )]
    pub ticket: Account<'info, Ticket>,
    
    /// Event account
    #[account(mut)]
    pub event: Account<'info, Event>,
    
    /// Ticket tier account
    #[account(
        mut,
        constraint = tier.event == event.key() @ EventError::UnauthorizedTierCreation
    )]
    pub tier: Account<'info, TicketTier>,
    
    /// NFT mint (must be created externally for now)
    /// CHECK: Mint account will be validated in handler
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    
    /// Buyer's token account for the NFT
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    
    /// Escrow account to receive ticket payment
    #[account(
        mut,
        seeds = [b"ticket_escrow", event.key().as_ref()],
        bump
    )]
    pub ticket_escrow: SystemAccount<'info>,
    
    /// Buyer (pays for ticket and receives NFT)
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<PurchaseTicket>) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let tier = &mut ctx.accounts.tier;
    let event = &mut ctx.accounts.event;
    
    // VALIDATION: Check tier has available supply
    require!(tier.is_available(), EventError::ExceedsTotalSupply);
    
    // Note: For MVP, we skip crowdfunding validation
    // This can be added back when integrating with the campaign system
    
    // STEP 1: Transfer payment from buyer to escrow
    let payment_amount = tier.price_lamports;
    
    if payment_amount > 0 {
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.ticket_escrow.to_account_info(),
            },
        );
        
        transfer(transfer_ctx, payment_amount)?;
        
        msg!("Payment transferred: {} lamports", payment_amount);
    }
    
    // STEP 2: Validate mint (buyer must bring pre-created mint)
    // Note: For MVP, we simplified to require external mint creation
    // This matches the register_mint flow but with payment integrated
    
    let mint_data = ctx.accounts.mint.try_borrow_data()?;
    let mint_account = Mint::try_deserialize(&mut &mint_data[..])?;
    
    // Validate: NFT supply must be exactly 1
    require!(
        mint_account.supply == 1,
        EventError::InvalidSupply
    );
    drop(mint_data); // Release borrow
    
    // Validate: Buyer owns the NFT
    require!(
        ctx.accounts.buyer_token_account.amount == 1,
        EventError::TicketNotOwned
    );
    
    msg!("NFT validated for buyer: {}", ctx.accounts.buyer.key());
    
    // STEP 3: Increment tier supply
    tier.current_supply = tier.current_supply
        .checked_add(1)
        .ok_or(EventError::ExceedsTotalSupply)?;
    
    // STEP 4: Create ticket record
    let event_key = event.key();
    ticket.owner = ctx.accounts.buyer.key();
    ticket.event = event_key;
    ticket.tier = tier.key();
    ticket.mint = ctx.accounts.mint.key();
    ticket.used = false;
    ticket.refunded = false;
    ticket.checked_in_ts = 0;
    ticket.gate_operator = Pubkey::default();
    ticket.refund_ts = 0;
    ticket.bump = ctx.bumps.ticket;
    
    // STEP 5: Track revenue
    event.ticket_revenue = event.ticket_revenue
        .checked_add(tier.price_lamports)
        .ok_or(EventError::ArithmeticOverflow)?;
    
    msg!("Ticket revenue updated: {} lamports", event.ticket_revenue);
    
    // Emit TicketPurchased event
    emit!(TicketPurchased {
        ticket_pubkey: ticket.key(),
        event_pubkey: event_key,
        tier_pubkey: tier.key(),
        mint_pubkey: ctx.accounts.mint.key(),
        buyer: ticket.owner,
        price_paid: payment_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Ticket purchased successfully!");
    msg!("Ticket: {}", ticket.key());
    msg!("NFT Mint: {}", ctx.accounts.mint.key());
    msg!("Buyer: {}", ticket.owner);
    msg!("Tier supply: {}/{}", tier.current_supply, tier.max_supply);
    
    Ok(())
}

#[event]
pub struct TicketPurchased {
    pub ticket_pubkey: Pubkey,
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub mint_pubkey: Pubkey,
    pub buyer: Pubkey,
    pub price_paid: u64,
    pub timestamp: i64,
}
