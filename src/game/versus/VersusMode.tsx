import { useEffect, useMemo, useRef, useState } from "react";
import { FruitMergeGame } from "../FruitMergeGame";
import { getFruit, getRandomGarbageFruit, getRandomHeavyGarbageFruit, WATERMELON_LEVEL, type FruitLevel } from "../fruits";
import { multiplayerAdapter, multiplayerAdapterLabel, multiplayerAdapterStatusReason } from "./multiplayerAdapter";
import type {
  ActiveAttackState,
  AttackType,
  MergeSummary,
  PublicBoardState,
  VersusAttackEvent,
  VersusPlayerState,
  VersusRoomState,
  VersusSession
} from "./types";

const VERSUS_STATS_KEY = "fruit-merge-versus-stats";
const COUNTDOWN_MS = 3000;
const ATTACK_METER_MAX = 100;
const FRENZY_MS = 30000;

interface VersusStats {
  bestScore: number;
  wins: number;
  losses: number;
  roomsPlayed: number;
}

function readStats(): VersusStats {
  if (typeof window === "undefined") {
    return { bestScore: 0, wins: 0, losses: 0, roomsPlayed: 0 };
  }

  const raw = window.localStorage.getItem(VERSUS_STATS_KEY);
  return raw ? (JSON.parse(raw) as VersusStats) : { bestScore: 0, wins: 0, losses: 0, roomsPlayed: 0 };
}

function formatTimer(totalMs: number) {
  const safeMs = Math.max(0, totalMs);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getOutcomeText(me: VersusPlayerState | null, opponent: VersusPlayerState | null) {
  if (!me || !opponent) {
    return { headline: "Waiting for players", winnerName: "" };
  }

  if (me.score === opponent.score) {
    return { headline: "Tie", winnerName: "No winner" };
  }

  const won = me.score > opponent.score;
  return {
    headline: won ? "You won" : "You lost",
    winnerName: won ? me.name : opponent.name
  };
}

function buildAttackEvent(fromPlayerId: "host" | "guest", type: AttackType, fruitLevel?: FruitLevel, durationMs?: number, strength?: number): VersusAttackEvent {
  return {
    id: `${fromPlayerId}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    fromPlayerId,
    fruitLevel,
    durationMs,
    strength,
    createdAt: Date.now()
  };
}

export function VersusMode({ onExit }: { onExit: () => void }) {
  const [playerName, setPlayerName] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [session, setSession] = useState<VersusSession | null>(null);
  const [room, setRoom] = useState<VersusRoomState | null>(null);
  const [error, setError] = useState("");
  const [boardState, setBoardState] = useState<PublicBoardState | null>(null);
  const [stats, setStats] = useState(readStats);
  const [now, setNow] = useState(() => Date.now());
  const [localAttackMeter, setLocalAttackMeter] = useState(0);
  const [localActiveAttacks, setLocalActiveAttacks] = useState<ActiveAttackState[]>([]);
  const processedAttackIdsRef = useRef(new Set<string>());
  const outcomeSavedRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const unsubscribe = multiplayerAdapter.subscribe(session.roomCode, setRoom);
    return unsubscribe;
  }, [session]);

  const me = useMemo(() => (session && room ? room.players[session.playerId] ?? null : null), [room, session]);
  const opponent = useMemo(() => {
    if (!session || !room) {
      return null;
    }

    const otherId = session.playerId === "host" ? "guest" : "host";
    return room.players[otherId] ?? null;
  }, [room, session]);

  useEffect(() => {
    if (me) {
      setLocalAttackMeter(me.attackMeter);
      setLocalActiveAttacks(me.activeAttacks ?? []);
    }
  }, [me?.attackMeter, me?.activeAttacks]);

  useEffect(() => {
    setLocalActiveAttacks((previous) => previous.filter((attack) => attack.endsAt > now));
  }, [now]);

  const incomingAttacks = useMemo(() => {
    if (!room || !session) {
      return [];
    }

    return room.events.filter((event) => event.fromPlayerId !== session.playerId);
  }, [room, session]);

  useEffect(() => {
    if (!session || !room) {
      return;
    }

    const freshIncoming = incomingAttacks.filter((event) => !processedAttackIdsRef.current.has(event.id));
    if (freshIncoming.length === 0) {
      return;
    }

    for (const event of freshIncoming) {
      processedAttackIdsRef.current.add(event.id);
      if (event.type === "hide-next" || event.type === "gravity-boost") {
        setLocalActiveAttacks((previous) => [
          ...previous.filter((attack) => attack.type !== event.type),
          { type: event.type, endsAt: Date.now() + (event.durationMs ?? 5000) }
        ]);
      }
    }
  }, [incomingAttacks, room, session]);

  const countdownRemainingMs = useMemo(() => {
    if (!room?.countdownStartedAt || room.status !== "countdown") {
      return COUNTDOWN_MS;
    }

    return Math.max(0, COUNTDOWN_MS - (now - room.countdownStartedAt));
  }, [now, room]);

  const countdownLabel = useMemo(() => {
    if (!room || room.status !== "countdown") {
      return "";
    }
    if (countdownRemainingMs <= 0) {
      return "GO!";
    }
    return String(Math.ceil(countdownRemainingMs / 1000));
  }, [countdownRemainingMs, room]);

  const matchRemainingMs = useMemo(() => {
    if (!room) {
      return 0;
    }

    if (!room.matchStartedAt) {
      return room.matchDurationMs;
    }

    return Math.max(0, room.matchDurationMs - (now - room.matchStartedAt));
  }, [now, room]);

  const frenzyActive = room?.status === "playing" && matchRemainingMs <= FRENZY_MS;
  const timerLabel = useMemo(() => formatTimer(matchRemainingMs), [matchRemainingMs]);

  useEffect(() => {
    if (!session || !room || session.playerId !== room.hostPlayerId) {
      return;
    }

    const host = room.players.host;
    const guest = room.players.guest;
    if (room.status === "ready" && host?.ready && guest?.ready) {
      void multiplayerAdapter.startCountdown(room.roomCode);
    }
  }, [room, session]);

  useEffect(() => {
    if (!session || !room || session.playerId !== room.hostPlayerId) {
      return;
    }

    if (room.status === "countdown" && room.countdownStartedAt && now >= room.countdownStartedAt + COUNTDOWN_MS) {
      void multiplayerAdapter.startMatch(room.roomCode);
    }
  }, [now, room, session]);

  useEffect(() => {
    if (!session || !room || session.playerId !== room.hostPlayerId) {
      return;
    }

    if (room.status === "playing" && matchRemainingMs <= 0) {
      void multiplayerAdapter.finishMatch(room.roomCode);
    }
  }, [matchRemainingMs, room, session]);

  useEffect(() => {
    if (!session || !room || room.status !== "finished" || session.playerId !== room.hostPlayerId) {
      return;
    }

    const host = room.players.host;
    const guest = room.players.guest;
    if (host?.rematchReady && guest?.rematchReady) {
      processedAttackIdsRef.current.clear();
      void multiplayerAdapter.resetForRematch(room.roomCode);
    }
  }, [room, session]);

  useEffect(() => {
    if (!session || !boardState || !room) {
      return;
    }

    const gameplayLive = room.status === "playing" && matchRemainingMs > 0;
    void multiplayerAdapter.updatePlayer(session.roomCode, session.playerId, {
      name: playerName.trim() || "Player",
      score: boardState.score,
      currentFruit: boardState.currentFruit,
      biggestFruit: boardState.biggestFruit,
      totalMerges: boardState.totalMerges,
      biggestCombo: boardState.biggestCombo,
      attackMeter: localAttackMeter,
      activeAttacks: localActiveAttacks,
      isGameOver: boardState.isGameOver || !gameplayLive,
      connected: true,
      ready: me?.ready ?? false,
      rematchReady: me?.rematchReady ?? false
    });
  }, [
    boardState,
    localActiveAttacks,
    localAttackMeter,
    matchRemainingMs,
    me?.ready,
    me?.rematchReady,
    playerName,
    room,
    session
  ]);

  useEffect(() => {
    if (!room || !session || room.status !== "finished" || outcomeSavedRef.current) {
      return;
    }

    const myState = room.players[session.playerId];
    const theirState = opponent;
    if (!myState || !theirState) {
      return;
    }

    const nextStats = {
      bestScore: Math.max(stats.bestScore, myState.score),
      wins: stats.wins + (myState.score > theirState.score ? 1 : 0),
      losses: stats.losses + (myState.score < theirState.score ? 1 : 0),
      roomsPlayed: stats.roomsPlayed + 1
    };
    outcomeSavedRef.current = true;
    setStats(nextStats);
    window.localStorage.setItem(VERSUS_STATS_KEY, JSON.stringify(nextStats));
  }, [opponent, room, session, stats]);

  useEffect(() => {
    if (room?.status !== "finished") {
      outcomeSavedRef.current = false;
    }
    if (room?.status === "waiting" && room.round > 1) {
      setLocalAttackMeter(0);
      setLocalActiveAttacks([]);
    }
  }, [room?.round, room?.status]);

  const createRoom = async () => {
    try {
      setError("");
      const nextSession = await multiplayerAdapter.createRoom(playerName.trim() || "Player 1");
      setSession(nextSession);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create room.");
    }
  };

  const joinRoom = async () => {
    try {
      setError("");
      const nextSession = await multiplayerAdapter.joinRoom(joinCode.trim().toUpperCase(), playerName.trim() || "Player 2");
      setSession(nextSession);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to join room.");
    }
  };

  const leaveRoom = async () => {
    if (session) {
      await multiplayerAdapter.leaveRoom(session.roomCode, session.playerId);
    }
    setRoom(null);
    setSession(null);
    setBoardState(null);
    setJoinCode("");
    setLocalAttackMeter(0);
    setLocalActiveAttacks([]);
  };

  const toggleReady = async () => {
    if (!session || !me) {
      return;
    }

    setError("");
    await multiplayerAdapter.setPlayerReady(session.roomCode, session.playerId, !me.ready);
  };

  const requestRematch = async () => {
    if (!session || !me) {
      return;
    }

    await multiplayerAdapter.setPlayerRematchReady(session.roomCode, session.playerId, !me.rematchReady);
  };

  const handleWatermelon = async () => {
    if (!session || !room || room.status !== "playing") {
      return;
    }

    await multiplayerAdapter.sendAttack(
      session.roomCode,
      buildAttackEvent(session.playerId, "heavy-junk", getRandomHeavyGarbageFruit())
    );
  };

  const sendAttack = async (event: VersusAttackEvent, meterCost: number) => {
    if (!session || !room || room.status !== "playing") {
      return;
    }

    const nextMeter = Math.max(0, localAttackMeter - meterCost);
    setLocalAttackMeter(nextMeter);
    await multiplayerAdapter.sendAttack(session.roomCode, event);
  };

  const manualAttack = async () => {
    if (!session || localAttackMeter < ATTACK_METER_MAX) {
      return;
    }

    const options: VersusAttackEvent[] = [
      buildAttackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit()),
      buildAttackEvent(session.playerId, "board-shake", undefined, 0, 16),
      buildAttackEvent(session.playerId, "hide-next", undefined, 5000),
      buildAttackEvent(session.playerId, "gravity-boost", undefined, 5000),
      buildAttackEvent(session.playerId, "heavy-junk", getRandomHeavyGarbageFruit())
    ];
    const chosen = options[Math.floor(Math.random() * options.length)];
    await sendAttack(chosen, ATTACK_METER_MAX);
  };

  const handleMergeSummary = async (summary: MergeSummary) => {
    if (!session || !room || room.status !== "playing") {
      return;
    }

    const scoreDeficit = Math.max(0, (opponent?.score ?? 0) - (me?.score ?? boardState?.score ?? 0));
    const comebackBoost = scoreDeficit > 1200 ? 1.12 : scoreDeficit > 2500 ? 1.18 : 1;
    const celebration = getFruit(summary.to).celebrationTier;
    const gainedMeter = Math.min(
      ATTACK_METER_MAX,
      localAttackMeter + Math.round((6 + celebration * 3 + Math.max(0, summary.combo - 1) * 4) * comebackBoost)
    );
    setLocalAttackMeter(gainedMeter);

    if (summary.to >= WATERMELON_LEVEL) {
      const strongAttack =
        summary.to >= 12
          ? buildAttackEvent(session.playerId, "heavy-junk", getRandomHeavyGarbageFruit())
          : summary.to >= 10
            ? buildAttackEvent(session.playerId, "gravity-boost", undefined, 5000)
            : buildAttackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit());
      await multiplayerAdapter.sendAttack(session.roomCode, strongAttack);
    }
  };

  const statusMessage = useMemo(() => {
    if (!room || !me) {
      return "";
    }

    if (room.status === "waiting" || room.status === "ready") {
      if (me.ready) {
        return opponent?.ready ? "Both players ready." : "You are ready. Waiting on opponent.";
      }
      return opponent?.ready ? "Opponent is ready. You can start the match when ready." : "Match starts when both players are ready.";
    }

    if (room.status === "countdown") {
      return "Countdown running. Get ready!";
    }

    if (room.status === "playing") {
      if (frenzyActive) {
        return opponent?.connected === false ? "FRENZY TIME! Opponent disconnected but the match stays open." : "FRENZY TIME! Points are boosted 1.5x.";
      }
      return opponent?.connected === false ? "Opponent disconnected. Match stays open until time runs out." : "Highest score at 3:00 wins.";
    }

    if (room.status === "finished") {
      return me.rematchReady ? "Waiting for opponent to rematch." : "Match finished. Choose Play Again to rematch.";
    }

    return "";
  }, [frenzyActive, me, opponent?.connected, opponent?.ready, room]);

  const outcome = useMemo(() => getOutcomeText(me, opponent), [me, opponent]);
  const isLobby = Boolean(session) && (!!room && (room.status === "waiting" || room.status === "ready"));
  const isCountdown = room?.status === "countdown";
  const isPlaying = room?.status === "playing";
  const isFinished = room?.status === "finished";
  const gameplayLocked = !isPlaying || matchRemainingMs <= 0;
  const attackMeterPercent = Math.min(100, localAttackMeter);
  const hideNextFruit = localActiveAttacks.some((attack) => attack.type === "hide-next" && attack.endsAt > now);
  const gravityMultiplier = localActiveAttacks.some((attack) => attack.type === "gravity-boost" && attack.endsAt > now) ? 1.35 : 1;

  if (!session) {
    return (
      <div className="mode-shell">
        <section className="mode-card">
          <span className="badge">Versus Mode</span>
          <h1>Live room duels</h1>
          <p>
            {multiplayerAdapter.kind === "firebase"
              ? "Create a room code and join it from another phone or browser. Firebase keeps both boards synced live."
              : "Create a room in one tab, then join it in another tab to simulate a live friend match with synced score, fruit preview, and game-over state."}
          </p>
          <p className="status-note">{multiplayerAdapterStatusReason}</p>

          <label className="stack-label">
            Display Name
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={18} />
          </label>

          <div className="mode-actions">
            <button type="button" onClick={createRoom}>Create Room</button>
            <button type="button" className="ghost-button" onClick={onExit}>Back</button>
          </div>

          <div className="join-panel">
            <label className="stack-label">
              Room Code
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                maxLength={5}
                placeholder="ABCDE"
              />
            </label>
            <button type="button" onClick={joinRoom}>Join Room</button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="tips-card">
            <strong>{multiplayerAdapter.kind === "firebase" ? "Live backend status" : "How the local live mock works"}</strong>
            <p>
              {multiplayerAdapter.kind === "firebase"
                ? `${multiplayerAdapterLabel} is active. Share the room code with another phone and both players can join from separate devices.`
                : `Open the app in two tabs on the same browser profile. Create a room in one tab, join it in the other, and both boards will sync through the local multiplayer adapter. ${multiplayerAdapterStatusReason}`}
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (!room || isLobby) {
    return (
      <div className="mode-shell">
        <section className="mode-card">
          <span className="badge">Room {session.roomCode}</span>
          <h1>Versus Lobby</h1>
          <p>Match starts when both players are ready.</p>
          <p className="status-note">{statusMessage || multiplayerAdapterStatusReason}</p>

          <div className="versus-panel">
            <div className="versus-panel-card">
              <span className="label">Connection</span>
              <strong>{multiplayerAdapterLabel}</strong>
              <span>{multiplayerAdapterStatusReason}</span>
            </div>
            <div className="versus-panel-card">
              <span className="label">You</span>
              <strong>{me?.name ?? playerName}</strong>
              <span>{me?.ready ? "You are ready" : "Not ready yet"}</span>
              <span>{me?.connected === false ? "Reconnecting..." : "Connected"}</span>
            </div>
            <div className="versus-panel-card">
              <span className="label">Opponent</span>
              <strong>{opponent?.name ?? "Waiting..."}</strong>
              <span>{opponent ? (opponent.ready ? "Opponent is ready" : "Waiting on opponent") : "Share the room code to join."}</span>
              <span>{opponent?.connected === false ? "Opponent disconnected" : opponent ? "Connected" : "No opponent yet"}</span>
            </div>
          </div>

          <div className="mode-actions">
            <button type="button" onClick={toggleReady}>{me?.ready ? "Unready" : "Ready"}</button>
            <button type="button" className="ghost-button" onClick={leaveRoom}>Leave Room</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <FruitMergeGame
      mode="versus"
      title={`Versus Room ${session.roomCode}`}
      subtitle={statusMessage || "Highest score wins once the timer ends."}
      bestScoreKey="fruit-merge-best-versus-score"
      onExit={async () => {
        await leaveRoom();
        onExit();
      }}
      onStateChange={setBoardState}
      onWatermelon={handleWatermelon}
      onMergeSummary={handleMergeSummary}
      incomingAttacks={incomingAttacks}
      compact={false}
      autoStart={isCountdown || isPlaying || isFinished}
      gameplayLocked={gameplayLocked}
      resetToken={room.round}
      allowPause={false}
      allowRestart={false}
      hideStartOverlay
      frenzyMultiplier={frenzyActive ? 1.5 : 1}
      hideNextFruit={hideNextFruit}
      gravityMultiplier={gravityMultiplier}
      statusPill={<span className={`timer-pill ${frenzyActive ? "frenzy-pill" : ""}`}>{isPlaying ? timerLabel : isCountdown ? countdownLabel || "3" : "Final"}</span>}
      overlayContent={
        <>
          {isCountdown ? (
            <div className="countdown-overlay">
              <span className="label">Starting</span>
              <strong>{countdownLabel}</strong>
            </div>
          ) : null}
          {frenzyActive ? (
            <div className="frenzy-banner">FRENZY TIME!</div>
          ) : null}
          {isFinished ? (
            <div className="results-overlay">
              <span className="label">Final Result</span>
              <h2>{outcome.headline}</h2>
              <p>{outcome.winnerName === "No winner" ? "Both players finished with the same score." : `Winner: ${outcome.winnerName}`}</p>
              <div className="results-grid">
                <div>
                  <span className="label">You</span>
                  <strong>{me?.score ?? 0}</strong>
                </div>
                <div>
                  <span className="label">Opponent</span>
                  <strong>{opponent?.score ?? 0}</strong>
                </div>
                <div>
                  <span className="label">Biggest Fruit</span>
                  <strong>{me ? `${getFruit(me.biggestFruit).emoji} ${getFruit(me.biggestFruit).name}` : "-"}</strong>
                </div>
                <div>
                  <span className="label">Opponent Fruit</span>
                  <strong>{opponent ? `${getFruit(opponent.biggestFruit).emoji} ${getFruit(opponent.biggestFruit).name}` : "-"}</strong>
                </div>
                <div>
                  <span className="label">Total Merges</span>
                  <strong>{me?.totalMerges ?? 0}</strong>
                </div>
                <div>
                  <span className="label">Biggest Combo</span>
                  <strong>{me?.biggestCombo ?? 1}x</strong>
                </div>
              </div>
              <div className="mode-actions">
                <button type="button" onClick={requestRematch}>{me?.rematchReady ? "Cancel Rematch" : "Play Again"}</button>
                <button type="button" className="ghost-button" onClick={leaveRoom}>Leave Room</button>
              </div>
              {me?.rematchReady && !opponent?.rematchReady ? <p className="status-note">Waiting for opponent to rematch.</p> : null}
            </div>
          ) : null}
        </>
      }
      sidebar={
        <div className="versus-panel">
          <div className="versus-panel-card">
            <span className="label">Connection</span>
            <strong>{multiplayerAdapterLabel}</strong>
            <span>{multiplayerAdapterStatusReason}</span>
          </div>
          <div className="versus-panel-card">
            <span className="label">Round</span>
            <strong>{room.round}</strong>
            <span>Status: {room.status}</span>
          </div>
          <div className="versus-panel-card">
            <span className="label">Attack Meter</span>
            <div className="attack-meter">
              <div className="attack-meter-fill" style={{ width: `${attackMeterPercent}%` }} />
            </div>
            <span>{Math.round(attackMeterPercent)}%</span>
            <button type="button" disabled={attackMeterPercent < ATTACK_METER_MAX || !isPlaying} onClick={manualAttack}>
              Send Attack
            </button>
          </div>
          <div className="versus-panel-card">
            <span className="label">You</span>
            <strong>{me?.name ?? playerName}</strong>
            <span>Score: {me?.score ?? boardState?.score ?? 0}</span>
            <span>Biggest: {me ? getFruit(me.biggestFruit).emoji : "🍒"}</span>
            <span>Combo: {me?.biggestCombo ?? 1}x</span>
          </div>
          <div className="versus-panel-card">
            <span className="label">Opponent</span>
            <strong>{opponent?.name ?? "Waiting..."}</strong>
            <span>Score: {opponent?.score ?? 0}</span>
            <span>{opponent ? `Current: ${getFruit(opponent.currentFruit).emoji} ${getFruit(opponent.currentFruit).name}` : "Waiting for opponent"}</span>
            <span>{opponent?.connected === false ? "Opponent disconnected" : opponent?.isGameOver ? "Opponent board locked" : "Opponent active"}</span>
          </div>
          <div className="versus-panel-card">
            <span className="label">Live Effects</span>
            <span>{hideNextFruit ? "Next fruit hidden" : "Next fruit visible"}</span>
            <span>{gravityMultiplier > 1 ? "Gravity boosted" : "Normal gravity"}</span>
            <span>{frenzyActive ? "Frenzy scoring active" : "Standard scoring"}</span>
          </div>
          <div className="versus-panel-card">
            <span className="label">Versus Stats</span>
            <span>Best Score: {stats.bestScore}</span>
            <span>Wins: {stats.wins}</span>
            <span>Losses: {stats.losses}</span>
            <span>Rooms: {stats.roomsPlayed}</span>
          </div>
        </div>
      }
    />
  );
}
