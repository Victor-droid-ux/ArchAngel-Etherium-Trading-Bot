const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const router = process.env.ARCHANGEL_ROUTER; // Uniswap V2 router
  const factory = process.env.ARCHANGEL_FACTORY; // Uniswap V2 factory
  const priceFeed = process.env.CHAINLINK_ETH_USD; // Chainlink ETH/USD
  const minLiquidityInWeth =
    process.env.MIN_LIQUID_WEI || "2000000000000000000"; // wei
  const buyUsdAmount = Number(process.env.BUY_USD_AMOUNT || 10);
  const profitPercent = Number(process.env.PROFIT_PERCENT || 20);
  const maxActivePositions = Number(process.env.MAX_ACTIVE_POSITIONS || 10);

  const ArchAngel = await hre.ethers.getContractFactory("ArchAngel");
  console.log("Deploying ArchAngel...");
  const arch = await ArchAngel.deploy(
    router,
    factory,
    priceFeed,
    minLiquidityInWeth,
    buyUsdAmount,
    profitPercent,
    maxActivePositions
  );

  (await arch.waitForDeployment)
    ? await arch.waitForDeployment()
    : await arch.deployed(); // ethers v6/v5 compatibility
  const address = arch.target || arch.address;
  console.log("✅ ArchAngel deployed at:", address);

  console.log("If you need to fund the contract, send ETH to:", address);
  console.log("Now you can verify:");
  console.log(
    `npx hardhat verify --network <network> ${address} "${router}" "${factory}" "${priceFeed}" ${minLiquidityInWeth} ${buyUsdAmount} ${profitPercent} ${maxActivePositions}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
