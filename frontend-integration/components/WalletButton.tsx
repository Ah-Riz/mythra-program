/**
 * Wallet Connect Button Component
 * 
 * Simple wrapper around WalletMultiButton with custom styling
 */

'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function WalletButton() {
  return (
    <div className="flex items-center gap-4">
      <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 transition-colors" />
    </div>
  );
}

/**
 * You can also create a custom wallet button with more control
 */
export function CustomWalletButton() {
  const wallet = useWallet();

  if (!wallet.connected) {
    return (
      <button
        onClick={() => wallet.select(wallet.wallets[0]?.adapter.name)}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="px-4 py-2 bg-gray-100 rounded-md">
        <p className="text-sm font-mono">
          {wallet.publicKey?.toString().slice(0, 4)}...
          {wallet.publicKey?.toString().slice(-4)}
        </p>
      </div>
      <button
        onClick={() => wallet.disconnect()}
        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
}

// Don't forget to import useWallet for CustomWalletButton
import { useWallet } from '@solana/wallet-adapter-react';
