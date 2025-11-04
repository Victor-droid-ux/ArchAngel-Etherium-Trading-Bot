// bot.js - ArchAngel bot
require("dotenv").config();
const fs = require("fs");
const { ethers } = require("ethers");

const FACTORY_ABI = [
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
];

const SEEN_STORE = process.env.SEEN_STORE || "seen.json";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
const WETH_ADDRESS = process.env.WETH_ADDRESS;
const DRY_RUN = process.env.DRY_RUN === "true";
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || 200);

if (!FACTORY_ADDRESS || !WETH_ADDRESS) {
  console.error("Missing FACTORY_ADDRESS or WETH_ADDRESS in .env");
  process.exit(1);
}

// === Persisted seen tokens ===
let seen = new Set();
try {
  if (fs.existsSync(SEEN_STORE)) {
    const arr = JSON.parse(fs.readFileSync(SEEN_STORE, "utf8"));
    arr.forEach((t) => seen.add(String(t).toLowerCase()));
    console.log(`✅ Loaded ${seen.size} seen tokens`);
  }
} catch (e) {
  console.warn("⚠️ Could not load seen store:", e);
}

function persistSeen() {
  try {
    fs.writeFileSync(SEEN_STORE, JSON.stringify([...seen]), "utf8");
    console.log(`💾 Persisted ${seen.size} seen tokens`);
  } catch (e) {
    console.warn("⚠️ Failed to persist seen tokens:", e);
  }
}

// === Global state ===
let running = false;
let _io = null;
let _archAngel = null;
let _factory = null;
let _pairCreatedHandler = null;

function sendUIUpdate(event, data) {
  if (_io && typeof _io.emit === "function") _io.emit(event, data);
  console.log(`[UI] ${event}:`, data);
}
const lc = (addr) => (addr ? String(addr).toLowerCase() : addr);

// === MAIN START FUNCTION ===
async function start(io, archAngelContract) {
  if (running) {
    console.log("⚙️ Bot already running, ignoring duplicate start.");
    return;
  }
  running = true;

  try {
    console.log("🤖 ArchAngel bot starting...");
    _io = io;
    _archAngel = archAngelContract;

    // ✅ Ensure contract has a provider (Ethers v6 compatible)
    const provider = _archAngel.provider || _archAngel.runner?.provider;

    if (!provider) {
      throw new Error("ArchAngel contract has no provider attached");
    }

    const network = await provider.getNetwork();
    const walletAddr = _archAngel.signer
      ? await _archAngel.signer.getAddress()
      : "(no signer)";
    console.log(`🌐 Connected to ${network.name} (chainId=${network.chainId})`);
    console.log(`👛 Wallet: ${walletAddr}`);

    _factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    console.log("🧩 Listening to factory:", FACTORY_ADDRESS);

    // === Emit already seen tokens at startup ===
    Array.from(seen)
      .slice(-5)
      .forEach((token) => {
        sendUIUpdate("new_token", { token, fromHistory: true });
      });

    _pairCreatedHandler = async (token0, token1, pairAddress) => {
      const time = new Date().toISOString();
      try {
        sendUIUpdate("pair_created", { token0, token1, pairAddress, time });

        const wethLower = lc(WETH_ADDRESS);
        const t0 = lc(token0);
        const t1 = lc(token1);
        let targetToken;

        if (t0 === wethLower) targetToken = t1;
        else if (t1 === wethLower) targetToken = t0;
        else return;

        if (seen.has(targetToken)) return;

        seen.add(targetToken);
        persistSeen();
        sendUIUpdate("new_token", { token: targetToken, pairAddress });

        // === Liquidity check ===
        try {
          const PAIR_ABI = [
            "function token0() view returns (address)",
            "function token1() view returns (address)",
            "function getReserves() view returns (uint112,uint112,uint32)",
          ];
          const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
          const [token0Addr, token1Addr, reserves] = await Promise.all([
            pair.token0(),
            pair.token1(),
            pair.getReserves(),
          ]);

          const reserve0 = BigInt(reserves[0]);
          const reserve1 = BigInt(reserves[1]);
          let wethReserve = 0n;
          if (lc(token0Addr) === wethLower) wethReserve = reserve0;
          else if (lc(token1Addr) === wethLower) wethReserve = reserve1;

          const formatted = ethers.formatEther(wethReserve.toString());
          sendUIUpdate("liquidity_ok", {
            token: targetToken,
            wethReserve: formatted,
          });
        } catch (e) {
          sendUIUpdate("liquidity_check_failed", {
            token: targetToken,
            reason: e.message,
          });
        }

        // === Buy logic ===
        if (DRY_RUN) {
          sendUIUpdate("dry_run", { token: targetToken });
          console.log("[DRY RUN] would buy", targetToken);
          return;
        }

        try {
          const tx = await _archAngel.buyNewToken(targetToken, SLIPPAGE_BPS, {
            gasLimit: 900000,
          });
          sendUIUpdate("tx_submitted", { token: targetToken, hash: tx.hash });
          const receipt = await tx.wait(1);
          sendUIUpdate("tx_confirmed", {
            token: targetToken,
            block: receipt.blockNumber,
            txHash: receipt.transactionHash,
          });
        } catch (e) {
          sendUIUpdate("tx_failed", { token: targetToken, reason: e.message });
        }
      } catch (err) {
        sendUIUpdate("error", { message: err.message });
      }
    };

    _factory.on("PairCreated", _pairCreatedHandler);
    sendUIUpdate("bot_status", { status: "live" });
    console.log("✅ Bot started and listening for PairCreated events.");
  } catch (err) {
    console.error("❌ Error in bot:", err.message);
    running = false;
    _io?.emit("botStatus", { running: false });
  }
}

// === STOP FUNCTION ===
async function stop() {
  if (!running) {
    console.log("Bot not running; stop ignored.");
    return;
  }
  running = false;

  try {
    if (_factory && _pairCreatedHandler) {
      _factory.off("PairCreated", _pairCreatedHandler);
      console.log("🧹 Removed PairCreated listener.");
    }
  } catch (e) {
    console.warn("⚠️ Error removing listeners:", e);
  }

  persistSeen();
  sendUIUpdate("bot_status", { status: "stopped" });
  console.log("🛑 Bot stopped.");
}

module.exports = { start, stop };
