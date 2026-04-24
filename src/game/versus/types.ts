import type { FruitLevel } from "../fruits";

export type VersusRoomStatus = "waiting" | "ready" | "countdown" | "playing" | "finished";

export interface VersusPlayerState {
  id: "host" | "guest";
  name: string;
  score: number;
  currentFruit: FruitLevel;
  isGameOver: boolean;
  connected: boolean;
  ready: boolean;
  rematchReady: boolean;
  lastUpdated: number;
}

export interface VersusAttackEvent {
  id: string;
  type: "incoming-fruit";
  fromPlayerId: "host" | "guest";
  fruitLevel: FruitLevel;
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
  isGameOver: boolean;
  isStarted: boolean;
}
