import { useState } from "react";
import { FruitMergeGame } from "./game/FruitMergeGame";
import { VersusMode } from "./game/versus/VersusMode";

type AppView = "home" | "solo" | "versus";

export default function App() {
  const [view, setView] = useState<AppView>("home");

  if (view === "solo") {
    return (
      <FruitMergeGame
        mode="solo"
        title="Fruit Merge"
        subtitle="Classic score-chasing mode with juicy watermelon celebrations."
        bestScoreKey="fruit-merge-best-solo-score"
        onExit={() => setView("home")}
      />
    );
  }

  if (view === "versus") {
    return <VersusMode onExit={() => setView("home")} />;
  }

  return (
    <div className="mode-shell">
      <section className="mode-card">
        <span className="badge">Fruit Merge Deluxe</span>
        <h1>Pick a mode</h1>
        <p>Play a polished solo run or open a room for a live local-mock versus duel with synced score, fruit preview, and incoming fruit attacks.</p>

        <div className="mode-grid">
          <button type="button" className="mode-button" onClick={() => setView("solo")}>
            <span>Solo Mode</span>
            <small>Classic fruit merge with watermelon bonus events.</small>
          </button>
          <button type="button" className="mode-button alt" onClick={() => setView("versus")}>
            <span>Versus Mode</span>
            <small>Create or join a room and race another board.</small>
          </button>
        </div>

        <div className="tips-card">
          <strong>Mobile friendly</strong>
          <p>Both modes keep touch drag aiming, tap-to-drop flow, and iPhone-first sizing. In Versus Mode, open a second tab to join the room locally.</p>
        </div>
      </section>
    </div>
  );
}
