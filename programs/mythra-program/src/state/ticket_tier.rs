use anchor_lang::prelude::*;

#[account]
pub struct TicketTier {
    pub event: Pubkey,              // 32 bytes - reference to parent event
    pub price_lamports: u64,        // 8 bytes
    pub max_supply: u32,            // 4 bytes
    pub current_supply: u32,        // 4 bytes - tickets sold so far
    pub metadata_uri: String,       // 4 + len bytes
    pub royalty_bps: u16,           // 2 bytes
    pub resale_enabled: bool,       // 1 byte - allow ticket transfers/resale
    pub tier_index: u8,             // 1 byte
    pub bump: u8,                   // 1 byte
}

impl TicketTier {
    pub const MAX_METADATA_URI_LENGTH: usize = 200;
    
    /// Calculate space needed for a TicketTier account
    /// 8 (discriminator) + 32 (event) + 8 (price_lamports) + 4 (max_supply) + 
    /// 4 (current_supply) + 4 + metadata_uri_len + 2 (royalty_bps) + 1 (resale_enabled) + 1 (tier_index) + 1 (bump)
    pub fn space(metadata_uri_len: usize) -> usize {
        8 + 32 + 8 + 4 + 4 + (4 + metadata_uri_len) + 2 + 1 + 1 + 1
    }
    
    /// Check if tier has available tickets
    pub fn is_available(&self) -> bool {
        self.current_supply < self.max_supply
    }
    
    /// Get remaining tickets
    pub fn remaining(&self) -> u32 {
        self.max_supply.saturating_sub(self.current_supply)
    }
}
