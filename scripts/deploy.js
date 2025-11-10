import hre from "hardhat";
import dotenv from "dotenv";
dotenv.config();

function getEnvAddress(key) {
  const value = process.env[key];
  if (!value) throw new Error(`❌ Missing environment variable: ${key}`);
  try {
    // Validate Ethereum address
    return hre.ethers.getAddress(value);
  } catch {
    throw new Error(`❌ Invalid Ethereum address in ${key}: ${value}`);
  }
}

async function main() {
  console.log("🚀 Starting ArchAngel deployment...");

  // Validate and load essential addresses
  const ARCHANGEL_ROUTER = getEnvAddress("ARCHANGEL_ROUTER");
  const ARCHANGEL_FACTORY = getEnvAddress("ARCHANGEL_FACTORY");
  const CHAINLINK_ETH_USD = getEnvAddress("CHAINLINK_ETH_USD");

  // Optional numeric parameters with defaults
  const minLiquidityInWeth =
    process.env.MIN_LIQUIDITY_WEI || "2000000000000000000"; // 2 ETH in Wei
  const buyUsdAmount = Number(process.env.BUY_USD_AMOUNT || 10);
  const profitPercent = Number(process.env.PROFIT_PERCENT || 20);
  const maxActivePositions = Number(process.env.MAX_ACTIVE_POSITIONS || 10);

  console.log("📌 Configuration:");
  console.log({
    ARCHANGEL_ROUTER,
    ARCHANGEL_FACTORY,
    CHAINLINK_ETH_USD,
    minLiquidityInWeth,
    buyUsdAmount,
    profitPercent,
    maxActivePositions,
  });

  // Deploy contract
  const ArchAngel = await hre.ethers.getContractFactory("ArchAngel");
  const arch = await ArchAngel.deploy(
    ARCHANGEL_ROUTER,
    ARCHANGEL_FACTORY,
    CHAINLINK_ETH_USD,
    minLiquidityInWeth,
    buyUsdAmount,
    profitPercent,
    maxActivePositions
  );

  await arch.waitForDeployment();
  const address = arch.target || arch.address;

  console.log(`✅ ArchAngel deployed successfully at: ${address}`);
  console.log("💰 To fund the contract, send ETH to:", address);

  console.log("\n🔍 Verify on Etherscan:");
  console.log(
    `npx hardhat verify --network mainnet ${address} "${ARCHANGEL_ROUTER}" "${ARCHANGEL_FACTORY}" "${CHAINLINK_ETH_USD}" ${minLiquidityInWeth} ${buyUsdAmount} ${profitPercent} ${maxActivePositions}`
  );
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
