import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import * as dotenv from 'dotenv';

dotenv.config();

class RaydiumTrader {
    private connection: Connection;
    private wallet: Keypair;
    
    // Token addresses
    private HAPPY_ADDRESS = new PublicKey('HAPPYwgFcjEJDzRtfWE6tiHE9zGdzpNky2FvjPHsvvGZ');
    private SOL_ADDRESS = new PublicKey('So11111111111111111111111111111111111111112');
    
    private rpcEndpoints = [
        process.env.HELIUS_RPC!,
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com'
    ];

    constructor() {
        if (!process.env.HELIUS_RPC) {
            throw new Error('Missing HELIUS_RPC in environment variables');
        }
        
        this.connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
        this.wallet = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(process.env.PRIVATE_KEY!))
        );
    }

    async checkPrice() {
        try {
            const pool = await this.getPoolInfo();
            if (!pool) return null;

            // Calculate price from pool data
            const price = pool.price;
            console.log('Current price:', price, 'SOL per HAPPY');
            return price;
        } catch (error) {
            console.error('Error getting price:', error);
            return null;
        }
    }

    async getPoolInfo(): Promise<any> {
        try {
            console.log('Fetching pool info...');
            
            const response = await fetch('https://api.raydium.io/v2/main/pairs');
            const pools = await response.json();
            
            const happyPool = pools.find((pool: any) => 
                pool.baseMint === this.HAPPY_ADDRESS.toString() &&
                pool.quoteMint === this.SOL_ADDRESS.toString()
            );

            if (!happyPool) {
                console.log('HAPPY-SOL pool not found');
                return null;
            }

            console.log('Found HAPPY-SOL pool:', happyPool);
            return happyPool;

        } catch (error) {
            console.error('Error getting pool info:', error);
            return null;
        }
    }

    async swap(amountIn: number, isBuy: boolean) {
        try {
            // 1. Get quote first
            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${this.SOL_ADDRESS.toString()}`+
                `&outputMint=${this.HAPPY_ADDRESS.toString()}`+
                `&amount=${amountIn * 1e9}`+
                `&slippageBps=100`  // 1% slippage
            );
            const quoteData = await quoteResponse.json();
            console.log('Quote data:', quoteData);

            // Check if we have a valid route
            if (!quoteData.outAmount) {
                throw new Error('No valid quote received');
            }

            // 2. Get swap transaction
            const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Send the entire quote response
                    quoteResponse: quoteData,
                    userPublicKey: this.wallet.publicKey.toString(),
                    wrapUnwrapSOL: true
                })
            });

            const swapData = await swapResponse.json();
            console.log('Swap response:', swapData);

            if (!swapData.swapTransaction) {
                throw new Error(`Failed to get swap transaction: ${JSON.stringify(swapData)}`);
            }

            // Use VersionedTransaction instead of Transaction
            const tx = VersionedTransaction.deserialize(
                Buffer.from(swapData.swapTransaction, 'base64')
            );
            tx.sign([this.wallet]);

            const signature = await this.sendWithRetry(tx);
            if (!signature) {
                throw new Error('All RPC endpoints failed');
            }
            console.log('Swap sent:', signature);
            console.log('View transaction: https://solscan.io/tx/' + signature);

            // Extended polling with 120 second timeout
            let timeElapsed = 0;
            while (timeElapsed < 120000) {
                const status = await this.connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                });
                console.log('Transaction status:', status.value?.confirmationStatus);
                
                if (status.value?.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
                }

                if (status.value?.confirmationStatus === 'confirmed' || 
                    status.value?.confirmationStatus === 'finalized') {
                    console.log('Swap confirmed!');
                    return signature;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                timeElapsed += 2000;
            }
            throw new Error('Transaction confirmation timeout');

        } catch (error: any) {
            console.error('Swap failed:', error);
            return null;
        }
    }

    async sendWithRetry(tx: VersionedTransaction) {
        for (const rpc of this.rpcEndpoints) {
            try {
                const connection = new Connection(rpc);
                const signature = await connection.sendTransaction(tx, {
                    skipPreflight: true,
                    maxRetries: 3,
                    preflightCommitment: 'confirmed'
                });
                return signature;
            } catch (e) {
                console.log(`Failed with RPC ${rpc}, trying next...`);
            }
        }
    }

    async retryUntilConfirmed(signature: string, maxAttempts = 5) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const status = await this.connection.getSignatureStatus(signature);
                if (status.value?.confirmationStatus === 'confirmed') return true;
            } catch (e) {
                console.log(`Attempt ${attempt + 1} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    }
}

// Test
async function test() {
    console.log('Starting Raydium test...');
    const trader = new RaydiumTrader();
    
    console.log('\nChecking current price...');
    const price = await trader.checkPrice();
    console.log('Price:', price);

    console.log('\nAttempting to swap 0.001 SOL to HAPPY...');
    await trader.swap(0.001, true);
}

test().catch(console.error);