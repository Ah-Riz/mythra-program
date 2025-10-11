use anchor_lang::prelude::*;

#[account]
pub struct Nonce {
    pub ticket: Pubkey,         // 32 bytes - reference to ticket
    pub nonce_hash: [u8; 32],   // 32 bytes - hash of the nonce
    pub used: bool,             // 1 byte - whether nonce has been used
    pub created_at: i64,        // 8 bytes - creation timestamp
    pub expires_at: i64,        // 8 bytes - expiration timestamp
    pub bump: u8,               // 1 byte
}

impl Nonce {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 1; // 90 bytes
    
    pub const DEFAULT_EXPIRY_SECONDS: i64 = 300; // 5 minutes
    
    pub fn is_expired(&self, current_ts: i64) -> bool {
        current_ts > self.expires_at
    }
}
