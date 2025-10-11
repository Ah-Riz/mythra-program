use anchor_lang::prelude::*;

#[account]
pub struct Ticket {
    pub owner: Pubkey,          // 32 bytes - ticket owner
    pub event: Pubkey,          // 32 bytes - event reference
    pub tier: Pubkey,           // 32 bytes - tier reference
    pub mint: Pubkey,           // 32 bytes - NFT mint
    pub used: bool,             // 1 byte - redemption status
    pub refunded: bool,         // 1 byte - refund status
    pub checked_in_ts: i64,     // 8 bytes - check-in timestamp (0 if not checked in)
    pub gate_operator: Pubkey,  // 32 bytes - scanner/operator who checked in ticket
    pub refund_ts: i64,         // 8 bytes - refund timestamp (0 if not refunded)
    pub bump: u8,               // 1 byte
}

impl Ticket {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 1 + 1 + 8 + 32 + 8 + 1; // 187 bytes
}
