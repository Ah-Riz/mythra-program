use anchor_lang::prelude::*;

#[account]
pub struct Order {
    pub buyer: Pubkey,          // 32 bytes - buyer who created order
    pub event: Pubkey,          // 32 bytes - event reference
    pub tier: Pubkey,           // 32 bytes - tier reference
    pub mint: Pubkey,           // 32 bytes - NFT mint (0 if not yet minted)
    pub order_id: String,       // 4 + len bytes - unique order identifier
    pub amount_paid: u64,       // 8 bytes - lamports paid
    pub timestamp: i64,         // 8 bytes - order creation time
    pub bump: u8,               // 1 byte
}

impl Order {
    pub const MAX_ORDER_ID_LENGTH: usize = 64;
    
    /// Calculate space needed for an Order account
    pub fn space(order_id_len: usize) -> usize {
        8 + 32 + 32 + 32 + 32 + (4 + order_id_len) + 8 + 8 + 1
    }
}
