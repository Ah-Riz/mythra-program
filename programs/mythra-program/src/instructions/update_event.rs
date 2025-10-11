use anchor_lang::prelude::*;
use crate::errors::EventError;
use crate::state::Event;

#[derive(Accounts)]
#[instruction(params: UpdateEventParams)]
pub struct UpdateEvent<'info> {
    #[account(
        mut,
        has_one = authority @ EventError::UnauthorizedUpdate,
        realloc = Event::space(
            params.metadata_uri.as_ref()
                .map(|uri| uri.len())
                .unwrap_or(event.metadata_uri.len())
        ),
        realloc::payer = authority,
        realloc::zero = false,
    )]
    pub event: Account<'info, Event>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateEventParams {
    pub metadata_uri: Option<String>,
    pub end_ts: Option<i64>,
    pub platform_split_bps: Option<u16>,
    pub treasury: Option<Pubkey>,
}

pub fn handler(
    ctx: Context<UpdateEvent>,
    params: UpdateEventParams,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let clock = Clock::get()?;
    
    let mut updated_fields = Vec::new();
    
    // Update metadata_uri if provided
    if let Some(metadata_uri) = &params.metadata_uri {
        require!(
            metadata_uri.len() <= Event::MAX_METADATA_URI_LENGTH,
            EventError::MetadataUriTooLong
        );
        event.metadata_uri = metadata_uri.clone();
        updated_fields.push("metadata_uri");
    }
    
    // Update end_ts if provided
    if let Some(end_ts) = params.end_ts {
        require!(
            end_ts > clock.unix_timestamp,
            EventError::EndTimestampInPast
        );
        event.end_ts = end_ts;
        updated_fields.push("end_ts");
    }
    
    // Update platform_split_bps if provided
    if let Some(platform_split_bps) = params.platform_split_bps {
        require!(
            platform_split_bps <= 10000,
            EventError::InvalidPlatformSplit
        );
        event.platform_split_bps = platform_split_bps;
        updated_fields.push("platform_split_bps");
    }
    
    // Update treasury if provided
    if let Some(treasury) = params.treasury {
        event.treasury = treasury;
        updated_fields.push("treasury");
    }
    
    // Emit EventUpdated event
    emit!(EventUpdated {
        event_pubkey: event.key(),
        authority: event.authority,
        updated_fields: updated_fields.join(", "),
        metadata_uri: event.metadata_uri.clone(),
        end_ts: event.end_ts,
        platform_split_bps: event.platform_split_bps,
        treasury: event.treasury,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Event updated: {}", event.key());
    msg!("Updated fields: {}", updated_fields.join(", "));
    
    Ok(())
}

#[event]
pub struct EventUpdated {
    pub event_pubkey: Pubkey,
    pub authority: Pubkey,
    pub updated_fields: String,
    pub metadata_uri: String,
    pub end_ts: i64,
    pub platform_split_bps: u16,
    pub treasury: Pubkey,
    pub timestamp: i64,
}
