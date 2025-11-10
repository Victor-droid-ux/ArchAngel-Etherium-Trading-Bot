// server.js (corrected)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { ethers } from "ethers";
import fs from "fs";
import bot from "./bot.js";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 4001;

// === HTTP + WebSocket server ===
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let botRunning = false;
let provider, wallet, archangelContract;

// --- Load seen tokens ---
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

// === Initialize provider, wallet, contract ===
async function init() {
  try {
    if (!process.env.WS_PROVIDER_URL)
      throw new Error("Missing WS_PROVIDER_URL in .env");
    if (!process.env.PRIVATE_KEY)
      throw new Error("Missing PRIVATE_KEY in .env");
    if (!process.env.ARCHANGEL_ADDRESS)
      throw new Error("Missing ARCHANGEL_ADDRESS in .env");

    provider = new ethers.WebSocketProvider(process.env.WS_PROVIDER_URL);
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const archangelAbi = JSON.parse(
      fs.readFileSync("./ArchAngelABI.json", "utf8")
    );
    archangelContract = new ethers.Contract(
      process.env.ARCHANGEL_ADDRESS,
      archangelAbi,
      wallet
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

await init();

// === Emit ArchAngel contract balance ===
async function emitContractBalance(retries = 3) {
  try {
    if (!provider || !archangelContract) return;
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

// === Socket.IO handlers ===
io.on("connection", (socket) => {
  console.log("🟢 UI connected:", socket.id);

  emitContractBalance();
  io.emit("botStatus", { running: botRunning });

  socket.on("requestSeenTokens", () => {
    const tokens = seen.map((token) => ({
      symbol: "Unknown",
      address: token,
      liquidity: "✅ OK",
    }));
    socket.emit("initial_tokens", tokens);
  });

  socket.on("startBot", async () => {
    if (botRunning) {
      console.log("⚠️ Bot already running.");
      return;
    }

    try {
      if (!archangelContract) {
        console.log("🔄 Reinitializing provider and contract...");
        await init();
      }

      console.log("🚀 Starting bot...");
      botRunning = true;
      io.emit("botStatus", { running: true });

      await bot.start(io, archangelContract);
      io.emit("botStatus", { running: true });
    } catch (error) {
      console.error("❌ Error starting bot:", error.message);
      io.emit("error", { message: error.message });
      botRunning = false;
    }
  });

  socket.on("stopBot", async () => {
    if (!botRunning) {
      console.log("⚠️ Bot not running.");
      return;
    }
    try {
      console.log("🛑 Stopping bot...");
      await bot.stop();
    } catch (err) {
      console.error("❌ Error stopping bot:", err.message);
    } finally {
      botRunning = false;
      io.emit("botStatus", { running: false });
    }
  });

  socket.on("getBalance", emitContractBalance);

  socket.on("disconnect", () => {
    console.log("🔴 UI disconnected:", socket.id);
  });
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
    console.error("❌ Error during shutdown:", err.message);
  }
  process.exit(0);
});
