use anchor_lang::prelude::*;

declare_id!("3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd");

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod mythra_program {
    use super::*;

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: String,
        metadata_uri: String,
        start_ts: i64,
        end_ts: i64,
        total_supply: u32,
        platform_split_bps: u16,
    ) -> Result<()> {
        instructions::create_event::handler(
            ctx,
            event_id,
            metadata_uri,
            start_ts,
            end_ts,
            total_supply,
            platform_split_bps,
        )
    }
    
    pub fn update_event(
        ctx: Context<UpdateEvent>,
        params: UpdateEventParams,
    ) -> Result<()> {
        instructions::update_event::handler(ctx, params)
    }
    
    pub fn create_ticket_tier(
        ctx: Context<CreateTicketTier>,
        tier_id: String,
        metadata_uri: String,
        price_lamports: u64,
        max_supply: u32,
        royalty_bps: u16,
        tier_index: u8,
        resale_enabled: bool,
    ) -> Result<()> {
        instructions::create_ticket_tier::handler(
            ctx,
            tier_id,
            metadata_uri,
            price_lamports,
            max_supply,
            royalty_bps,
            tier_index,
            resale_enabled,
        )
    }
    
    pub fn purchase_ticket(
        ctx: Context<PurchaseTicket>,
    ) -> Result<()> {
        instructions::purchase_ticket::handler(ctx)
    }
    
    pub fn register_mint(
        ctx: Context<RegisterMint>,
    ) -> Result<()> {
        instructions::register_mint::handler(ctx)
    }
    
    pub fn mark_ticket_used(
        ctx: Context<MarkTicketUsed>,
    ) -> Result<()> {
        instructions::mark_ticket_used::handler(ctx)
    }
    
    pub fn mark_ticket_used_ed25519(
        ctx: Context<MarkTicketUsedEd25519>,
        nonce_hash: [u8; 32],
        nonce_value: u64,
    ) -> Result<()> {
        instructions::mark_ticket_used_ed25519::handler(ctx, nonce_hash, nonce_value)
    }
    
    pub fn withdraw_funds(
        ctx: Context<WithdrawFunds>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_funds::handler(ctx, amount)
    }
    
    pub fn refund_ticket(
        ctx: Context<RefundTicket>,
        refund_amount: u64,
    ) -> Result<()> {
        instructions::refund_ticket::handler(ctx, refund_amount)
    }

    pub fn transfer_ticket(
        ctx: Context<TransferTicket>,
        sale_price: Option<u64>,
    ) -> Result<()> {
        instructions::transfer_ticket::handler(ctx, sale_price)
    }
    
    pub fn close_event(ctx: Context<CloseEvent>) -> Result<()> {
        instructions::close_event::handler(ctx)
    }
    
    // Crowdfunding instructions
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        funding_goal: u64,
        deadline: i64,
    ) -> Result<()> {
        instructions::create_campaign::handler(ctx, funding_goal, deadline)
    }
    
    pub fn contribute(
        ctx: Context<Contribute>,
        amount: u64,
    ) -> Result<()> {
        instructions::contribute::handler(ctx, amount)
    }
    
    pub fn finalize_campaign(
        ctx: Context<FinalizeCampaign>,
    ) -> Result<()> {
        instructions::finalize_campaign::handler(ctx)
    }
    
    pub fn claim_refund(
        ctx: Context<ClaimRefund>,
    ) -> Result<()> {
        instructions::claim_refund::handler(ctx)
    }
    
    // Budget & voting instructions
    pub fn submit_budget(
        ctx: Context<SubmitBudget>,
        total_amount: u64,
        description: String,
        milestones: Vec<instructions::submit_budget::MilestoneInput>,
        voting_period_seconds: i64,
    ) -> Result<()> {
        instructions::submit_budget::handler(ctx, total_amount, description, milestones, voting_period_seconds)
    }
    
    pub fn vote_on_budget(
        ctx: Context<VoteOnBudget>,
        approve: bool,
    ) -> Result<()> {
        instructions::vote_on_budget::handler(ctx, approve)
    }
    
    pub fn finalize_budget_vote(
        ctx: Context<FinalizeBudgetVote>,
    ) -> Result<()> {
        instructions::finalize_budget_vote::handler(ctx)
    }
    
    pub fn revise_budget(
        ctx: Context<ReviseBudget>,
        total_amount: u64,
        description: String,
        milestones: Vec<instructions::submit_budget::MilestoneInput>,
        voting_period_seconds: i64,
    ) -> Result<()> {
        instructions::revise_budget::handler(ctx, total_amount, description, milestones, voting_period_seconds)
    }
    
    pub fn release_milestone(
        ctx: Context<ReleaseMilestone>,
        milestone_index: u8,
    ) -> Result<()> {
        instructions::release_milestone::handler(ctx, milestone_index)
    }
    
    pub fn calculate_distribution(
        ctx: Context<CalculateDistribution>,
    ) -> Result<()> {
        instructions::calculate_distribution::handler(ctx)
    }
    
    pub fn claim_backer_profit(
        ctx: Context<ClaimBackerProfit>,
    ) -> Result<()> {
        instructions::claim_backer_profit::handler(ctx)
    }
    
    pub fn claim_organizer_profit(
        ctx: Context<ClaimOrganizerProfit>,
    ) -> Result<()> {
        instructions::claim_organizer_profit::handler(ctx)
    }
}
