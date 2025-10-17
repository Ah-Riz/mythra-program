use anchor_lang::prelude::*;
use crate::errors::EventError;
use crate::state::Event;

#[derive(Accounts)]
#[instruction(event_id: String, metadata_uri: String)]
pub struct CreateEvent<'info> {
    #[account(
        init,
        payer = organizer,
        space = Event::space(metadata_uri.len()),
        seeds = [b"event", organizer.key().as_ref(), event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    
    #[account(mut)]
    pub organizer: Signer<'info>,
    
    /// CHECK: This is the treasury account that will receive funds
    pub treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateEvent>,
    event_id: String,
    metadata_uri: String,
    start_ts: i64,
    end_ts: i64,
    total_supply: u32,
    platform_split_bps: u16,
) -> Result<()> {
    // Validation: metadata URI length
    require!(
        metadata_uri.len() <= Event::MAX_METADATA_URI_LENGTH,
        EventError::MetadataUriTooLong
    );
    
    // Validation: start_ts < end_ts
    require!(
        start_ts < end_ts,
        EventError::InvalidTimestamps
    );
    
    // Validation: total_supply > 0
    require!(
        total_supply > 0,
        EventError::ZeroSupply
    );
    
    let event = &mut ctx.accounts.event;
    
    // Store event data
    event.authority = ctx.accounts.organizer.key();
    event.metadata_uri = metadata_uri.clone();
    event.start_ts = start_ts;
    event.end_ts = end_ts;
    event.total_supply = total_supply;
    event.allocated_supply = 0; // Initialize to 0, incremented when tiers are created
    event.treasury = ctx.accounts.treasury.key();
    event.platform_split_bps = platform_split_bps;
    event.canceled = false;
    event.crowdfunding_enabled = false; // Will be set to true if campaign created
    event.campaign = None;
    event.ticket_revenue = 0;
    event.bump = ctx.bumps.event;
    
    // Emit EventCreated event
    emit!(EventCreated {
        event_pubkey: event.key(),
        authority: event.authority,
        metadata_uri: event.metadata_uri.clone(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Event created: {}", event.key());
    msg!("Event ID: {}", event_id);
    msg!("Organizer: {}", ctx.accounts.organizer.key());
    
    Ok(())
}

#[event]
pub struct EventCreated {
    pub event_pubkey: Pubkey,
    pub authority: Pubkey,
    pub metadata_uri: String,
    pub timestamp: i64,
}
