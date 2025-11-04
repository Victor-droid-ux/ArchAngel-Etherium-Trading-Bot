import { useEffect, useState } from "react";
import io from "socket.io-client";

export default function TokenLogTable() {
  const [newTokens, setNewTokens] = useState([]);

  useEffect(() => {
    const socket = io("http://localhost:4001", {
      transports: ["websocket"],
    });

    console.log("🟢 Connected to WebSocket for token logs");

    // Listen for new token events from backend
    socket.on("new_token", (data) => {
      console.log("🆕 New token detected:", data);

      // Prevent duplicates
      setNewTokens((prev) => {
        if (prev.some((t) => t.pairAddress === data.pairAddress)) return prev;

        const tokenObj = {
          token0: data.token0 || "Unknown",
          token1: data.token1 || "Unknown",
          pairAddress: data.pairAddress || "N/A",
          detectedAt: new Date().toLocaleTimeString(),
        };

        return [tokenObj, ...prev];
      });
    });

    // Optional: handle PairCreated events too (if emitted)
    socket.on("pair_created", (data) => {
      console.log("📦 PairCreated event:", data);

      setNewTokens((prev) => {
        if (prev.some((t) => t.pairAddress === data.pairAddress)) return prev;

        const tokenObj = {
          token0: data.token0 || "Unknown",
          token1: data.token1 || "Unknown",
          pairAddress: data.pairAddress || "N/A",
          detectedAt: new Date().toLocaleTimeString(),
        };

        return [tokenObj, ...prev];
      });
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket connection failed:", err.message);
    });

    return () => {
      socket.disconnect();
      console.log("🔴 Disconnected from WebSocket");
    };
  }, []);

  return (
    <section className="new-tokens" style={{ marginTop: "20px" }}>
      <h2>🪙 New Token Discoveries</h2>
      {newTokens.length === 0 ? (
        <p>No new tokens detected yet...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Token 0</th>
              <th>Token 1</th>
              <th>Pair Address</th>
              <th>Detected At</th>
            </tr>
          </thead>
          <tbody>
            {newTokens.map((t, i) => (
              <tr key={i}>
                <td>{t.token0}</td>
                <td>{t.token1}</td>
                <td>
                  {t.pairAddress.slice(0, 6)}...{t.pairAddress.slice(-4)}
                </td>
                <td>{t.detectedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
