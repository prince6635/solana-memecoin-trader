import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as dotenv from 'dotenv';

dotenv.config();

async function runTests() {
    console.log('🧪 Starting basic connectivity tests...');

    try {
        // Test 1: RPC Connection
        console.log('\n1️⃣ Testing RPC connection...');
        const connection = new Connection(process.env.RPC_ENDPOINT!, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
            fetch: (url, options) => {
                console.log('🔍 RPC Request:', url);
                return fetch(url, options);
            }
        });
        const version = await connection.getVersion();
        console.log('✅ RPC Connected! Solana version:', version['solana-core']);

        // Test 2: Wallet Loading
        console.log('\n2️⃣ Testing wallet loading...');
        const wallet = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(process.env.PRIVATE_KEY!))
        );
        console.log('✅ Wallet loaded! Address:', wallet.publicKey.toString());

        // Test 3: Account Balance
        console.log('\n3️⃣ Testing SOL balance...');
        const balance = await connection.getBalance(wallet.publicKey);
        console.log('✅ Balance:', balance / 1e9, 'SOL');

        // Test 4: Token Account
        console.log('\n4️⃣ Testing token account...');
        const tokenAddress = new PublicKey(process.env.TOKEN_ADDRESS!);
        try {
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                connection,
                wallet,
                tokenAddress,
                wallet.publicKey
            );
            console.log('✅ Token account found:', tokenAccount.address.toString());
        } catch (error) {
            console.log('❌ Error checking token account:', error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run tests
console.log('🚀 Starting test suite...');
runTests().then(() => console.log('\n✨ Tests completed!')); 