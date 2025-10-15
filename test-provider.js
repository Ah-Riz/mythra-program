// Quick test to verify provider configuration
require('dotenv').config();

console.log('\n=== Environment Check ===');
console.log('SOLANA_NETWORK:', process.env.SOLANA_NETWORK);
console.log('DEVNET_RPC_URL:', process.env.DEVNET_RPC_URL);
console.log('DEVNET_PROGRAM_ID:', process.env.DEVNET_PROGRAM_ID);
console.log('WALLET_PATH:', process.env.WALLET_PATH);

const { Connection, clusterApiUrl } = require('@solana/web3.js');

async function testConnection() {
  const rpcUrl = process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  
  console.log('\n=== Testing Connection ===');
  console.log('Connecting to:', rpcUrl);
  
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    
    console.log('Getting version...');
    const version = await connection.getVersion();
    console.log('✅ Solana Version:', version['solana-core']);
    
    console.log('\nGetting latest blockhash...');
    const { blockhash } = await connection.getLatestBlockhash();
    console.log('✅ Latest Blockhash:', blockhash.slice(0, 20) + '...');
    
    console.log('\n✅ Connection successful!\n');
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('\nFull error:', error);
  }
}

testConnection();
