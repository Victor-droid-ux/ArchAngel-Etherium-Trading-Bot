// autoBuy.js
import { ethers } from "ethers";

async function autoBuy(pairAddress, wallet, provider) {
  try {
    console.log(`💰 Attempting buy on new pair: ${pairAddress}`);

    // Example: send 0.01 ETH to the new pair (adjust logic to your strategy)
    const tx = await wallet.sendTransaction({
      to: pairAddress,
      value: ethers.parseEther("0.01"),
      gasLimit: 300000,
    });

    console.log(`✅ Buy tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Buy confirmed in block: ${receipt.blockNumber}`);
  } catch (error) {
    console.error(`❌ Auto-buy failed for ${pairAddress}:`, error.message);
  }
}

export default autoBuy;
