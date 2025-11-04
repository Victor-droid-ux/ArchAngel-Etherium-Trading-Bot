export default function SettingsPanel({ botStatus, startBot, stopBot }) {
  return (
    <div className="controls">
      <button
        onClick={startBot}
        className={`btn ${botStatus === "live" ? "disabled" : ""}`}
        disabled={botStatus === "live"}
      >
        ▶ Start Bot
      </button>

      <button
        onClick={stopBot}
        className={`btn stop ${botStatus !== "live" ? "disabled" : ""}`}
        disabled={botStatus !== "live"}
      >
        ⏹ Stop Bot
      </button>
    </div>
  );
}
