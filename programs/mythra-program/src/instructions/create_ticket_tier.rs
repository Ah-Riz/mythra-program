use anchor_lang::prelude::*;
use crate::errors::EventError;
use crate::state::{Event, TicketTier};

#[derive(Accounts)]
#[instruction(tier_id: String, metadata_uri: String)]
pub struct CreateTicketTier<'info> {
    #[account(
        init,
        payer = authority,
        space = TicketTier::space(metadata_uri.len()),
        seeds = [b"tier", event.key().as_ref(), tier_id.as_bytes()],
        bump
    )]
    pub tier: Account<'info, TicketTier>,
    
    #[account(
        mut,
        has_one = authority @ EventError::UnauthorizedTierCreation
    )]
    pub event: Account<'info, Event>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateTicketTier>,
    tier_id: String,
    metadata_uri: String,
    price_lamports: u64,
    max_supply: u32,
    royalty_bps: u16,
    tier_index: u8,
    resale_enabled: bool,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let tier = &mut ctx.accounts.tier;
    
    // Validation: metadata URI length
    require!(
        metadata_uri.len() <= TicketTier::MAX_METADATA_URI_LENGTH,
        EventError::MetadataUriTooLong
    );
    
    // Validation: price > 0
    require!(
        price_lamports > 0,
        EventError::InvalidPrice
    );
    
    // Validation: cumulative supply ≤ event.total_supply
    let new_allocated = event.allocated_supply
        .checked_add(max_supply)
        .ok_or(EventError::ExceedsTotalSupply)?;
    
    require!(
        new_allocated <= event.total_supply,
        EventError::ExceedsTotalSupply
    );
    
    // Update event allocated supply
    event.allocated_supply = new_allocated;
    
    // Store tier data
    tier.event = event.key();
    tier.price_lamports = price_lamports;
    tier.max_supply = max_supply;
    tier.current_supply = 0; // Initialize to 0, incremented on each purchase
    tier.metadata_uri = metadata_uri.clone();
    tier.royalty_bps = royalty_bps;
    tier.resale_enabled = resale_enabled;
    tier.tier_index = tier_index;
    tier.bump = ctx.bumps.tier;
    
    // Emit TicketTierCreated event
    emit!(TicketTierCreated {
        event_pubkey: event.key(),
        tier_pubkey: tier.key(),
        tier_id: tier_id.clone(),
        price_lamports,
        max_supply,
        metadata_uri: tier.metadata_uri.clone(),
        tier_index,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Tier created: {}", tier.key());
    msg!("Tier ID: {}", tier_id);
    msg!("Price: {} lamports", price_lamports);
    msg!("Max supply: {}", max_supply);
    msg!("Event allocated supply: {}/{}", event.allocated_supply, event.total_supply);
    
    Ok(())
}

#[event]
pub struct TicketTierCreated {
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub tier_id: String,
    pub price_lamports: u64,
    pub max_supply: u32,
    pub metadata_uri: String,
    pub tier_index: u8,
    pub timestamp: i64,
}
