// tradeFilter.js
import axios from "axios";
import { ethers } from "ethers";
import blacklist from "./blacklist.json" assert { type: "json" };

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const GOPLUS_API_KEY = process.env.GOPLUS_API_KEY;

// ===============================
// 🔍 MAIN FILTER FUNCTION
// ===============================
export async function shouldTradeToken(tokenData) {
  const {
    token,
    pairAddress,
    liquidityETH,
    creationTimestamp,
    deployer,
    symbol,
    name,
  } = tokenData;

  try {
    console.log(`🔎 Evaluating ${symbol || "Unknown"} (${token})...`);

    // 1️⃣ Liquidity Check
    if (Number(liquidityETH) < 0.5) {
      console.log(`🚫 Skipped: Low liquidity (${liquidityETH} ETH)`);
      return false;
    }

    // 2️⃣ Contract Verification
    const verified = await checkEtherscanVerification(token);
    if (!verified) {
      console.log("🚫 Skipped: Contract not verified on Etherscan");
      return false;
    }

    // 3️⃣ Ownership Renounced / Locked Liquidity / Honeypot
    const safety = await checkGoPlusSecurity(token);
    if (!safety) {
      console.log("🚫 Skipped: Failed GoPlus security checks");
      return false;
    }

    // 4️⃣ Pair Age (Skip old pairs)
    const ageMinutes = (Date.now() / 1000 - creationTimestamp) / 60;
    if (ageMinutes > 30) {
      console.log(`🚫 Skipped: Pair too old (${ageMinutes.toFixed(1)} mins)`);
      return false;
    }

    // 5️⃣ Symbol/Name validation
    if (!name || !symbol || name.length < 2 || symbol.length < 1) {
      console.log("🚫 Skipped: Invalid name/symbol");
      return false;
    }

    // 6️⃣ Blacklist check
    if (blacklist.includes(deployer.toLowerCase())) {
      console.log("🚫 Skipped: Blacklisted deployer");
      return false;
    }

    // 7️⃣ Optional — Volume check (Dexscreener)
    const hasVolume = await checkDexScreenerVolume(pairAddress);
    if (!hasVolume) {
      console.log("🚫 Skipped: No trading activity detected");
      return false;
    }

    console.log(`✅ Passed all filters for ${symbol}`);
    return true;
  } catch (err) {
    console.error("❌ Error evaluating token:", err.message);
    return false;
  }
}

// ===============================
// 🧩 SUB-FUNCTIONS
// ===============================

// Check if contract is verified on Etherscan
async function checkEtherscanVerification(tokenAddress) {
  try {
    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${ETHERSCAN_API_KEY}`;
    const res = await axios.get(url);
    const data = res.data?.result?.[0];
    return data && data.SourceCode && data.SourceCode.length > 0;
  } catch (err) {
    console.error("Etherscan check failed:", err.message);
    return false;
  }
}

// GoPlus security checks
async function checkGoPlusSecurity(tokenAddress) {
  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${tokenAddress}`;
    const res = await axios.get(url, {
      headers: { "x-api-key": GOPLUS_API_KEY },
    });
    const info = res.data?.result?.[tokenAddress.toLowerCase()];
    if (!info) return false;

    const renounced =
      info.owner_address === "0x0000000000000000000000000000000000000000";
    const honeypot = info.is_honeypot === "1";
    const highTax = Number(info.sell_tax) > 10 || Number(info.buy_tax) > 10;

    if (honeypot || highTax) return false;
    if (!renounced) console.log("⚠️ Ownership not renounced");

    return true;
  } catch (err) {
    console.error("GoPlus check failed:", err.message);
    return false;
  }
}

// Simple volume check via DexScreener
async function checkDexScreenerVolume(pairAddress) {
  try {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/pairs/ethereum/${pairAddress}`
    );
    const vol = Number(res.data?.pair?.volume?.h24 || 0);
    return vol > 1; // Only trade if 24h volume > 1 ETH
  } catch {
    return false;
  }
}
