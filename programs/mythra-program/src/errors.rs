use anchor_lang::prelude::*;

#[error_code]
pub enum EventError {
    #[msg("Event end timestamp must be greater than start timestamp")]
    InvalidTimestamps,
    
    #[msg("Total supply must be greater than zero")]
    ZeroSupply,
    
    #[msg("Event with this ID already exists")]
    DuplicateEvent,
    
    #[msg("Metadata URI exceeds maximum length of 200 characters")]
    MetadataUriTooLong,
    
    #[msg("Only the event authority can update this event")]
    UnauthorizedUpdate,
    
    #[msg("Platform split must be between 0 and 10000 basis points")]
    InvalidPlatformSplit,
    
    #[msg("End timestamp must be in the future")]
    EndTimestampInPast,
    
    #[msg("Cumulative tier supply exceeds event total supply")]
    ExceedsTotalSupply,
    
    #[msg("Ticket price must be greater than zero")]
    InvalidPrice,
    
    #[msg("Tier with this ID already exists")]
    DuplicateTier,
    
    #[msg("Only the event authority can create tiers")]
    UnauthorizedTierCreation,
    
    #[msg("Ticket already registered for this mint")]
    TicketAlreadyExists,
    
    #[msg("Mint owner does not match expected buyer")]
    InvalidMintOwner,
    
    #[msg("Mint supply must be exactly 1")]
    InvalidSupply,
    
    #[msg("Ticket has already been used")]
    TicketAlreadyUsed,
    
    #[msg("Only the ticket owner can use this ticket")]
    UnauthorizedTicketUse,
    
    #[msg("Owner does not hold the ticket NFT")]
    TicketNotOwned,
    
    #[msg("Invalid ed25519 signature")]
    InvalidSignature,
    
    #[msg("Nonce has already been used")]
    NonceUsed,
    
    #[msg("Nonce has expired")]
    NonceExpired,
    
    #[msg("Ed25519 instruction not found or invalid")]
    Ed25519InstructionMissing,
    
    #[msg("Insufficient balance in escrow account")]
    InsufficientBalance,
    
    #[msg("Only the event authority can withdraw funds")]
    UnauthorizedWithdrawal,
    
    #[msg("Ticket has already been refunded")]
    AlreadyRefunded,
    
    #[msg("Cannot refund a ticket that has been used")]
    TicketUsedCannotRefund,
    
    #[msg("Only the event authority can process refunds")]
    UnauthorizedRefund,
    
    #[msg("Refunds not allowed after event has started")]
    EventAlreadyStarted,
    
    #[msg("Ticket resale is disabled for this tier")]
    ResaleDisabled,
    
    #[msg("Only the ticket owner can transfer this ticket")]
    InvalidOwner,
    
    #[msg("Event has not ended yet")]
    EventNotEnded,
    
    #[msg("Cannot close event with outstanding funds")]
    OutstandingFunds,
}
