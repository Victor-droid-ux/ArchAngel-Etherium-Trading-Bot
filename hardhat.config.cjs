import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

const { ETHERSCAN_API_KEY, PRIVATE_KEY, ALCHEMY_API_URL } = process.env;

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    mainnet: {
      url: ALCHEMY_API_URL,
      accounts: [PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
