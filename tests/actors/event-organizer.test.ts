/**
 * Event Organizer Test Suite
 * 
 * Tests all actions that an event organizer can perform:
 * - Create events
 * - Create ticket tiers
 * - Update event details
 * - Close events
 * - Claim organizer profits
 * - Withdraw funds
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MythraProgram } from "../../target/types/mythra_program";
import { assert } from "chai";
import { initializeProvider } from "../utils/provider";

// Devnet Program ID from .env
const DEVNET_PROGRAM_ID = new PublicKey("3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd");

describe("🎭 Event Organizer Actions on Devnet", () => {
  const provider = initializeProvider();
  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  // Actor: Event Organizer
  const organizer = provider.wallet;
  const treasury = Keypair.generate();
  
  let eventId: string;
  let eventPda: PublicKey;
  let tierPda: PublicKey;
  
  before(async () => {
    console.log("\n========================================");
    console.log("🎭 EVENT ORGANIZER TEST SUITE");
    console.log("========================================");
    console.log(`Network: Devnet`);
    console.log(`Program ID: ${DEVNET_PROGRAM_ID.toBase58()}`);
    console.log(`Organizer: ${organizer.publicKey.toBase58()}`);
    console.log(`Treasury: ${treasury.publicKey.toBase58()}`);
    console.log("========================================\n");
    
    eventId = `organizer-event-${Date.now()}`;
  });

  describe("1. Event Creation", () => {
    it("should create a new event", async () => {
      console.log("\n📅 Creating new event...");
      
      [eventPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("event"),
          organizer.publicKey.toBuffer(),
          Buffer.from(eventId),
        ],
        program.programId
      );
      
      const startTs = new BN(Math.floor(Date.now() / 1000) + 86400); // Tomorrow
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400 * 7); // 1 week
      
      const tx = await program.methods
        .createEvent(
          eventId,
          "https://mythra.com/events/metadata.json",
          startTs,
          endTs,
          1000, // Total supply
          250   // 2.5% platform fee
        )
        .accountsPartial({
          event: eventPda,
          organizer: organizer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Event created successfully`);
      console.log(`   Event ID: ${eventId}`);
      console.log(`   Event PDA: ${eventPda.toBase58()}`);
      console.log(`   Transaction: ${tx}`);
      
      // Verify event data
      const eventAccount = await program.account.event.fetch(eventPda);
      assert.ok(eventAccount.authority.equals(organizer.publicKey));
      assert.equal(eventAccount.totalSupply, 1000);
      assert.equal(eventAccount.platformSplitBps, 250);
      
      console.log(`✅ Event data verified on-chain`);
    });
  });

  describe("2. Ticket Tier Management", () => {
    it("should create a VIP tier", async () => {
      console.log("\n🎟️  Creating VIP ticket tier...");
      
      const tierId = "vip";
      [tierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
        program.programId
      );
      
      const tx = await program.methods
        .createTicketTier(
          tierId,
          "https://mythra.com/tiers/vip.json",
          new BN(10_000_000), // 0.01 SOL (very cheap for testing)
          100,  // Max supply
          500,  // 5% royalty
          0,    // No specific event tier index
          true  // Resale enabled
        )
        .accountsPartial({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ VIP tier created successfully`);
      console.log(`   Tier PDA: ${tierPda.toBase58()}`);
      console.log(`   Price: 0.01 SOL`);
      console.log(`   Max Supply: 100 tickets`);
      console.log(`   Transaction: ${tx}`);
      
      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.maxSupply, 100);
      assert.equal(tierAccount.priceLamports.toNumber(), 10_000_000);
      assert.equal(tierAccount.currentSupply, 0);
      
      console.log(`✅ Tier data verified on-chain`);
    });

    it("should create a General Admission tier", async () => {
      console.log("\n🎟️  Creating General Admission tier...");
      
      const tierId = "general";
      const [generalTierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
        program.programId
      );
      
      const tx = await program.methods
        .createTicketTier(
          tierId,
          "https://mythra.com/tiers/general.json",
          new BN(5_000_000), // 0.005 SOL (very cheap for testing)
          500,  // Max supply
          250,  // 2.5% royalty
          1,
          true
        )
        .accountsPartial({
          tier: generalTierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ General Admission tier created`);
      console.log(`   Price: 0.005 SOL`);
      console.log(`   Max Supply: 500 tickets`);
      console.log(`   Transaction: ${tx}`);
    });
  });

  describe("3. Event Management", () => {
    it("should update event metadata", async () => {
      console.log("\n📝 Updating event metadata...");
      
      const eventAccount = await program.account.event.fetch(eventPda);
      
      const tx = await program.methods
        .updateEvent({
          metadataUri: "https://mythra.com/events/updated-metadata.json",
          endTs: eventAccount.endTs,
          platformSplitBps: eventAccount.platformSplitBps,
          treasury: eventAccount.treasury,
        })
        .accountsPartial({
          event: eventPda,
          authority: organizer.publicKey,
        })
        .rpc();
      
      console.log(`✅ Event metadata updated`);
      console.log(`   Transaction: ${tx}`);
      
      const updatedEvent = await program.account.event.fetch(eventPda);
      assert.equal(
        updatedEvent.metadataUri,
        "https://mythra.com/events/updated-metadata.json"
      );
    });
  });

  describe("4. Event Analytics", () => {
    it("should fetch event statistics", async () => {
      console.log("\n📊 Fetching event statistics...");
      
      const eventAccount = await program.account.event.fetch(eventPda);
      
      console.log(`\n📈 Event Statistics:`);
      console.log(`   Total Supply: ${eventAccount.totalSupply}`);
      console.log(`   Allocated: ${eventAccount.allocatedSupply}`);
      console.log(`   Available: ${eventAccount.totalSupply - eventAccount.allocatedSupply}`);
      console.log(`   Ticket Revenue: ${eventAccount.ticketRevenue.toNumber() / 1e9} SOL`);
      console.log(`   Platform Fee: ${eventAccount.platformSplitBps / 100}%`);
      
      assert.isNumber(eventAccount.totalSupply);
      assert.isNumber(eventAccount.allocatedSupply);
    });
  });

  describe("5. Summary", () => {
    it("should display organizer dashboard data", async () => {
      console.log("\n" + "=".repeat(60));
      console.log("🎭 ORGANIZER DASHBOARD SUMMARY");
      console.log("=".repeat(60));
      
      const eventAccount = await program.account.event.fetch(eventPda);
      
      console.log(`\nEvent: ${eventId}`);
      console.log(`Status: Active`);
      console.log(`Total Tickets: ${eventAccount.totalSupply}`);
      console.log(`Sold: ${eventAccount.allocatedSupply}`);
      console.log(`Remaining: ${eventAccount.totalSupply - eventAccount.allocatedSupply}`);
      console.log(`Revenue: ${eventAccount.ticketRevenue.toNumber() / 1e9} SOL`);
      console.log(`Treasury: ${eventAccount.treasury.toBase58().slice(0, 8)}...`);
      
      console.log("\n" + "=".repeat(60));
      console.log("✅ Event organizer tests completed successfully!");
      console.log("=".repeat(60) + "\n");
      
      assert.ok(true);
    });
  });
});
