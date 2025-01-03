# Solana Memecoin Trader

An automated trading bot for Solana memecoins using Jupiter and Raydium DEX aggregators.

## Features

- SOL transfer functionality
- Token swaps via Jupiter/Raydium
- Price checking
- Multiple RPC endpoint support
- Transaction retry mechanisms


## Configuration

- Default slippage: 1%
- Transaction timeout: 120 seconds
- Multiple RPC fallbacks configured

## Security

- Never commit your `.env` file
- Keep your private keys secure
- Use test amounts first

## Dependencies

- @solana/web3.js
- @raydium-io/raydium-sdk
- dotenv