/**
 * Contribute to Campaign Component
 * 
 * Allows backers to contribute SOL to crowdfunding campaigns
 */

'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { MythraClient, lamportsToSol } from '../lib/program';

export function ContributeToCampaign() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [loading, setLoading] = useState(false);
  const [loadingCampaign, setLoadingCampaign] = useState(false);
  const [formData, setFormData] = useState({
    eventId: '',
    organizerPubkey: '',
    amount: 5,
  });
  const [campaignInfo, setCampaignInfo] = useState<any>(null);

  const loadCampaignInfo = async () => {
    if (!formData.eventId || !formData.organizerPubkey) {
      alert('Please enter both Event ID and Organizer address');
      return;
    }

    setLoadingCampaign(true);

    try {
      const IDL = null; // Replace with actual IDL
      const client = new MythraClient(connection, wallet as any, IDL);

      const organizer = new PublicKey(formData.organizerPubkey);
      const campaign = await client.getCampaign(organizer, formData.eventId);

      setCampaignInfo({
        ...campaign,
        goalSol: lamportsToSol(campaign.fundingGoal),
        raisedSol: lamportsToSol(campaign.totalRaised),
        percentFunded: (lamportsToSol(campaign.totalRaised) / lamportsToSol(campaign.fundingGoal)) * 100,
      });
    } catch (error) {
      console.error('Error loading campaign:', error);
      alert('Campaign not found. Please check the Event ID and Organizer address.');
      setCampaignInfo(null);
    } finally {
      setLoadingCampaign(false);
    }
  };

  const handleContribute = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      alert('Please connect your wallet!');
      return;
    }

    if (formData.amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      const IDL = null; // Replace with actual IDL
      const client = new MythraClient(connection, wallet as any, IDL);

      const signature = await client.contribute({
        organizer: new PublicKey(formData.organizerPubkey),
        eventId: formData.eventId,
        amount: formData.amount,
      });

      console.log('Contribution successful! Signature:', signature);
      alert(`Contributed ${formData.amount} SOL successfully!\n\nTransaction: ${signature}`);

      // Open explorer
      window.open(
        `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        '_blank'
      );

      // Reload campaign info
      await loadCampaignInfo();
    } catch (error: any) {
      console.error('Error contributing:', error);
      alert(`Error: ${error.message || 'Failed to contribute'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">Contribute to Campaign</h2>

      <div className="space-y-6">
        {/* Campaign Lookup */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Find Campaign</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event ID *
              </label>
              <input
                type="text"
                value={formData.eventId}
                onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
                placeholder="event-123456"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organizer Address *
              </label>
              <input
                type="text"
                value={formData.organizerPubkey}
                onChange={(e) => setFormData({ ...formData, organizerPubkey: e.target.value })}
                placeholder="Organizer's wallet address"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <button
              onClick={loadCampaignInfo}
              disabled={loadingCampaign}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 disabled:bg-gray-400 transition-colors"
            >
              {loadingCampaign ? 'Loading...' : 'Load Campaign Info'}
            </button>
          </div>
        </div>

        {/* Campaign Info Display */}
        {campaignInfo && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-3 text-green-800">Campaign Details</h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Funding Goal:</span>
                <span className="font-semibold">{campaignInfo.goalSol.toFixed(2)} SOL</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Total Raised:</span>
                <span className="font-semibold">{campaignInfo.raisedSol.toFixed(2)} SOL</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Progress:</span>
                <span className="font-semibold">{campaignInfo.percentFunded.toFixed(1)}%</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-semibold capitalize">
                  {Object.keys(campaignInfo.status)[0]}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="pt-2">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-green-600 h-2.5 rounded-full"
                    style={{ width: `${Math.min(campaignInfo.percentFunded, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contribution Form */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contribution Amount (SOL) *
            </label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              min="0.01"
              step="0.1"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum: 0.01 SOL
            </p>
          </div>

          <button
            onClick={handleContribute}
            disabled={loading || !wallet.connected || !campaignInfo}
            className="w-full bg-purple-600 text-white py-3 px-6 rounded-md font-medium hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Contributing...' : `Contribute ${formData.amount} SOL`}
          </button>

          {!wallet.connected && (
            <p className="text-sm text-red-600 text-center">
              Please connect your wallet to contribute
            </p>
          )}

          {!campaignInfo && wallet.connected && (
            <p className="text-sm text-yellow-600 text-center">
              Load campaign info first before contributing
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
