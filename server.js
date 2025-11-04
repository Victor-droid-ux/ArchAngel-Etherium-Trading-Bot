// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { ethers } = require("ethers");
const fs = require("fs");
const bot = require("./bot.js");
const autoBuy = require("./autoBuy.js");

const app = express();
app.use(cors());

// === HTTP + WebSocket setup ===
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 4001;
let botRunning = false;
let provider, wallet, archangelContract;

// === Load seen.json ===
const SEEN_FILE = process.env.SEEN_STORE || "seen.json";
let seen = [];
try {
  seen = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
  console.log(`✅ Loaded ${seen.length} seen tokens from ${SEEN_FILE}`);
} catch {
  seen = [];
  console.warn(`⚠️ No seen file found — starting fresh.`);
}

function saveSeen() {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
  console.log("💾 seen.json updated");
}

// === Initialize provider, wallet, contracts ===
async function init() {
  try {
    const rpcUrl = process.env.RPC_PROVIDER_URL;
    if (!rpcUrl) throw new Error("Missing RPC_PROVIDER_URL in .env");

    provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const archangelAbi = JSON.parse(
      fs.readFileSync("./ArchAngelABI.json", "utf8")
    );
    archangelContract = new ethers.Contract(
      process.env.ARCHANGEL_ADDRESS,
      archangelAbi,
      wallet // ✅ signer with provider
    );

    const network = await provider.getNetwork();
    console.log(
      `🌐 Connected to: ${network.name} (chainId: ${network.chainId})`
    );
    console.log(`👛 Wallet address: ${wallet.address}`);
    console.log(`🧾 ArchAngel contract: ${process.env.ARCHANGEL_ADDRESS}`);
  } catch (err) {
    console.error("❌ Error initializing bot:", err.message);
  }
}
init();

// === Emit contract balance ===
async function emitContractBalance(retries = 3) {
  try {
    if (!provider) return;
    const balance = await provider.getBalance(process.env.ARCHANGEL_ADDRESS);
    const eth = ethers.formatEther(balance);
    io.emit("contractBalance", { balance: eth });
    console.log(`📊 Contract balance: ${eth} ETH`);
  } catch (err) {
    if (retries > 0) {
      console.warn("Retrying balance fetch...", err.message);
      setTimeout(() => emitContractBalance(retries - 1), 5000);
    } else {
      console.error("Error fetching contract balance:", err.message);
    }
  }
}
setInterval(emitContractBalance, 60000);

// === WebSocket handlers ===
io.on("connection", (socket) => {
  console.log("🟢 UI connected:", socket.id);

  emitContractBalance();
  io.emit("botStatus", { running: botRunning });

  // 🧠 Send previously seen tokens on request
  socket.on("requestSeenTokens", () => {
    const tokens = seen.map((token) => ({
      symbol: "Unknown",
      address: token,
      liquidity: "✅ OK",
    }));
    socket.emit("initial_tokens", tokens);
  });

  // 🚀 Start bot
  socket.on("startBot", async () => {
    if (botRunning) {
      console.log("⚠️ Bot already running.");
      return;
    }

    try {
      console.log("🚀 Starting bot...");
      botRunning = true;
      io.emit("botStatus", { running: true });

      if (!provider) {
        console.log("🔄 Reinitializing provider...");
        provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER_URL);
      }

      const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      const archangelAbi = JSON.parse(
        fs.readFileSync("./ArchAngelABI.json", "utf8")
      );

      const connectedContract = new ethers.Contract(
        process.env.ARCHANGEL_ADDRESS,
        archangelAbi,
        signer
      );

      if (!connectedContract.runner || !connectedContract.runner.provider) {
        throw new Error("Contract still missing provider — cannot start bot");
      }

      console.log("✅ Contract and provider connected properly");
      await bot.start(io, connectedContract);

      io.emit("botStatus", { running: true });
    } catch (error) {
      console.error("❌ Error in bot:", error.message);
      io.emit("error", { message: error.message });
      botRunning = false;
    }
  });

  // 🛑 Stop bot
  socket.on("stopBot", async () => {
    if (!botRunning) {
      console.log("⚠️ Bot not running.");
      return;
    }
    try {
      console.log("🛑 Stopping bot...");
      await bot.stop();
    } catch (error) {
      console.error("❌ Error stopping bot:", error.message);
    } finally {
      botRunning = false;
      io.emit("botStatus", { running: false });
    }
  });

  socket.on("getBalance", emitContractBalance);
  socket.on("disconnect", () => console.log("🔴 UI disconnected:", socket.id));
});

// === Health endpoint ===
app.get("/", (req, res) => {
  res.send("🛰️ ArchAngel bot backend is live and ready.");
});

// === Start server ===
server.listen(PORT, () => {
  console.log(`🛰️ Server running on port ${PORT}`);
});

// === Graceful shutdown ===
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  try {
    await bot.stop();
  } catch (err) {
    console.error("Error during shutdown:", err.message);
  }
  process.exit(0);
});
