# ArchAngel Bot

## Overview

ArchAngel Bot is an autonomous trading bot for monitoring and executing trades on Uniswap using Ethers.js. It features a web dashboard, Solidity smart contracts, and automated trading logic.

## Project Structure

- `contracts/` — Solidity smart contracts
- `artifacts/` — Compiled contract artifacts
- `components/` — React components for the dashboard
- `pages/` — Next.js pages
- `scripts/` — Deployment and utility scripts
- `server.js` — Express + Socket.io backend
- `bot.js` — Main trading bot logic

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with required environment variables (see `.env.example` if available).
3. Compile contracts:
   ```bash
   npx hardhat compile
   ```
4. Deploy contracts:
   ```bash
   npm run deploy
   ```
5. Start backend:
   ```bash
   node server.js
   ```
6. Start frontend:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — Start Next.js frontend
- `npm run build` — Build frontend
- `npm run start` — Start production frontend
- `npm run deploy` — Deploy contracts to mainnet

## Testing

No automated tests are present. Add tests in a `test/` folder using Hardhat or your preferred framework.

## License

ISC
