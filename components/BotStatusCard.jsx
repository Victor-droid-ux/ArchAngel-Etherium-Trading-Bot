export default function BotStatusCard({
  portfolioValue,
  profit,
  botStatus,
  contractBalance,
}) {
  return (
    <div className="stats">
      <div className="card">
        <h3>Portfolio Value</h3>
        <p className="value">${portfolioValue}</p>
      </div>

      <div className="card">
        <h3>Total Profit</h3>
        <p className="profit">{profit}</p>
      </div>

      <div className="card">
        <h3>Bot Status</h3>
        <p
          className={`status ${
            botStatus === "live"
              ? "live"
              : botStatus === "stopped"
              ? "stopped"
              : "disconnected"
          }`}
        >
          {botStatus.toUpperCase()}
        </p>
      </div>

      <div className="card">
        <h3>CA Balance</h3>
        <p className="value">{contractBalance} ETH</p>
      </div>
    </div>
  );
}
