"use client";
import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";

// =====================
// MAIN DASHBOARD
// =====================
export default function Dashboard() {
  const [botStatus, setBotStatus] = useState("disconnected");
  const [contractBalance, setContractBalance] = useState("0");
  const [newTokens, setNewTokens] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState("0.00");
  const [profit, setProfit] = useState("+0.00");
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io("http://localhost:4001", {
      transports: ["websocket"],
    });
    socketRef.current = socket;

    console.log("🟢 Connected to WebSocket backend");

    socket.on("botStatus", (data) => {
      setBotStatus(data.running ? "live" : "stopped");
    });

    socket.on("contractBalance", (data) => {
      setContractBalance(data.balance);
    });

    // Unified token detection handling
    const handleNewToken = (data, source = "new_token") => {
      console.log(`🆕 Token from ${source}:`, data);

      const pairAddress = data.pairAddress || data.address || data.token;
      if (!pairAddress) return;

      setNewTokens((prev) => {
        if (prev.some((t) => t.address === pairAddress)) return prev;

        const tokenData = {
          token0: data.token0 || "Unknown",
          token1: data.token1 || "Unknown",
          address: pairAddress,
          liquidity: data.liquidity || "Pending...",
          detectedAt: new Date().toLocaleTimeString(),
        };

        return [tokenData, ...prev.slice(0, 9)];
      });
    };

    socket.on("new_token", (data) => handleNewToken(data, "new_token"));
    socket.on("pair_created", (data) => handleNewToken(data, "pair_created"));
    socket.on("liquidity_ok", (data) => handleNewToken(data, "liquidity_ok"));

    socket.on("portfolio", (data) => {
      setPortfolioValue(data.value);
      setProfit(data.profit);
    });

    socket.on("connect_error", (err) =>
      console.error("❌ Socket error:", err.message)
    );

    return () => {
      socket.disconnect();
      console.log("🔴 Disconnected from WebSocket");
    };
  }, []);

  const startBot = () => {
    socketRef.current?.emit("startBot");
    setBotStatus("live");
  };

  const stopBot = () => {
    socketRef.current?.emit("stopBot");
    setBotStatus("stopped");
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Trading Bot Dashboard</h1>

      <BotStatusCard
        portfolioValue={portfolioValue}
        profit={profit}
        botStatus={botStatus}
        contractBalance={contractBalance}
      />

      <SettingsPanel
        botStatus={botStatus}
        startBot={startBot}
        stopBot={stopBot}
      />

      <TokenLogTable newTokens={newTokens} />
    </div>
  );
}

// =====================
// COMPONENTS
// =====================

function BotStatusCard({ portfolioValue, profit, botStatus, contractBalance }) {
  return (
    <div style={styles.statsGrid}>
      <div style={styles.card}>
        <h3>Portfolio Value</h3>
        <p style={styles.value}>${portfolioValue}</p>
      </div>

      <div style={styles.card}>
        <h3>Total Profit</h3>
        <p
          style={{
            ...styles.value,
            color: profit.startsWith("-") ? "red" : "limegreen",
          }}
        >
          {profit}
        </p>
      </div>

      <div style={styles.card}>
        <h3>Bot Status</h3>
        <p
          style={{
            ...styles.value,
            color:
              botStatus === "live"
                ? "limegreen"
                : botStatus === "stopped"
                ? "orange"
                : "gray",
          }}
        >
          {botStatus.toUpperCase()}
        </p>
      </div>

      <div style={styles.card}>
        <h3>Contract Balance</h3>
        <p style={styles.value}>{contractBalance} ETH</p>
      </div>
    </div>
  );
}

function TokenLogTable({ newTokens }) {
  return (
    <div style={styles.tableSection}>
      <h2 style={{ marginBottom: "10px" }}>🪙 New Token Discoveries</h2>
      {newTokens.length === 0 ? (
        <p style={{ color: "gray" }}>No new tokens detected yet...</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Token 0</th>
              <th>Token 1</th>
              <th>Pair Address</th>
              <th>Detected</th>
            </tr>
          </thead>
          <tbody>
            {newTokens.map((t, i) => (
              <tr key={i}>
                <td>{t.token0}</td>
                <td>{t.token1}</td>
                <td>
                  {t.address
                    ? `${t.address.slice(0, 6)}...${t.address.slice(-4)}`
                    : "N/A"}
                </td>
                <td>{t.detectedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SettingsPanel({ botStatus, startBot, stopBot }) {
  return (
    <div style={styles.controls}>
      <button
        onClick={startBot}
        style={{
          ...styles.button,
          backgroundColor: botStatus === "live" ? "gray" : "#4CAF50",
        }}
        disabled={botStatus === "live"}
      >
        ▶ Start Bot
      </button>

      <button
        onClick={stopBot}
        style={{
          ...styles.button,
          backgroundColor: botStatus !== "live" ? "gray" : "#E53935",
        }}
        disabled={botStatus !== "live"}
      >
        ⏹ Stop Bot
      </button>
    </div>
  );
}

// =====================
// STYLES
// =====================
const styles = {
  container: {
    fontFamily: "Arial, sans-serif",
    color: "#fff",
    backgroundColor: "#0e0e10",
    minHeight: "100vh",
    padding: "30px",
  },
  title: {
    fontSize: "28px",
    marginBottom: "20px",
    textAlign: "center",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
    marginBottom: "25px",
  },
  card: {
    backgroundColor: "#1e1e22",
    padding: "20px",
    borderRadius: "10px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
  value: {
    fontSize: "20px",
    fontWeight: "bold",
    marginTop: "10px",
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: "15px",
    marginBottom: "30px",
  },
  button: {
    padding: "10px 20px",
    fontSize: "16px",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  tableSection: {
    backgroundColor: "#1e1e22",
    padding: "20px",
    borderRadius: "10px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    color: "#ddd",
  },
};
