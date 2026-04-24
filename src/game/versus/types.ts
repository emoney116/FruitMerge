import type { FruitLevel } from "../fruits";

export type VersusRoomStatus = "waiting" | "ready" | "countdown" | "playing" | "finished";
export type AttackType =
  | "garbage-fruit"
  | "board-shake"
  | "hide-next"
  | "gravity-boost"
  | "heavy-junk"
  | "sticky-cooldown"
  | "slippery-fruit"
  | "pressure-line";
export type AugmentRound = "pregame" | "twoMinute" | "oneMinute";
export type AugmentCategory = "Buff" | "Attack" | "Economy" | "Chaos" | "Defense";

export interface ActiveAttackState {
  type: AttackType;
  endsAt: number;
}

export interface VersusPlayerState {
  id: "host" | "guest";
  name: string;
  score: number;
  currentFruit: FruitLevel;
  biggestFruit: FruitLevel;
  totalMerges: number;
  biggestCombo: number;
  attackMeter: number;
  isGameOver: boolean;
  connected: boolean;
  ready: boolean;
  rematchReady: boolean;
  activeAttacks: ActiveAttackState[];
  selectedAugments: string[];
  activeAugments: string[];
  shieldCharges: number;
  cleanseCharges: number;
  lastUpdated: number;
}

export interface VersusAttackEvent {
  id: string;
  type: AttackType;
  fromPlayerId: "host" | "guest";
  fruitLevel?: FruitLevel;
  durationMs?: number;
  strength?: number;
  createdAt: number;
}

export interface VersusRoomState {
  roomCode: string;
  hostPlayerId: "host" | "guest";
  status: VersusRoomStatus;
  createdAt: number;
  countdownStartedAt: number | null;
  matchStartedAt: number | null;
  matchDurationMs: number;
  round: number;
  currentAugmentRound: AugmentRound | null;
  augmentChoices: Partial<Record<"host" | "guest", string[]>>;
  augmentSelections: Partial<Record<"host" | "guest", string | null>>;
  augmentSelectionLocked: boolean;
  matchPausedForAugment: boolean;
  augmentPauseStartedAt: number | null;
  players: Partial<Record<"host" | "guest", VersusPlayerState>>;
  events: VersusAttackEvent[];
}

export interface VersusSession {
  roomCode: string;
  playerId: "host" | "guest";
}

export interface MultiplayerAdapter {
  kind: "local" | "firebase";
  createRoom(playerName: string): Promise<VersusSession>;
  joinRoom(roomCode: string, playerName: string): Promise<VersusSession>;
  subscribe(roomCode: string, listener: (room: VersusRoomState | null) => void): () => void;
  updatePlayer(roomCode: string, playerId: "host" | "guest", patch: Partial<VersusPlayerState>): Promise<void>;
  setPlayerReady(roomCode: string, playerId: "host" | "guest", ready: boolean): Promise<void>;
  setPlayerRematchReady(roomCode: string, playerId: "host" | "guest", ready: boolean): Promise<void>;
  openAugmentRound(roomCode: string, round: AugmentRound): Promise<void>;
  selectAugment(roomCode: string, playerId: "host" | "guest", augmentId: string): Promise<void>;
  startCountdown(roomCode: string): Promise<void>;
  startMatch(roomCode: string): Promise<void>;
  finishMatch(roomCode: string): Promise<void>;
  resetForRematch(roomCode: string): Promise<void>;
  sendAttack(roomCode: string, event: VersusAttackEvent): Promise<void>;
  leaveRoom(roomCode: string, playerId: "host" | "guest"): Promise<void>;
  readRoom(roomCode: string): VersusRoomState | null;
}

export interface PublicBoardState {
  score: number;
  currentFruit: FruitLevel;
  nextFruit: FruitLevel;
  biggestFruit: FruitLevel;
  totalMerges: number;
  biggestCombo: number;
  stackFill: number;
  isGameOver: boolean;
  isStarted: boolean;
}

export interface MergeSummary {
  to: FruitLevel;
  combo: number;
  points: number;
  mergeCount: number;
}
