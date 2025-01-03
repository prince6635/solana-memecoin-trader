import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import * as dotenv from 'dotenv';

dotenv.config();

class SimpleTrader {
    private connection: Connection;
    private wallet: Keypair;
    
    // Token addresses
    private HAPPY_ADDRESS = 'HAPPYwgFcjEJDzRtfWE6tiHE9zGdzpNky2FvjPHsvvGZ';
    private SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
    
    constructor() {
        this.connection = new Connection(process.env.RPC_ENDPOINT!, 'confirmed');
        this.wallet = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(process.env.PRIVATE_KEY!))
        );
    }

    async checkWalletAccess() {
        try {
            // Check SOL balance
            const balance = await this.connection.getBalance(this.wallet.publicKey);
            console.log('Wallet public key:', this.wallet.publicKey.toString());
            console.log('SOL Balance:', balance / 1e9, 'SOL');

            // Verify it matches your address
            const expectedAddress = '5iR1c9KxvGLaeWzCCw8wPPbU5Bw7Vdpau56QpJwj8FB8';
            if (this.wallet.publicKey.toString() !== expectedAddress) {
                console.error('WARNING: Wallet address mismatch!');
                console.error('Expected:', expectedAddress);
                console.error('Got:', this.wallet.publicKey.toString());
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error checking wallet access:', error);
            return false;
        }
    }

    // async getPrice() {
    //     try {
    //         const response = await fetch(
    //             `https://price.jup.ag/v4/price?ids=${this.HAPPY_ADDRESS}`
    //         );
    //         const data = await response.json();
    //         console.log('Price data:', data.data[this.HAPPY_ADDRESS]);
    //         return data.data[this.HAPPY_ADDRESS].price;
    //     } catch (error) {
    //         console.error('Error getting price:', error);
    //         return null;
    //     }
    // }

    async getPrice() {
        try {
            const response = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${this.SOL_ADDRESS}&outputMint=${this.HAPPY_ADDRESS}&amount=1000000000`
            );
            const data = await response.json();
            console.log('Price data:', data);
            return data.data?.outAmount ? Number(data.data.outAmount) / 1e6 : null;
        } catch (error) {
            console.error('Error getting price:', error);
            return null;
        }
    }

    async transferSOL(toAddress: string, amount: number) {
        try {
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: this.wallet.publicKey,
                    toPubkey: new PublicKey(toAddress),
                    lamports: amount * 1e9
                })
            );

            const signature = await this.connection.sendTransaction(
                transaction,
                [this.wallet],
                {
                    preflightCommitment: 'confirmed'
                }
            );
            console.log('Transfer sent:', signature);

            // Extended polling with 60 second timeout
            let timeElapsed = 0;
            while (timeElapsed < 60000) {
                const status = await this.connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                });
                console.log('Transaction status:', status.value?.confirmationStatus);
                
                if (status.value?.confirmationStatus === 'confirmed' || 
                    status.value?.confirmationStatus === 'finalized') {
                    console.log('Transfer confirmed!');
                    return signature;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                timeElapsed += 2000;
            }
            throw new Error('Transaction confirmation timeout');

        } catch (error) {
            console.error('Transfer failed:', error);
            return null;
        }
    }

    async swap(inputAmount: number, isBuy: boolean) {
        try {
            console.log(`\nStarting ${isBuy ? 'buy' : 'sell'} swap...`);
            console.log(`Input amount: ${inputAmount} ${isBuy ? 'SOL' : 'HAPPY'}`);

            // 1. Get quote
            console.log('Getting quote...');
            const response = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${isBuy ? this.SOL_ADDRESS : this.HAPPY_ADDRESS}`+
                `&outputMint=${isBuy ? this.HAPPY_ADDRESS : this.SOL_ADDRESS}`+
                `&amount=${inputAmount * (isBuy ? 1e9 : 1e6)}`+
                `&slippageBps=50`
            );
            const quoteResponse = await response.json();
            console.log('Quote received:', quoteResponse);

            // 2. Get swap transaction
            console.log('Getting swap transaction...');
            const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse,
                    userPublicKey: this.wallet.publicKey.toString(),
                    wrapUnwrapSOL: true
                })
            });
            const { swapTransaction } = await swapResponse.json();

            // Decode and verify transaction
            const tx = VersionedTransaction.deserialize(
                Buffer.from(swapTransaction, 'base64')
            );
            
            // Log transaction details
            console.log('Transaction details:');
            console.log('- Version:', tx.version);
            console.log('- Instructions:', tx.message.compiledInstructions.length);
            console.log('- Blockhash:', tx.message.recentBlockhash);

            // Sign and send with recent blockhash
            const latestBlockhash = await this.connection.getLatestBlockhash();
            tx.message.recentBlockhash = latestBlockhash.blockhash;
            tx.sign([this.wallet]);

            const signature = await this.connection.sendTransaction(tx, {
                skipPreflight: false,  // Changed to false to catch errors early
                maxRetries: 3,
                preflightCommitment: 'confirmed'
            });
            console.log('Swap sent:', signature);
            console.log('View transaction: https://solscan.io/tx/' + signature);

            // Check immediate status
            const status = await this.connection.getSignatureStatus(signature);
            console.log('Initial status:', status);

            if (status.value?.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
            }

            // Extended polling with 120 second timeout
            let timeElapsed = 0;
            while (timeElapsed < 120000) {
                const status = await this.connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                });
                console.log('Transaction status:', status.value?.confirmationStatus, 
                           status.value?.err ? `Error: ${JSON.stringify(status.value.err)}` : '');
                
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
            console.error('Swap failed with error:', error);
            if (error.logs) console.error('Error logs:', error.logs);
            return null;
        }
    }

    async startTrading() {
        while (true) {
            try {
                const price = await this.getPrice();
                console.log('Current HAPPY price:', price);

                if (price !== null) {
                    // Simple strategy example
                    if (price < 0.00001) {
                        console.log('Buying HAPPY...');
                        await this.swap(0.1, true);
                    } else if (price > 0.00002) {
                        console.log('Selling HAPPY...');
                        await this.swap(100000, false);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 60000));
            } catch (error) {
                console.error('Trading error:', error);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }
}

// Test
async function test() {
    // Uncomment to start trading:
    // await trader.startTrading();

    console.log('Starting test...');  // Add this line
    const trader = new SimpleTrader();

    // Verify wallet access first
    console.log('\nVerifying wallet access...');
    const hasAccess = await trader.checkWalletAccess();
    
    if (!hasAccess) {
        console.error('Wallet access verification failed!');
        return;
    }

    console.log('Checking price...');
    await trader.getPrice();

    // Transfer 0.001 SOL
    // console.log('\nTransferring 0.001 SOL...');
    // await trader.transferSOL('6MxvAp9MMZm8DPeGC3F6bPH58Zcac7211Ry1z1c7nTMm', 0.001);

    console.log('Attempting swap of 0.001 SOL to HAPPY...');
    await trader.swap(0.001, true);  // Swap 0.001 SOL to HAPPY

    console.log('Test completed');    // Add this line
}

test().catch(console.error); 