use anchor_lang::prelude::*;
use crate::state::{Campaign, CampaignStatus, Event};
use crate::errors::EventError;

/// Calculate profit distribution after event ends
/// 
/// This instruction calculates the profit (revenue - expenses) and splits it:
/// - 60% to backer pool (proportional to contributions)
/// - 35% to organizer pool
/// - 5% to platform pool
/// 
/// If there's a loss (expenses > revenue), no distribution occurs.
pub fn handler(ctx: Context<CalculateDistribution>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let event = &ctx.accounts.event;
    let clock = Clock::get()?;
    
    // Validation: Campaign must be funded
    require!(
        campaign.status == CampaignStatus::Funded,
        EventError::CampaignNotFunded
    );
    
    // Validation: Event must have ended
    require!(
        clock.unix_timestamp > event.end_ts,
        EventError::EventNotEnded
    );
    
    // Validation: Distribution not already calculated
    require!(
        !campaign.distribution_complete,
        EventError::DistributionAlreadyComplete
    );
    
    // Update revenue from event ticket sales
    campaign.total_revenue = event.ticket_revenue;
    
    // Calculate profit or loss
    let revenue = campaign.total_revenue;
    let expenses = campaign.total_expenses;
    
    msg!("Revenue: {} lamports", revenue);
    msg!("Expenses: {} lamports", expenses);
    
    if revenue > expenses {
        // PROFIT scenario
        let profit = revenue
            .checked_sub(expenses)
            .ok_or(EventError::ArithmeticOverflow)?;
        
        msg!("Profit: {} lamports", profit);
        
        // Split profit: 60% backers, 35% organizer, 5% platform
        let backer_pool = profit
            .checked_mul(60)
            .ok_or(EventError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(EventError::ArithmeticOverflow)?;
        
        let organizer_pool = profit
            .checked_mul(35)
            .ok_or(EventError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(EventError::ArithmeticOverflow)?;
        
        let platform_pool = profit
            .checked_mul(5)
            .ok_or(EventError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(EventError::ArithmeticOverflow)?;
        
        let distributed = backer_pool
    .checked_add(organizer_pool)
    .ok_or(EventError::ArithmeticOverflow)?
    .checked_add(platform_pool)
    .ok_or(EventError::ArithmeticOverflow)?;

    let remainder = profit
        .checked_sub(distributed)
        .ok_or(EventError::ArithmeticOverflow)?;

    // Give remainder to backers
    let backer_pool = backer_pool
        .checked_add(remainder)
        .ok_or(EventError::ArithmeticOverflow)?;

    campaign.backer_pool = backer_pool;
    campaign.organizer_pool = organizer_pool;
    campaign.platform_pool = platform_pool;

    msg!("Backer pool (60% + remainder): {} lamports", backer_pool);
    msg!("Organizer pool (35%): {} lamports", organizer_pool);
    msg!("Platform pool (5%): {} lamports", platform_pool);
    msg!("Remainder allocated to backers: {} lamports", remainder);
    } else {
        // LOSS scenario - no profit to distribute
        let loss = expenses
            .checked_sub(revenue)
            .ok_or(EventError::ArithmeticOverflow)?;
        
        msg!("Loss: {} lamports (no profit to distribute)", loss);
        
        campaign.backer_pool = 0;
        campaign.organizer_pool = 0;
        campaign.platform_pool = 0;
    }
    
    campaign.distribution_complete = true;
    campaign.status = CampaignStatus::Completed;
    
    msg!("Distribution calculated successfully");
    
    Ok(())
}

#[derive(Accounts)]
pub struct CalculateDistribution<'info> {
    /// Campaign account to calculate distribution for
    #[account(
        mut,
        constraint = campaign.status == CampaignStatus::Funded @ EventError::CampaignNotFunded
    )]
    pub campaign: Account<'info, Campaign>,
    
    /// Event account (to check end time and get ticket revenue)
    #[account(
        constraint = event.key() == campaign.event @ EventError::InvalidEvent,
        constraint = event.campaign == Some(campaign.key()) @ EventError::InvalidCampaign
    )]
    pub event: Account<'info, Event>,
    
    /// Authority (organizer or platform admin can trigger this)
    pub authority: Signer<'info>,
}
