use anchor_lang::prelude::*;

#[account]
pub struct Event {
    pub authority: Pubkey,        // 32 bytes
    pub metadata_uri: String,     // 4 + len bytes
    pub start_ts: i64,            // 8 bytes
    pub end_ts: i64,              // 8 bytes
    pub total_supply: u32,        // 4 bytes
    pub allocated_supply: u32,    // 4 bytes - cumulative supply allocated across tiers
    pub treasury: Pubkey,         // 32 bytes
    pub platform_split_bps: u16,  // 2 bytes
    pub canceled: bool,           // 1 byte - event cancellation status
    pub bump: u8,                 // 1 byte
}

impl Event {
    pub const MAX_METADATA_URI_LENGTH: usize = 200;
    
    /// Calculate space needed for an Event account
    /// 8 (discriminator) + 32 (authority) + 4 + metadata_uri_len + 8 (start_ts) + 
    /// 8 (end_ts) + 4 (total_supply) + 4 (allocated_supply) + 32 (treasury) + 2 (platform_split_bps) + 1 (canceled) + 1 (bump)
    pub fn space(metadata_uri_len: usize) -> usize {
        8 + 32 + (4 + metadata_uri_len) + 8 + 8 + 4 + 4 + 32 + 2 + 1 + 1
    }
}
