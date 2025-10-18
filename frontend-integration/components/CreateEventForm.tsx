/**
 * Create Event Form Component
 * 
 * This component allows organizers to create new events
 */

'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { MythraClient } from '../lib/program';

// Import your IDL
// import IDL from '../lib/idl/mythra_program.json';

export function CreateEventForm() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    eventId: '',
    metadataUri: '',
    totalSupply: 100,
    startDate: '',
    endDate: '',
    platformFee: 5, // 5%
    treasury: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.publicKey || !wallet.signTransaction) {
      alert('Please connect your wallet!');
      return;
    }

    setLoading(true);

    try {
      // Initialize client (you need to import IDL)
      const IDL = null; // Replace with actual IDL
      const client = new MythraClient(connection, wallet as any, IDL);

      // Generate event ID if not provided
      const eventId = formData.eventId || `event-${Date.now()}`;

      // Convert dates to unix timestamps
      const startTs = Math.floor(new Date(formData.startDate).getTime() / 1000);
      const endTs = Math.floor(new Date(formData.endDate).getTime() / 1000);

      // Platform fee in basis points
      const platformSplitBps = formData.platformFee * 100;

      // Create event
      const signature = await client.createEvent({
        eventId,
        metadataUri: formData.metadataUri,
        startTs,
        endTs,
        totalSupply: formData.totalSupply,
        platformSplitBps,
        treasury: new PublicKey(formData.treasury),
      });

      console.log('Event created! Signature:', signature);
      alert(`Event created successfully!\n\nEvent ID: ${eventId}\nTransaction: ${signature}`);

      // Open explorer
      window.open(
        `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        '_blank'
      );

      // Reset form
      setFormData({
        eventId: '',
        metadataUri: '',
        totalSupply: 100,
        startDate: '',
        endDate: '',
        platformFee: 5,
        treasury: '',
      });
    } catch (error: any) {
      console.error('Error creating event:', error);
      alert(`Error: ${error.message || 'Failed to create event'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">Create Event</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Event ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Event ID (optional)
          </label>
          <input
            type="text"
            value={formData.eventId}
            onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
            placeholder="Auto-generated if empty"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Unique identifier for your event
          </p>
        </div>

        {/* Metadata URI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Metadata URI *
          </label>
          <input
            type="url"
            value={formData.metadataUri}
            onChange={(e) => setFormData({ ...formData, metadataUri: e.target.value })}
            placeholder="https://example.com/event-metadata.json"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            JSON file containing event details, images, etc.
          </p>
        </div>

        {/* Total Supply */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Total Tickets *
          </label>
          <input
            type="number"
            value={formData.totalSupply}
            onChange={(e) => setFormData({ ...formData, totalSupply: Number(e.target.value) })}
            min="1"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Date & Time *
          </label>
          <input
            type="datetime-local"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date & Time *
          </label>
          <input
            type="datetime-local"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Platform Fee */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Platform Fee (%)
          </label>
          <input
            type="number"
            value={formData.platformFee}
            onChange={(e) => setFormData({ ...formData, platformFee: Number(e.target.value) })}
            min="0"
            max="100"
            step="0.1"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Percentage of ticket sales that goes to the platform
          </p>
        </div>

        {/* Treasury */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Treasury Address *
          </label>
          <input
            type="text"
            value={formData.treasury}
            onChange={(e) => setFormData({ ...formData, treasury: e.target.value })}
            placeholder="Treasury public key"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Wallet address where platform fees will be sent
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !wallet.connected}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating Event...' : 'Create Event'}
        </button>

        {!wallet.connected && (
          <p className="text-sm text-red-600 text-center">
            Please connect your wallet to create an event
          </p>
        )}
      </form>
    </div>
  );
}
