use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use anchor_lang::solana_program::ed25519_program;
use crate::errors::EventError;
use crate::state::{Ticket, Nonce};

#[derive(Accounts)]
#[instruction(nonce_hash: [u8; 32])]
pub struct MarkTicketUsedEd25519<'info> {
    #[account(
        mut,
        seeds = [b"ticket", ticket.mint.as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,
    
    #[account(
        init,
        payer = payer,
        space = Nonce::SPACE,
        seeds = [b"nonce", ticket.key().as_ref(), nonce_hash.as_ref()],
        bump
    )]
    pub nonce: Account<'info, Nonce>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// CHECK: Gate operator/scanner who is marking the ticket as used
    pub gate_operator: AccountInfo<'info>,
    
    /// CHECK: Sysvar for instruction introspection
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MarkTicketUsedEd25519>,
    nonce_hash: [u8; 32],
    nonce_value: u64,
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let nonce = &mut ctx.accounts.nonce;
    let clock = Clock::get()?;
    
    // Validation: ticket must not already be used
    require!(
        !ticket.used,
        EventError::TicketAlreadyUsed
    );
    
    // Verify ed25519 signature from pre-instruction
    verify_ed25519_signature(
        &ctx.accounts.instructions,
        &ticket.owner,
        &nonce_hash,
        nonce_value,
    )?;
    
    // Initialize nonce
    nonce.ticket = ticket.key();
    nonce.nonce_hash = nonce_hash;
    nonce.used = false;
    nonce.created_at = clock.unix_timestamp;
    nonce.expires_at = clock.unix_timestamp + Nonce::DEFAULT_EXPIRY_SECONDS;
    nonce.bump = ctx.bumps.nonce;
    
    // Check nonce is not expired
    require!(
        !nonce.is_expired(clock.unix_timestamp),
        EventError::NonceExpired
    );
    
    // Check nonce is not used
    require!(
        !nonce.used,
        EventError::NonceUsed
    );
    
    // Mark ticket and nonce as used
    ticket.used = true;
    ticket.checked_in_ts = clock.unix_timestamp;
    ticket.gate_operator = ctx.accounts.gate_operator.key();
    nonce.used = true;
    
    // Emit TicketUsed event
    emit!(TicketUsedWithNonce {
        ticket_pubkey: ticket.key(),
        owner: ticket.owner,
        mint: ticket.mint,
        event: ticket.event,
        tier: ticket.tier,
        gate_operator: ticket.gate_operator,
        checked_in_ts: ticket.checked_in_ts,
        nonce_hash,
    });
    
    msg!("Ticket marked as used with ed25519 verification");
    msg!("Ticket: {}", ticket.key());
    msg!("Owner: {}", ticket.owner);
    msg!("Nonce: {:?}", nonce_hash);
    msg!("Checked in at: {}", ticket.checked_in_ts);
    
    Ok(())
}

/// Verify ed25519 signature from the Ed25519Program instruction
fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    nonce_hash: &[u8; 32],
    nonce_value: u64,
) -> Result<()> {
    // Load the current instruction index
    let current_index = load_current_index_checked(instructions_sysvar)?;
    
    // Ed25519 instruction should be immediately before this instruction
    if current_index == 0 {
        return Err(EventError::Ed25519InstructionMissing.into());
    }
    
    let ed25519_ix_index = (current_index - 1) as u8;
    let ed25519_ix = load_instruction_at_checked(ed25519_ix_index as usize, instructions_sysvar)?;
    
    // Verify it's the Ed25519Program
    require!(
        ed25519_ix.program_id == ed25519_program::ID,
        EventError::Ed25519InstructionMissing
    );
    
    // Parse Ed25519 instruction data
    // Format: [num_signatures: u8, padding: u8, signature_offset: u16, signature_instruction_index: u16,
    //          public_key_offset: u16, public_key_instruction_index: u16, message_data_offset: u16,
    //          message_data_size: u16, message_instruction_index: u16]
    require!(
        ed25519_ix.data.len() >= 112, // Minimum size for ed25519 instruction
        EventError::InvalidSignature
    );
    
    // Extract public key (32 bytes at offset 16)
    let pubkey_bytes = &ed25519_ix.data[16..48];
    let pubkey = Pubkey::try_from(pubkey_bytes)
        .map_err(|_| EventError::InvalidSignature)?;
    
    // Verify public key matches expected signer
    require!(
        pubkey == *expected_signer,
        EventError::InvalidSignature
    );
    
    // Extract signature (64 bytes at offset 48)
    let signature = &ed25519_ix.data[48..112];
    
    // Extract message (should contain nonce_hash and nonce_value)
    let message_data_offset = u16::from_le_bytes([ed25519_ix.data[12], ed25519_ix.data[13]]) as usize;
    let message_data_size = u16::from_le_bytes([ed25519_ix.data[14], ed25519_ix.data[15]]) as usize;
    
    require!(
        message_data_offset + message_data_size <= ed25519_ix.data.len(),
        EventError::InvalidSignature
    );
    
    let message = &ed25519_ix.data[message_data_offset..message_data_offset + message_data_size];
    
    // Verify message contains nonce_hash and nonce_value
    require!(
        message.len() >= 40, // 32 bytes nonce_hash + 8 bytes nonce_value
        EventError::InvalidSignature
    );
    
    let msg_nonce_hash = &message[0..32];
    let msg_nonce_value = u64::from_le_bytes(message[32..40].try_into().unwrap());
    
    require!(
        msg_nonce_hash == nonce_hash,
        EventError::InvalidSignature
    );
    
    require!(
        msg_nonce_value == nonce_value,
        EventError::InvalidSignature
    );
    
    msg!("Ed25519 signature verified successfully");
    msg!("Signer: {}", pubkey);
    msg!("Signature: {:?}", &signature[0..8]); // Log first 8 bytes
    
    Ok(())
}

/// Load current instruction index from instructions sysvar
fn load_current_index_checked(instructions_sysvar: &AccountInfo) -> Result<usize> {
    let data = instructions_sysvar.try_borrow_data()?;
    let index_bytes: [u8; 2] = data.get(0..2)
        .ok_or(EventError::Ed25519InstructionMissing)?
        .try_into()
        .map_err(|_| EventError::Ed25519InstructionMissing)?;
    let current_index = u16::from_le_bytes(index_bytes) as usize;
    Ok(current_index)
}

#[event]
pub struct TicketUsedWithNonce {
    pub ticket_pubkey: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub event: Pubkey,
    pub tier: Pubkey,
    pub gate_operator: Pubkey,
    pub checked_in_ts: i64,
    pub nonce_hash: [u8; 32],
}
