import { useEffect, useMemo, useRef, useState } from "react";
import { FruitMergeGame } from "../FruitMergeGame";
import { MAX_FRUIT_LEVEL, WATERMELON_LEVEL, getFruit, getRandomGarbageFruit, getRandomHeavyGarbageFruit, getRandomUpcomingFruit, type FruitLevel } from "../fruits";
import { getAugment, getAugmentDefinitions, getAugmentModifiers, getAugmentRoundLabel, getAugmentRoundPrompt } from "./augments";
import { multiplayerAdapter, multiplayerAdapterLabel, multiplayerAdapterStatusReason } from "./multiplayerAdapter";
import type { ActiveAttackState, AttackType, MergeSummary, PublicBoardState, VersusAttackEvent, VersusPlayerState, VersusRoomState, VersusSession } from "./types";

const VERSUS_STATS_KEY = "fruit-merge-versus-stats";
const COUNTDOWN_MS = 3000;
const ATTACK_METER_MAX = 100;
const FRENZY_MS = 30000;

interface VersusStats { bestScore: number; wins: number; losses: number; roomsPlayed: number; }
const readStats = (): VersusStats => {
  if (typeof window === "undefined") return { bestScore: 0, wins: 0, losses: 0, roomsPlayed: 0 };
  const raw = window.localStorage.getItem(VERSUS_STATS_KEY);
  return raw ? (JSON.parse(raw) as VersusStats) : { bestScore: 0, wins: 0, losses: 0, roomsPlayed: 0 };
};
const formatTimer = (totalMs: number) => `${Math.floor(Math.max(0, Math.ceil(totalMs / 1000)) / 60)}:${String(Math.max(0, Math.ceil(totalMs / 1000)) % 60).padStart(2, "0")}`;
const outcomeText = (me: VersusPlayerState | null, opponent: VersusPlayerState | null) => !me || !opponent ? { headline: "Waiting for players", winner: "" } : me.score === opponent.score ? { headline: "Tie", winner: "No winner" } : me.score > opponent.score ? { headline: "You won", winner: me.name } : { headline: "You lost", winner: opponent.name };
const attackEvent = (fromPlayerId: "host" | "guest", type: AttackType, fruitLevel?: FruitLevel, durationMs?: number, strength?: number): VersusAttackEvent => ({ id: `${fromPlayerId}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, fromPlayerId, fruitLevel, durationMs, strength, createdAt: Date.now() });
const clampMeter = (value: number) => Math.max(0, Math.min(ATTACK_METER_MAX, value));
const withAttackState = (previous: ActiveAttackState[], type: AttackType, endsAt: number) => [...previous.filter((attack) => attack.type !== type), { type, endsAt }];

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
  const [deliveredIncomingAttacks, setDeliveredIncomingAttacks] = useState<VersusAttackEvent[]>([]);
  const [nextFruitOverride, setNextFruitOverride] = useState<{ token: number; fruit: FruitLevel } | null>(null);
  const [scoreBonusEvent, setScoreBonusEvent] = useState<{ token: number; points: number; label?: string } | null>(null);
  const processedIncomingIdsRef = useRef(new Set<string>());
  const outcomeSavedRef = useRef(false);
  const grapeMergesRef = useRef(0);
  const goldenMomentUsedRef = useRef(false);
  const nextFruitTokenRef = useRef(0);
  const bonusTokenRef = useRef(0);
  const mysteryTickRef = useRef(0);
  const rouletteTickRef = useRef(0);
  const suddenDropTickRef = useRef(0);
  const suddenDropUntilRef = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session) return;
    return multiplayerAdapter.subscribe(session.roomCode, setRoom);
  }, [session]);

  const me = session && room ? room.players[session.playerId] ?? null : null;
  const opponent = session && room ? room.players[session.playerId === "host" ? "guest" : "host"] ?? null : null;
  const myModifiers = useMemo(() => getAugmentModifiers(me?.selectedAugments ?? []), [me?.selectedAugments]);
  const myAugments = useMemo(() => getAugmentDefinitions(me?.selectedAugments ?? []), [me?.selectedAugments]);
  const opponentAugments = useMemo(() => getAugmentDefinitions(opponent?.selectedAugments ?? []), [opponent?.selectedAugments]);
  const countdownRemainingMs = !room?.countdownStartedAt || room.status !== "countdown" ? COUNTDOWN_MS : Math.max(0, COUNTDOWN_MS - (now - room.countdownStartedAt));
  const countdownLabel = room?.status === "countdown" ? countdownRemainingMs <= 0 ? "GO!" : String(Math.ceil(countdownRemainingMs / 1000)) : "";
  const matchRemainingMs =
    !room ? 0 :
    !room.matchStartedAt ? room.matchDurationMs :
    room.matchPausedForAugment && room.augmentPauseStartedAt
      ? Math.max(0, room.matchDurationMs - (room.augmentPauseStartedAt - room.matchStartedAt))
      : Math.max(0, room.matchDurationMs - (now - room.matchStartedAt));
  const isLobby = Boolean(session && room && (room.status === "waiting" || room.status === "ready"));
  const isCountdown = room?.status === "countdown";
  const isPlaying = room?.status === "playing";
  const isFinished = room?.status === "finished";
  const isAugmentPause = Boolean(room?.matchPausedForAugment && room.currentAugmentRound);
  const frenzyActive = Boolean(room?.status === "playing" && !room.matchPausedForAugment && matchRemainingMs <= FRENZY_MS);
  const hideNextFruit = localActiveAttacks.some((attack) => attack.type === "hide-next" && attack.endsAt > now);
  const gameplayLocked = !isPlaying || matchRemainingMs <= 0 || isAugmentPause;
  const outcome = outcomeText(me, opponent);
  const myPick = session ? room?.augmentSelections[session.playerId] ?? null : null;
  const opponentPick = session ? room?.augmentSelections[session.playerId === "host" ? "guest" : "host"] ?? null : null;
  const liveEffects = localActiveAttacks.filter((attack) => attack.endsAt > now);

  useEffect(() => {
    if (!me) return;
    setLocalAttackMeter(me.attackMeter);
    setLocalActiveAttacks(me.activeAttacks ?? []);
  }, [me?.id, room?.round]);
  useEffect(() => setLocalActiveAttacks((previous) => previous.filter((attack) => attack.endsAt > now)), [now]);

  useEffect(() => {
    if (!session || !room || session.playerId !== room.hostPlayerId) return;
    const host = room.players.host; const guest = room.players.guest; if (!host || !guest) return;
    const picksDone = Math.min(host.selectedAugments.length, guest.selectedAugments.length);
    if (room.status === "ready" && host.ready && guest.ready && picksDone === 0 && !room.currentAugmentRound) void multiplayerAdapter.openAugmentRound(room.roomCode, "pregame");
    else if (room.status === "ready" && host.ready && guest.ready && picksDone >= 1 && !room.currentAugmentRound) void multiplayerAdapter.startCountdown(room.roomCode);
  }, [room, session]);

  useEffect(() => {
    if (!session || !room || session.playerId !== room.hostPlayerId || room.status !== "playing" || room.matchPausedForAugment) return;
    const picksDone = Math.min(room.players.host?.selectedAugments.length ?? 0, room.players.guest?.selectedAugments.length ?? 0);
    if (matchRemainingMs <= 120000 && picksDone < 2 && !room.currentAugmentRound) void multiplayerAdapter.openAugmentRound(room.roomCode, "twoMinute");
    else if (matchRemainingMs <= 60000 && picksDone < 3 && !room.currentAugmentRound) void multiplayerAdapter.openAugmentRound(room.roomCode, "oneMinute");
    else if (matchRemainingMs <= 0) void multiplayerAdapter.finishMatch(room.roomCode);
  }, [matchRemainingMs, room, session]);

  useEffect(() => { if (session && room?.status === "countdown" && room.countdownStartedAt && session.playerId === room.hostPlayerId && now >= room.countdownStartedAt + COUNTDOWN_MS) void multiplayerAdapter.startMatch(room.roomCode); }, [now, room, session]);
  useEffect(() => { if (session && room?.status === "finished" && session.playerId === room.hostPlayerId && room.players.host?.rematchReady && room.players.guest?.rematchReady) { processedIncomingIdsRef.current.clear(); void multiplayerAdapter.resetForRematch(room.roomCode); } }, [room, session]);

  useEffect(() => {
    if (!session || !room || !boardState || !me) return;
    const gameplayLive = room.status === "playing" && matchRemainingMs > 0 && !room.matchPausedForAugment;
    void multiplayerAdapter.updatePlayer(session.roomCode, session.playerId, { name: playerName.trim() || "Player", score: boardState.score, currentFruit: boardState.currentFruit, biggestFruit: boardState.biggestFruit, totalMerges: boardState.totalMerges, biggestCombo: boardState.biggestCombo, attackMeter: localAttackMeter, activeAttacks: localActiveAttacks, isGameOver: boardState.isGameOver || !gameplayLive, connected: true, ready: me.ready, rematchReady: me.rematchReady });
  }, [boardState, localActiveAttacks, localAttackMeter, matchRemainingMs, me, playerName, room, session]);

  useEffect(() => {
    if (!room || !session || room.status !== "finished" || outcomeSavedRef.current) return;
    const mine = room.players[session.playerId]; if (!mine || !opponent) return;
    const nextStats = { bestScore: Math.max(stats.bestScore, mine.score), wins: stats.wins + (mine.score > opponent.score ? 1 : 0), losses: stats.losses + (mine.score < opponent.score ? 1 : 0), roomsPlayed: stats.roomsPlayed + 1 };
    outcomeSavedRef.current = true; setStats(nextStats); window.localStorage.setItem(VERSUS_STATS_KEY, JSON.stringify(nextStats));
  }, [opponent, room, session, stats]);

  useEffect(() => {
    if (room?.status !== "finished") outcomeSavedRef.current = false;
    if (room?.status === "waiting") { processedIncomingIdsRef.current.clear(); setDeliveredIncomingAttacks([]); setLocalAttackMeter(0); setLocalActiveAttacks([]); setNextFruitOverride(null); setScoreBonusEvent(null); grapeMergesRef.current = 0; goldenMomentUsedRef.current = false; mysteryTickRef.current = 0; rouletteTickRef.current = 0; suddenDropTickRef.current = 0; suddenDropUntilRef.current = 0; }
  }, [room?.round, room?.status]);

  useEffect(() => {
    if (!session || !room || !me || room.status !== "playing" || room.matchPausedForAugment || !boardState) return;
    if (myModifiers.mysteryUpgradeEveryMs > 0 && now - mysteryTickRef.current >= myModifiers.mysteryUpgradeEveryMs) { mysteryTickRef.current = now; if (Math.random() < 0.55) { nextFruitTokenRef.current += 1; setNextFruitOverride({ token: nextFruitTokenRef.current, fruit: Math.min(MAX_FRUIT_LEVEL, boardState.nextFruit + 1) as FruitLevel }); } }
    if (myModifiers.rouletteEveryMs > 0 && now - rouletteTickRef.current >= myModifiers.rouletteEveryMs) { rouletteTickRef.current = now; nextFruitTokenRef.current += 1; setNextFruitOverride({ token: nextFruitTokenRef.current, fruit: getRandomUpcomingFruit() }); }
    if (myModifiers.suddenDropEveryMs > 0 && now - suddenDropTickRef.current >= myModifiers.suddenDropEveryMs) { suddenDropTickRef.current = now; suddenDropUntilRef.current = now + 6000; }
  }, [boardState, me, myModifiers, now, room, session]);

  useEffect(() => {
    if (!session || !room || !me) return;
    const fresh = room.events.filter((event) => event.fromPlayerId !== session.playerId && !processedIncomingIdsRef.current.has(event.id));
    if (fresh.length === 0) return;
    let shieldCharges = me.shieldCharges; let cleanseCharges = me.cleanseCharges; const accepted: VersusAttackEvent[] = [];
    for (const event of fresh) {
      processedIncomingIdsRef.current.add(event.id);
      const junk = event.type === "garbage-fruit" || event.type === "heavy-junk";
      if (shieldCharges > 0) { shieldCharges -= 1; continue; }
      if (junk && cleanseCharges > 0) { cleanseCharges -= 1; continue; }
      const adjusted = { ...event, durationMs: event.type === "hide-next" ? Math.round((event.durationMs ?? 5000) * myModifiers.incomingHideNextMultiplier) : event.durationMs, strength: event.type === "board-shake" ? Math.round((event.strength ?? 16) * myModifiers.incomingShakeMultiplier) : event.strength };
      accepted.push(adjusted);
      if (["hide-next", "gravity-boost", "sticky-cooldown", "slippery-fruit", "pressure-line"].includes(adjusted.type)) setLocalActiveAttacks((previous) => withAttackState(previous, adjusted.type, Date.now() + (adjusted.durationMs ?? 5000)));
    }
    if (shieldCharges !== me.shieldCharges || cleanseCharges !== me.cleanseCharges) void multiplayerAdapter.updatePlayer(session.roomCode, session.playerId, { shieldCharges, cleanseCharges });
    if (accepted.length > 0) setDeliveredIncomingAttacks((previous) => [...previous, ...accepted]);
  }, [me, myModifiers.incomingHideNextMultiplier, myModifiers.incomingShakeMultiplier, room, session]);

  const createRoom = async () => { try { setError(""); setSession(await multiplayerAdapter.createRoom(playerName.trim() || "Player 1")); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create room."); } };
  const joinRoom = async () => { try { setError(""); setSession(await multiplayerAdapter.joinRoom(joinCode.trim().toUpperCase(), playerName.trim() || "Player 2")); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to join room."); } };
  const leaveRoom = async () => { if (session) await multiplayerAdapter.leaveRoom(session.roomCode, session.playerId); setRoom(null); setSession(null); setBoardState(null); setJoinCode(""); setLocalAttackMeter(0); setLocalActiveAttacks([]); setDeliveredIncomingAttacks([]); };
  const toggleReady = async () => { if (session && me) { setError(""); await multiplayerAdapter.setPlayerReady(session.roomCode, session.playerId, !me.ready); } };
  const requestRematch = async () => { if (session && me) await multiplayerAdapter.setPlayerRematchReady(session.roomCode, session.playerId, !me.rematchReady); };
  const queueBonus = (points: number, label?: string) => { if (points > 0) { bonusTokenRef.current += 1; setScoreBonusEvent({ token: bonusTokenRef.current, points, label }); } };
  const sendAttackBurst = async (events: VersusAttackEvent[], meterCost = 0) => { if (session && room?.status === "playing") { if (meterCost) setLocalAttackMeter((value) => clampMeter(value - meterCost)); await Promise.all(events.map((event) => multiplayerAdapter.sendAttack(session.roomCode, event))); } };
  const buildAttackBurst = (kind: "manual" | "bigFruit", level?: FruitLevel) => {
    if (!session) return [];
    const baseType: AttackType = kind === "manual" ? (["garbage-fruit", "board-shake", "hide-next", "gravity-boost", "heavy-junk"][Math.floor(Math.random() * 5)] as AttackType) : level && level >= 12 ? "heavy-junk" : level && level >= 10 ? "gravity-boost" : "garbage-fruit";
    const events: VersusAttackEvent[] = [];
    if (baseType === "garbage-fruit") events.push(attackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit()));
    if (baseType === "heavy-junk") events.push(attackEvent(session.playerId, "heavy-junk", getRandomHeavyGarbageFruit()));
    if (baseType === "board-shake") events.push(attackEvent(session.playerId, "board-shake", undefined, 0, Math.round(16 * myModifiers.attackShakeMultiplier)));
    if (baseType === "hide-next") events.push(attackEvent(session.playerId, "hide-next", undefined, 5000 + myModifiers.manualHideNextBonusMs));
    if (baseType === "gravity-boost") events.push(attackEvent(session.playerId, "gravity-boost", undefined, 5000 + myModifiers.attackGravityBonusMs));
    if (myModifiers.extraGarbageChance > 0 && Math.random() < Math.min(0.65, myModifiers.extraGarbageChance)) events.push(attackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit()));
    if (kind === "bigFruit" && myModifiers.autoAttackStrengthMultiplier > 1.1) {
      if (level && level >= 12) events.push(attackEvent(session.playerId, "board-shake", undefined, 0, Math.round(14 * myModifiers.autoAttackStrengthMultiplier)));
      else events.push(attackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit()));
    }
    if (myModifiers.stickyCooldownMs > 0) events.push(attackEvent(session.playerId, "sticky-cooldown", undefined, 4500));
    if (myModifiers.slipperyDurationMs > 0) events.push(attackEvent(session.playerId, "slippery-fruit", undefined, myModifiers.slipperyDurationMs));
    if (myModifiers.pressureLineOffset > 0) events.push(attackEvent(session.playerId, "pressure-line", undefined, 5500, myModifiers.pressureLineOffset));
    return events;
  };
  const manualAttack = async () => { if (localAttackMeter >= ATTACK_METER_MAX && isPlaying && !isAugmentPause) await sendAttackBurst(buildAttackBurst("manual"), ATTACK_METER_MAX); };
  const chooseAugment = async (augmentId: string) => { if (session && room?.currentAugmentRound && !myPick) await multiplayerAdapter.selectAugment(session.roomCode, session.playerId, augmentId); };

  const handleMergeSummary = async (summary: MergeSummary) => {
    if (!session || !room || room.status !== "playing" || room.matchPausedForAugment) return;
    let effectiveLevel = summary.to; let bonusMultiplier = (myModifiers.fruitScoreMultipliers[summary.to] ?? 1) * myModifiers.globalScoreMultiplier;
    if (summary.to >= myModifiers.minFruitScoreLevel) bonusMultiplier *= myModifiers.minFruitScoreMultiplier;
    if (summary.combo > 1) bonusMultiplier *= 1 + Math.max(0, myModifiers.comboBonusMultiplier - 1) * Math.min(0.5, 0.16 * (summary.combo - 1));
    if (matchRemainingMs <= 60000) bonusMultiplier *= myModifiers.finalMinuteScoreMultiplier;
    if ((boardState?.stackFill ?? 1) < 0.5) bonusMultiplier *= myModifiers.lowBoardScoreMultiplier;
    if (now < suddenDropUntilRef.current) bonusMultiplier *= myModifiers.suddenDropScoreMultiplier;
    if (myModifiers.luckyMergeChance > 0 && Math.random() < myModifiers.luckyMergeChance) { effectiveLevel = Math.min(MAX_FRUIT_LEVEL, summary.to + 1) as FruitLevel; bonusMultiplier *= 1.15; }
    if (!goldenMomentUsedRef.current && myModifiers.goldenMomentMultiplier > 0 && Math.random() < 0.08) { goldenMomentUsedRef.current = true; bonusMultiplier *= myModifiers.goldenMomentMultiplier; }
    queueBonus(Math.round(summary.points * Math.max(0, bonusMultiplier - 1)), bonusMultiplier > 1.2 ? "Augment Bonus!" : undefined);
    if (summary.to === 2 && myModifiers.grapeBombEvery > 0) { grapeMergesRef.current += 1; if (grapeMergesRef.current % myModifiers.grapeBombEvery === 0) await sendAttackBurst([attackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit())]); }
    if (summary.combo >= Math.max(4, myModifiers.comboAttackThreshold) && myModifiers.comboAttackThreshold > 0) await sendAttackBurst([attackEvent(session.playerId, "garbage-fruit", getRandomGarbageFruit())]);
    if (summary.combo >= 4 && myModifiers.foggyPreviewDurationMs > 0) await sendAttackBurst([attackEvent(session.playerId, "hide-next", undefined, myModifiers.foggyPreviewDurationMs)]);
    const scoreDeficit = Math.max(0, (opponent?.score ?? 0) - (me?.score ?? boardState?.score ?? 0));
    const comebackBoost = scoreDeficit > 2400 ? 1.18 : scoreDeficit > 1200 ? 1.1 : 1;
    const losingBoost = scoreDeficit > 0 ? myModifiers.losingMeterMultiplier : 1;
    const celebration = getFruit(effectiveLevel).celebrationTier;
    const gainedMeter = (6 + celebration * 3 + Math.max(0, summary.combo - 1) * 4) * myModifiers.meterGainMultiplier * comebackBoost * losingBoost + (summary.combo >= 3 ? myModifiers.comboMeterBonus : 0) + (summary.to <= 3 ? myModifiers.smallMergeMeterBonus : 0) + (summary.to >= 7 ? myModifiers.bigMergeMeterBonus : 0);
    setLocalAttackMeter((value) => clampMeter(value + Math.round(gainedMeter)));
    if (effectiveLevel >= WATERMELON_LEVEL) await sendAttackBurst(buildAttackBurst("bigFruit", effectiveLevel));
  };

  const statusMessage = !room || !me ? "" : isAugmentPause ? myPick ? "Waiting for opponent to choose augment." : "Choose an augment to resume the match." : room.status === "waiting" || room.status === "ready" ? me.ready ? opponent?.ready ? "Both players ready. Opening augment is next." : "You are ready. Waiting on opponent." : opponent?.ready ? "Opponent is ready. You can lock in whenever you're set." : "Match starts when both players are ready." : room.status === "countdown" ? "Countdown running. Get ready!" : room.status === "playing" ? frenzyActive ? "FRENZY TIME! Points are boosted 1.5x." : opponent?.connected === false ? "Opponent disconnected. Match stays open until time runs out." : "Highest score at 3:00 wins." : me.rematchReady ? "Waiting for opponent to rematch." : "Match finished. Choose Play Again to rematch.";

  if (!session) return <div className="mode-shell"><section className="mode-card"><span className="badge">Versus Mode</span><h1>Live room duels</h1><p>{multiplayerAdapter.kind === "firebase" ? "Create a room code and join it from another phone or browser. Firebase keeps both boards and augment rounds synced live." : "Create a room in one tab, then join it in another tab to simulate a live friend match with synced score, augments, and attacks."}</p><p className="status-note">{multiplayerAdapterStatusReason}</p><label className="stack-label">Display Name<input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={18} /></label><div className="mode-actions"><button type="button" onClick={createRoom}>Create Room</button><button type="button" className="ghost-button" onClick={onExit}>Back</button></div><div className="join-panel"><label className="stack-label">Room Code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={5} placeholder="ABCDE" /></label><button type="button" onClick={joinRoom}>Join Room</button></div>{error ? <p className="error-text">{error}</p> : null}<div className="tips-card"><strong>{multiplayerAdapter.kind === "firebase" ? "Live backend status" : "How the local live mock works"}</strong><p>{multiplayerAdapter.kind === "firebase" ? `${multiplayerAdapterLabel} is active. Share the room code with another phone and both players can join from separate devices.` : `Open the app in two tabs on the same browser profile. Create a room in one tab, join it in the other, and both boards will sync through the local multiplayer adapter. ${multiplayerAdapterStatusReason}`}</p></div></section></div>;
  if (!room || isLobby) return <div className="mode-shell"><section className="mode-card"><span className="badge">Room {session.roomCode}</span><h1>Versus Lobby</h1><p>Match starts when both players are ready.</p><p className="status-note">{statusMessage || multiplayerAdapterStatusReason}</p><div className="versus-panel"><div className="versus-panel-card"><span className="label">Connection</span><strong>{multiplayerAdapterLabel}</strong><span>{multiplayerAdapterStatusReason}</span></div><div className="versus-panel-card"><span className="label">You</span><strong>{me?.name ?? playerName}</strong><span>{me?.ready ? "You are ready" : "Not ready yet"}</span><span>{me?.connected === false ? "Reconnecting..." : "Connected"}</span></div><div className="versus-panel-card"><span className="label">Opponent</span><strong>{opponent?.name ?? "Waiting..."}</strong><span>{opponent ? (opponent.ready ? "Opponent is ready" : "Waiting on opponent") : "Share the room code to join."}</span><span>{opponent?.connected === false ? "Opponent disconnected" : opponent ? "Connected" : "No opponent yet"}</span></div></div><div className="mode-actions"><button type="button" onClick={toggleReady}>{me?.ready ? "Unready" : "Ready"}</button><button type="button" className="ghost-button" onClick={leaveRoom}>Leave Room</button></div></section></div>;

  return <FruitMergeGame mode="versus" title={`Versus Room ${session.roomCode}`} subtitle={statusMessage || "Highest score wins once the timer ends."} bestScoreKey="fruit-merge-best-versus-score" onExit={async () => { await leaveRoom(); onExit(); }} onStateChange={setBoardState} onMergeSummary={handleMergeSummary} incomingAttacks={deliveredIncomingAttacks} autoStart={isCountdown || isPlaying || isFinished} gameplayLocked={gameplayLocked} simulationPaused={isAugmentPause} resetToken={room.round} allowPause={false} allowRestart={false} hideStartOverlay frenzyMultiplier={frenzyActive ? 1.5 : 1} hideNextFruit={hideNextFruit} gravityMultiplier={myModifiers.gravityMultiplier * (now < suddenDropUntilRef.current ? myModifiers.suddenDropGravityMultiplier : 1)} bounceMultiplier={myModifiers.bounceMultiplier} spawnDriftMultiplier={myModifiers.spawnDriftMultiplier} incomingJunkScaleMultiplier={myModifiers.incomingJunkScaleMultiplier} nextFruitOverride={nextFruitOverride} scoreBonusEvent={scoreBonusEvent} statusPill={<span className={`timer-pill ${frenzyActive ? "frenzy-pill" : ""}`}>{isPlaying ? formatTimer(matchRemainingMs) : isCountdown ? countdownLabel || "3" : "Final"}</span>} overlayContent={<>{isAugmentPause ? <div className="augment-overlay"><span className="label">{getAugmentRoundLabel(room.currentAugmentRound)}</span><h2>Choose Your Augment</h2><p>{getAugmentRoundPrompt(room.currentAugmentRound)}</p>{myPick ? <p className="status-note">Waiting for opponent to choose augment.</p> : <div className="augment-grid">{(session ? room.augmentChoices[session.playerId] ?? [] : []).map((augmentId) => { const augment = getAugment(augmentId); return augment ? <button key={augment.id} type="button" className="augment-card" onClick={() => void chooseAugment(augment.id)}><span className="augment-icon">{augment.icon}</span><strong>{augment.name}</strong><span className="augment-type">{augment.category}</span><span>{augment.description}</span></button> : null; })}</div>}{opponentPick ? <p className="status-note">Opponent locked in.</p> : null}</div> : null}{isCountdown ? <div className="countdown-overlay"><span className="label">Starting</span><strong>{countdownLabel}</strong></div> : null}{frenzyActive ? <div className="frenzy-banner">FRENZY TIME!</div> : null}{isFinished ? <div className="results-overlay results-overlay-wide"><span className="label">Final Result</span><h2>{outcome.headline}</h2><p>{outcome.winner === "No winner" ? "Both players finished with the same score." : `Winner: ${outcome.winner}`}</p><div className="results-grid"><div><span className="label">You</span><strong>{me?.score ?? 0}</strong></div><div><span className="label">Opponent</span><strong>{opponent?.score ?? 0}</strong></div><div><span className="label">Biggest Fruit</span><strong>{me ? `${getFruit(me.biggestFruit).emoji} ${getFruit(me.biggestFruit).name}` : "-"}</strong></div><div><span className="label">Opponent Fruit</span><strong>{opponent ? `${getFruit(opponent.biggestFruit).emoji} ${getFruit(opponent.biggestFruit).name}` : "-"}</strong></div><div><span className="label">Total Merges</span><strong>{me?.totalMerges ?? 0}</strong></div><div><span className="label">Biggest Combo</span><strong>{me?.biggestCombo ?? 1}x</strong></div></div><div className="augment-summary-grid"><div><span className="label">Your Augments</span><div className="augment-list">{myAugments.map((augment) => <span key={augment.id} className="mini-pill">{augment.icon} {augment.name}</span>)}</div></div><div><span className="label">Opponent Augments</span><div className="augment-list">{opponentAugments.map((augment) => <span key={augment.id} className="mini-pill">{augment.icon} {augment.name}</span>)}</div></div></div><div className="mode-actions"><button type="button" onClick={requestRematch}>{me?.rematchReady ? "Cancel Rematch" : "Play Again"}</button><button type="button" className="ghost-button" onClick={leaveRoom}>Leave Room</button></div>{me?.rematchReady && !opponent?.rematchReady ? <p className="status-note">Waiting for opponent to rematch.</p> : null}</div> : null}</>} sidebar={<div className={`versus-panel ${frenzyActive ? "frenzy-sidebar" : ""}`}><div className="versus-panel-card"><span className="label">Connection</span><strong>{multiplayerAdapterLabel}</strong><span>{multiplayerAdapterStatusReason}</span></div><div className="versus-panel-card"><span className="label">Round</span><strong>{room.round}</strong><span>Status: {room.status}</span><span>{room.currentAugmentRound ? getAugmentRoundLabel(room.currentAugmentRound) : "No augment break"}</span></div><div className="versus-panel-card"><span className="label">Attack Meter</span><div className="attack-meter"><div className="attack-meter-fill" style={{ width: `${Math.min(100, localAttackMeter)}%` }} /></div><span>{Math.round(localAttackMeter)}%</span><button type="button" disabled={localAttackMeter < ATTACK_METER_MAX || !isPlaying || isAugmentPause} onClick={manualAttack}>Send Attack</button></div><div className="versus-panel-card"><span className="label">You</span><strong>{me?.name ?? playerName}</strong><span>Score: {me?.score ?? boardState?.score ?? 0}</span><span>Biggest: {me ? `${getFruit(me.biggestFruit).emoji} ${getFruit(me.biggestFruit).name}` : "-"}</span><span>Combo: {me?.biggestCombo ?? 1}x</span></div><div className="versus-panel-card"><span className="label">Opponent</span><strong>{opponent?.name ?? "Waiting..."}</strong><span>Score: {opponent?.score ?? 0}</span><span>{opponent ? `Current: ${getFruit(opponent.currentFruit).emoji} ${getFruit(opponent.currentFruit).name}` : "Waiting for opponent"}</span><span>{opponent?.connected === false ? "Opponent disconnected" : opponent?.isGameOver ? "Opponent board locked" : "Opponent active"}</span></div><div className="versus-panel-card"><span className="label">Active Augments</span><div className="augment-list">{myAugments.length > 0 ? myAugments.map((augment) => <span key={augment.id} className="mini-pill">{augment.icon} {augment.name}</span>) : <span>No augments yet</span>}</div></div><div className="versus-panel-card"><span className="label">Incoming Effects</span><div className="augment-list">{liveEffects.length > 0 ? liveEffects.map((attack) => <span key={attack.type} className="mini-pill">{attack.type}</span>) : <span>Board steady</span>}</div></div><div className="versus-panel-card"><span className="label">Versus Stats</span><span>Best Score: {stats.bestScore}</span><span>Wins: {stats.wins}</span><span>Losses: {stats.losses}</span><span>Rooms: {stats.roomsPlayed}</span></div></div>} />;
}
