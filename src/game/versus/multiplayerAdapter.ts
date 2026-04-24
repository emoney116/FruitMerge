import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase, onDisconnect, onValue, ref, remove, set, update } from "firebase/database";
import { getRandomUpcomingFruit, type FruitLevel } from "../fruits";
import { getAugmentModifiers, pickAugmentChoices } from "./augments";
import type {
  ActiveAttackState,
  AugmentRound,
  MultiplayerAdapter,
  VersusAttackEvent,
  VersusPlayerState,
  VersusRoomState,
  VersusRoomStatus,
  VersusSession
} from "./types";

const ROOM_PREFIX = "fruit-merge-room:";
const CHANNEL_PREFIX = "fruit-merge-room-channel:";
const MATCH_DURATION_MS = 180000;
const ROOM_PLAYER_IDS = ["host", "guest"] as const;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredFirebaseKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID"
] as const;

type FirebaseKey = (typeof requiredFirebaseKeys)[number];
type RoomPlayerId = (typeof ROOM_PLAYER_IDS)[number];

const firebaseEnvPresence: Record<FirebaseKey, boolean> = {
  VITE_FIREBASE_API_KEY: Boolean(import.meta.env.VITE_FIREBASE_API_KEY),
  VITE_FIREBASE_AUTH_DOMAIN: Boolean(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  VITE_FIREBASE_DATABASE_URL: Boolean(import.meta.env.VITE_FIREBASE_DATABASE_URL),
  VITE_FIREBASE_PROJECT_ID: Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  VITE_FIREBASE_APP_ID: Boolean(import.meta.env.VITE_FIREBASE_APP_ID)
};

const firstMissingFirebaseKey = requiredFirebaseKeys.find((key) => !firebaseEnvPresence[key]);
let firebaseInitFailureReason: string | null = null;
const firebaseRoomCache = new Map<string, VersusRoomState | null>();

interface FirebasePlayerRecord {
  name: string;
  score: number;
  currentFruit: FruitLevel;
  biggestFruit: FruitLevel;
  totalMerges: number;
  biggestCombo: number;
  attackMeter: number;
  ready: boolean;
  rematchReady: boolean;
  gameOver: boolean;
  connected: boolean;
  activeAttacks?: ActiveAttackState[];
  selectedAugments?: string[];
  activeAugments?: string[];
  shieldCharges?: number;
  cleanseCharges?: number;
  lastUpdated: number;
}

interface FirebaseRoomRecord {
  status?: VersusRoomStatus;
  createdAt?: number;
  countdownStartedAt?: number | null;
  matchStartedAt?: number | null;
  matchDurationMs?: number;
  round?: number;
  hostPlayerId?: RoomPlayerId;
  currentAugmentRound?: AugmentRound | null;
  augmentChoices?: Partial<Record<RoomPlayerId, string[]>>;
  augmentSelections?: Partial<Record<RoomPlayerId, string | null>>;
  augmentSelectionLocked?: boolean;
  matchPausedForAugment?: boolean;
  augmentPauseStartedAt?: number | null;
  players?: Partial<Record<RoomPlayerId, FirebasePlayerRecord>>;
  events?: VersusAttackEvent[] | Record<string, VersusAttackEvent>;
}

function debugLog(message: string, ...details: unknown[]) {
  console.log(`[Versus] ${message}`, ...details);
}

debugLog("Adapter sees import.meta.env", typeof import.meta.env === "object");
debugLog("Firebase env presence", {
  VITE_FIREBASE_API_KEY: firebaseEnvPresence.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseEnvPresence.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_DATABASE_URL: firebaseEnvPresence.VITE_FIREBASE_DATABASE_URL,
  VITE_FIREBASE_PROJECT_ID: firebaseEnvPresence.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID: firebaseEnvPresence.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_STORAGE_BUCKET: Boolean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  VITE_FIREBASE_MESSAGING_SENDER_ID: Boolean(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID)
});

function getRoomKey(roomCode: string) {
  return `${ROOM_PREFIX}${roomCode}`;
}

function getFirebaseRoomPath(roomCode: string) {
  return `rooms/${roomCode}`;
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function buildRoundCharges(selectedAugments: string[]) {
  const modifiers = getAugmentModifiers(selectedAugments);
  return {
    shieldCharges: modifiers.shieldChargesPerRound,
    cleanseCharges: modifiers.cleanseChargesPerRound
  };
}

function createPlayerState(id: RoomPlayerId, name: string): VersusPlayerState {
  return {
    id,
    name,
    score: 0,
    currentFruit: getRandomUpcomingFruit(),
    biggestFruit: 0,
    totalMerges: 0,
    biggestCombo: 1,
    attackMeter: 0,
    isGameOver: false,
    connected: true,
    ready: false,
    rematchReady: false,
    activeAttacks: [],
    selectedAugments: [],
    activeAugments: [],
    shieldCharges: 0,
    cleanseCharges: 0,
    lastUpdated: Date.now()
  };
}

function createRoomState(roomCode: string, hostName: string): VersusRoomState {
  return {
    roomCode,
    hostPlayerId: "host",
    status: "waiting",
    createdAt: Date.now(),
    countdownStartedAt: null,
    matchStartedAt: null,
    matchDurationMs: MATCH_DURATION_MS,
    round: 1,
    currentAugmentRound: null,
    augmentChoices: {},
    augmentSelections: {},
    augmentSelectionLocked: false,
    matchPausedForAugment: false,
    augmentPauseStartedAt: null,
    players: {
      host: createPlayerState("host", hostName)
    },
    events: []
  };
}

function toFirebasePlayer(player: VersusPlayerState): FirebasePlayerRecord {
  return {
    name: player.name,
    score: player.score,
    currentFruit: player.currentFruit,
    biggestFruit: player.biggestFruit,
    totalMerges: player.totalMerges,
    biggestCombo: player.biggestCombo,
    attackMeter: player.attackMeter,
    ready: player.ready,
    rematchReady: player.rematchReady,
    gameOver: player.isGameOver,
    connected: player.connected,
    activeAttacks: player.activeAttacks,
    selectedAugments: player.selectedAugments,
    activeAugments: player.activeAugments,
    shieldCharges: player.shieldCharges,
    cleanseCharges: player.cleanseCharges,
    lastUpdated: player.lastUpdated
  };
}

function normalizeEvents(events: FirebaseRoomRecord["events"]): VersusAttackEvent[] {
  if (!events) {
    return [];
  }

  if (Array.isArray(events)) {
    return events;
  }

  return Object.values(events);
}

function fromFirebaseRoom(roomCode: string, record: FirebaseRoomRecord | null): VersusRoomState | null {
  if (!record) {
    return null;
  }

  const players: Partial<Record<RoomPlayerId, VersusPlayerState>> = {};
  for (const playerId of ROOM_PLAYER_IDS) {
    const source = record.players?.[playerId];
    if (!source) {
      continue;
    }

    players[playerId] = {
      id: playerId,
      name: source.name,
      score: source.score ?? 0,
      currentFruit: source.currentFruit ?? getRandomUpcomingFruit(),
      biggestFruit: source.biggestFruit ?? 0,
      totalMerges: source.totalMerges ?? 0,
      biggestCombo: source.biggestCombo ?? 1,
      attackMeter: source.attackMeter ?? 0,
      isGameOver: Boolean(source.gameOver),
      connected: source.connected !== false,
      ready: Boolean(source.ready),
      rematchReady: Boolean(source.rematchReady),
      activeAttacks: source.activeAttacks ?? [],
      selectedAugments: source.selectedAugments ?? [],
      activeAugments: source.activeAugments ?? source.selectedAugments ?? [],
      shieldCharges: source.shieldCharges ?? 0,
      cleanseCharges: source.cleanseCharges ?? 0,
      lastUpdated: source.lastUpdated ?? Date.now()
    };
  }

  if (!players.host && !players.guest) {
    return null;
  }

  return {
    roomCode,
    hostPlayerId: record.hostPlayerId ?? "host",
    status: record.status ?? "waiting",
    createdAt: record.createdAt ?? Date.now(),
    countdownStartedAt: record.countdownStartedAt ?? null,
    matchStartedAt: record.matchStartedAt ?? null,
    matchDurationMs: record.matchDurationMs ?? MATCH_DURATION_MS,
    round: record.round ?? 1,
    currentAugmentRound: record.currentAugmentRound ?? null,
    augmentChoices: record.augmentChoices ?? {},
    augmentSelections: record.augmentSelections ?? {},
    augmentSelectionLocked: Boolean(record.augmentSelectionLocked),
    matchPausedForAugment: Boolean(record.matchPausedForAugment),
    augmentPauseStartedAt: record.augmentPauseStartedAt ?? null,
    players,
    events: normalizeEvents(record.events)
  };
}

function cloneRoom(room: VersusRoomState): VersusRoomState {
  return {
    ...room,
    augmentChoices: { ...room.augmentChoices },
    augmentSelections: { ...room.augmentSelections },
    players: { ...room.players },
    events: [...room.events]
  };
}

function getBothPlayers(room: VersusRoomState) {
  return {
    host: room.players.host ?? null,
    guest: room.players.guest ?? null
  };
}

function deriveLobbyStatus(room: VersusRoomState): VersusRoomStatus {
  const { host, guest } = getBothPlayers(room);
  if (room.status === "countdown" || room.status === "playing" || room.status === "finished") {
    return room.status;
  }

  if (host && guest && host.ready && guest.ready) {
    return "ready";
  }

  return "waiting";
}

function getFirebaseStatusReason() {
  if (firstMissingFirebaseKey) {
    return `Missing ${firstMissingFirebaseKey}`;
  }
  if (firebaseInitFailureReason) {
    return firebaseInitFailureReason;
  }
  return "Using Firebase live rooms";
}

function getFirebaseDatabaseSafe() {
  if (firstMissingFirebaseKey) {
    return null;
  }

  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    return getDatabase(app);
  } catch (error) {
    firebaseInitFailureReason = "Firebase initialization failed";
    debugLog("Firebase initialization failed", error);
    return null;
  }
}

function requireFirebaseDatabase() {
  const database = getFirebaseDatabaseSafe();
  if (!database) {
    throw new Error(getFirebaseStatusReason());
  }
  return database;
}

async function readFirebaseRoomOnce(roomCode: string): Promise<VersusRoomState | null> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const database = requireFirebaseDatabase();

  return new Promise((resolve, reject) => {
    const roomRef = ref(database, getFirebaseRoomPath(normalizedCode));
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        unsubscribe();
        const room = snapshot.exists()
          ? fromFirebaseRoom(normalizedCode, snapshot.val() as FirebaseRoomRecord)
          : null;
        firebaseRoomCache.set(normalizedCode, room);
        resolve(room);
      },
      (error) => {
        firebaseInitFailureReason = "Realtime Database unavailable";
        unsubscribe();
        debugLog("Realtime Database unavailable", error);
        reject(error);
      },
      { onlyOnce: true }
    );
  });
}

async function setFirebaseDisconnect(roomCode: string, playerId: RoomPlayerId) {
  const database = requireFirebaseDatabase();
  const playerRef = ref(database, `${getFirebaseRoomPath(roomCode)}/players/${playerId}`);
  await onDisconnect(playerRef).update({
    connected: false,
    lastUpdated: Date.now()
  });
}

function roomToFirebaseRecord(room: VersusRoomState): FirebaseRoomRecord {
  const players: Partial<Record<RoomPlayerId, FirebasePlayerRecord>> = {};
  for (const playerId of ROOM_PLAYER_IDS) {
    const player = room.players[playerId];
    if (player) {
      players[playerId] = toFirebasePlayer(player);
    }
  }

  return {
    status: room.status,
    createdAt: room.createdAt,
    countdownStartedAt: room.countdownStartedAt,
    matchStartedAt: room.matchStartedAt,
    matchDurationMs: room.matchDurationMs,
    round: room.round,
    hostPlayerId: room.hostPlayerId,
    currentAugmentRound: room.currentAugmentRound,
    augmentChoices: room.augmentChoices,
    augmentSelections: room.augmentSelections,
    augmentSelectionLocked: room.augmentSelectionLocked,
    matchPausedForAugment: room.matchPausedForAugment,
    augmentPauseStartedAt: room.augmentPauseStartedAt,
    players,
    events: room.events
  };
}

function prepareAugmentRound(room: VersusRoomState, round: AugmentRound) {
  const { host, guest } = getBothPlayers(room);
  if (!host || !guest || room.currentAugmentRound || room.augmentSelectionLocked) {
    return room;
  }

  room.currentAugmentRound = round;
  room.augmentSelectionLocked = true;
  room.matchPausedForAugment = true;
  room.augmentPauseStartedAt = Date.now();
  room.augmentSelections = {
    host: null,
    guest: null
  };
  room.augmentChoices = {
    host: pickAugmentChoices(host.selectedAugments, 3).map((augment) => augment.id),
    guest: pickAugmentChoices(guest.selectedAugments, 3).map((augment) => augment.id)
  };
  return room;
}

function applyAugmentSelection(room: VersusRoomState, playerId: RoomPlayerId, augmentId: string) {
  if (!room.currentAugmentRound || !room.augmentSelectionLocked) {
    return room;
  }

  const player = room.players[playerId];
  const choices = room.augmentChoices[playerId] ?? [];
  if (!player || !choices.includes(augmentId)) {
    return room;
  }

  room.augmentSelections[playerId] = augmentId;
  const otherPlayerId: RoomPlayerId = playerId === "host" ? "guest" : "host";
  const otherPick = room.augmentSelections[otherPlayerId];
  if (!otherPick) {
    return room;
  }

  const now = Date.now();
  for (const currentPlayerId of ROOM_PLAYER_IDS) {
    const pickedAugmentId = room.augmentSelections[currentPlayerId];
    const currentPlayer = room.players[currentPlayerId];
    if (!pickedAugmentId || !currentPlayer) {
      continue;
    }

    const nextSelected = currentPlayer.selectedAugments.includes(pickedAugmentId)
      ? currentPlayer.selectedAugments
      : [...currentPlayer.selectedAugments, pickedAugmentId];
    const charges = buildRoundCharges(nextSelected);
    room.players[currentPlayerId] = {
      ...currentPlayer,
      selectedAugments: nextSelected,
      activeAugments: nextSelected,
      shieldCharges: charges.shieldCharges,
      cleanseCharges: charges.cleanseCharges,
      lastUpdated: now
    };
  }

  if (room.matchStartedAt && room.augmentPauseStartedAt) {
    room.matchStartedAt += now - room.augmentPauseStartedAt;
  }

  room.currentAugmentRound = null;
  room.augmentChoices = {};
  room.augmentSelections = {};
  room.augmentSelectionLocked = false;
  room.matchPausedForAugment = false;
  room.augmentPauseStartedAt = null;
  return room;
}

function resetRoomForRematch(room: VersusRoomState) {
  room.status = "waiting";
  room.round += 1;
  room.countdownStartedAt = null;
  room.matchStartedAt = null;
  room.currentAugmentRound = null;
  room.augmentChoices = {};
  room.augmentSelections = {};
  room.augmentSelectionLocked = false;
  room.matchPausedForAugment = false;
  room.augmentPauseStartedAt = null;
  room.events = [];

  for (const playerId of ROOM_PLAYER_IDS) {
    const player = room.players[playerId];
    if (!player) {
      continue;
    }

    room.players[playerId] = {
      ...player,
      score: 0,
      currentFruit: getRandomUpcomingFruit(),
      biggestFruit: 0,
      totalMerges: 0,
      biggestCombo: 1,
      attackMeter: 0,
      isGameOver: false,
      ready: false,
      rematchReady: false,
      activeAttacks: [],
      selectedAugments: [],
      activeAugments: [],
      shieldCharges: 0,
      cleanseCharges: 0,
      lastUpdated: Date.now()
    };
  }
}

function readLocalRoom(roomCode: string): VersusRoomState | null {
  const raw = window.localStorage.getItem(getRoomKey(roomCode));
  return raw ? (JSON.parse(raw) as VersusRoomState) : null;
}

function writeLocalRoom(room: VersusRoomState) {
  window.localStorage.setItem(getRoomKey(room.roomCode), JSON.stringify(room));
}

function broadcastLocalRoom(roomCode: string) {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${roomCode}`);
  channel.postMessage({ type: "room-updated" });
  channel.close();
}

function persistLocalRoom(room: VersusRoomState) {
  writeLocalRoom(room);
  broadcastLocalRoom(room.roomCode);
}

async function mutateLocalRoom(roomCode: string, mutator: (room: VersusRoomState) => VersusRoomState | null) {
  const room = readLocalRoom(roomCode);
  if (!room) {
    return;
  }

  const nextRoom = mutator(cloneRoom(room));
  if (!nextRoom) {
    window.localStorage.removeItem(getRoomKey(roomCode));
    broadcastLocalRoom(roomCode);
    return;
  }

  persistLocalRoom(nextRoom);
}

const localMultiplayerAdapter: MultiplayerAdapter = {
  kind: "local",

  async createRoom(playerName: string) {
    let roomCode = createRoomCode();
    while (readLocalRoom(roomCode)) {
      roomCode = createRoomCode();
    }

    const room = createRoomState(roomCode, playerName);
    persistLocalRoom(room);
    debugLog("Local room created", roomCode);
    return { roomCode, playerId: "host" };
  },

  async joinRoom(roomCode: string, playerName: string) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const room = readLocalRoom(normalizedCode);
    if (!room) {
      throw new Error("Room not found. Check the code and try again.");
    }

    if (room.players.guest) {
      throw new Error("Room is full.");
    }

    room.players.guest = createPlayerState("guest", playerName);
    room.status = deriveLobbyStatus(room);
    persistLocalRoom(room);
    return { roomCode: normalizedCode, playerId: "guest" };
  },

  subscribe(roomCode: string, listener) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const onStorage = (event: StorageEvent) => {
      if (event.key === getRoomKey(normalizedCode)) {
        listener(readLocalRoom(normalizedCode));
      }
    };

    listener(readLocalRoom(normalizedCode));
    window.addEventListener("storage", onStorage);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(`${CHANNEL_PREFIX}${normalizedCode}`);
      channel.onmessage = () => listener(readLocalRoom(normalizedCode));
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  },

  async updatePlayer(roomCode, playerId, patch) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      const player = room.players[playerId];
      if (!player) {
        return room;
      }

      room.players[playerId] = {
        ...player,
        ...patch,
        lastUpdated: Date.now()
      };
      if (room.status === "waiting" || room.status === "ready") {
        room.status = deriveLobbyStatus(room);
      }
      return room;
    });
  },

  async setPlayerReady(roomCode, playerId, ready) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      const player = room.players[playerId];
      if (!player || room.status === "countdown" || room.status === "playing") {
        return room;
      }

      room.players[playerId] = {
        ...player,
        ready,
        rematchReady: false,
        activeAttacks: player.activeAttacks,
        lastUpdated: Date.now()
      };
      room.status = deriveLobbyStatus(room);
      return room;
    });
  },

  async setPlayerRematchReady(roomCode, playerId, ready) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      const player = room.players[playerId];
      if (!player || room.status !== "finished") {
        return room;
      }

      room.players[playerId] = {
        ...player,
        rematchReady: ready,
        activeAttacks: player.activeAttacks,
        lastUpdated: Date.now()
      };
      return room;
    });
  },

  async openAugmentRound(roomCode, round) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => prepareAugmentRound(room, round));
  },

  async selectAugment(roomCode, playerId, augmentId) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => applyAugmentSelection(room, playerId, augmentId));
  },

  async startCountdown(roomCode) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      const { host, guest } = getBothPlayers(room);
      if (
        !host ||
        !guest ||
        !host.ready ||
        !guest.ready ||
        room.currentAugmentRound ||
        room.augmentSelectionLocked ||
        room.status === "countdown" ||
        room.status === "playing"
      ) {
        return room;
      }

      room.status = "countdown";
      room.countdownStartedAt = Date.now();
      room.matchStartedAt = null;
      room.events = [];
      room.matchPausedForAugment = false;
      room.augmentPauseStartedAt = null;
      return room;
    });
  },

  async startMatch(roomCode) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      if (room.status !== "countdown") {
        return room;
      }

      room.status = "playing";
      room.matchStartedAt = Date.now();
      room.countdownStartedAt = room.countdownStartedAt ?? Date.now();
      return room;
    });
  },

  async finishMatch(roomCode) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      if (room.status !== "playing" && room.status !== "countdown") {
        return room;
      }

      room.status = "finished";
      room.currentAugmentRound = null;
      room.augmentChoices = {};
      room.augmentSelections = {};
      room.augmentSelectionLocked = false;
      room.matchPausedForAugment = false;
      room.augmentPauseStartedAt = null;
      return room;
    });
  },

  async resetForRematch(roomCode) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      const { host, guest } = getBothPlayers(room);
      if (!host || !guest || !host.rematchReady || !guest.rematchReady) {
        return room;
      }

      resetRoomForRematch(room);
      return room;
    });
  },

  async sendAttack(roomCode, event) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      room.events = [...room.events.slice(-24), event];
      return room;
    });
  },

  async leaveRoom(roomCode, playerId) {
    await mutateLocalRoom(normalizeRoomCode(roomCode), (room) => {
      delete room.players[playerId];
      if (!room.players.host && !room.players.guest) {
        return null;
      }

      room.hostPlayerId = room.players.host ? "host" : "guest";
      room.status = "waiting";
      room.countdownStartedAt = null;
      room.matchStartedAt = null;
      room.currentAugmentRound = null;
      room.augmentChoices = {};
      room.augmentSelections = {};
      room.augmentSelectionLocked = false;
      room.matchPausedForAugment = false;
      room.augmentPauseStartedAt = null;
      room.events = [];
      for (const remainingId of ROOM_PLAYER_IDS) {
        const player = room.players[remainingId];
        if (!player) {
          continue;
        }
        room.players[remainingId] = {
          ...player,
          ready: false,
          rematchReady: false,
          shieldCharges: 0,
          cleanseCharges: 0
        };
      }
      return room;
    });
  },

  readRoom(roomCode) {
    return readLocalRoom(normalizeRoomCode(roomCode));
  }
};

const firebaseMultiplayerAdapter: MultiplayerAdapter = {
  kind: "firebase",

  async createRoom(playerName: string) {
    const database = requireFirebaseDatabase();
    let roomCode = createRoomCode();
    while (await readFirebaseRoomOnce(roomCode)) {
      roomCode = createRoomCode();
    }

    const room = createRoomState(roomCode, playerName);
    await set(ref(database, getFirebaseRoomPath(roomCode)), roomToFirebaseRecord(room));
    await setFirebaseDisconnect(roomCode, "host");
    firebaseRoomCache.set(roomCode, room);
    return { roomCode, playerId: "host" };
  },

  async joinRoom(roomCode, playerName) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = await readFirebaseRoomOnce(normalizedCode);
    if (!room) {
      throw new Error("Room not found. Check the code and try again.");
    }

    if (room.players.guest) {
      throw new Error("Room is full.");
    }

    const guest = createPlayerState("guest", playerName);
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), {
      "players/guest": toFirebasePlayer(guest),
      status: "waiting"
    });
    await setFirebaseDisconnect(normalizedCode, "guest");
    return { roomCode: normalizedCode, playerId: "guest" };
  },

  subscribe(roomCode, listener) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = getFirebaseDatabaseSafe();
    if (!database) {
      listener(null);
      return () => {};
    }

    const roomRef = ref(database, getFirebaseRoomPath(normalizedCode));
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        const room = snapshot.exists()
          ? fromFirebaseRoom(normalizedCode, snapshot.val() as FirebaseRoomRecord)
          : null;
        firebaseRoomCache.set(normalizedCode, room);
        listener(room);
      },
      (error) => {
        firebaseInitFailureReason = "Realtime Database unavailable";
        debugLog("Firebase subscription error", error);
        listener(null);
      }
    );

    return () => unsubscribe();
  },

  async updatePlayer(roomCode, playerId, patch) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const updates: Record<string, unknown> = {
      [`players/${playerId}/lastUpdated`]: Date.now()
    };

    if (typeof patch.name === "string") {
      updates[`players/${playerId}/name`] = patch.name;
    }
    if (typeof patch.score === "number") {
      updates[`players/${playerId}/score`] = patch.score;
    }
    if (typeof patch.currentFruit === "number") {
      updates[`players/${playerId}/currentFruit`] = patch.currentFruit;
    }
    if (typeof patch.biggestFruit === "number") {
      updates[`players/${playerId}/biggestFruit`] = patch.biggestFruit;
    }
    if (typeof patch.totalMerges === "number") {
      updates[`players/${playerId}/totalMerges`] = patch.totalMerges;
    }
    if (typeof patch.biggestCombo === "number") {
      updates[`players/${playerId}/biggestCombo`] = patch.biggestCombo;
    }
    if (typeof patch.attackMeter === "number") {
      updates[`players/${playerId}/attackMeter`] = patch.attackMeter;
    }
    if (typeof patch.isGameOver === "boolean") {
      updates[`players/${playerId}/gameOver`] = patch.isGameOver;
    }
    if (typeof patch.connected === "boolean") {
      updates[`players/${playerId}/connected`] = patch.connected;
    }
    if (typeof patch.ready === "boolean") {
      updates[`players/${playerId}/ready`] = patch.ready;
    }
    if (typeof patch.rematchReady === "boolean") {
      updates[`players/${playerId}/rematchReady`] = patch.rematchReady;
    }
    if (Array.isArray(patch.activeAttacks)) {
      updates[`players/${playerId}/activeAttacks`] = patch.activeAttacks;
    }
    if (Array.isArray(patch.selectedAugments)) {
      updates[`players/${playerId}/selectedAugments`] = patch.selectedAugments;
    }
    if (Array.isArray(patch.activeAugments)) {
      updates[`players/${playerId}/activeAugments`] = patch.activeAugments;
    }
    if (typeof patch.shieldCharges === "number") {
      updates[`players/${playerId}/shieldCharges`] = patch.shieldCharges;
    }
    if (typeof patch.cleanseCharges === "number") {
      updates[`players/${playerId}/cleanseCharges`] = patch.cleanseCharges;
    }

    await update(ref(database, getFirebaseRoomPath(normalizedCode)), updates);
  },

  async setPlayerReady(roomCode, playerId, ready) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room || (room.status !== "waiting" && room.status !== "ready" && room.status !== "finished")) {
      return;
    }

    const player = room.players[playerId];
    if (!player) {
      return;
    }

    room.players[playerId] = {
      ...player,
      ready,
      rematchReady: false,
      lastUpdated: Date.now()
    };
    room.status = deriveLobbyStatus(room);
    room.countdownStartedAt = null;
    room.matchStartedAt = null;
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async setPlayerRematchReady(roomCode, playerId, ready) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room || room.status !== "finished") {
      return;
    }

    const player = room.players[playerId];
    if (!player) {
      return;
    }

    room.players[playerId] = {
      ...player,
      rematchReady: ready,
      lastUpdated: Date.now()
    };
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async openAugmentRound(roomCode, round) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room) {
      return;
    }

    prepareAugmentRound(room, round);
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async selectAugment(roomCode, playerId, augmentId) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room) {
      return;
    }

    applyAugmentSelection(room, playerId, augmentId);
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async startCountdown(roomCode) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    const { host, guest } = room ? getBothPlayers(room) : { host: null, guest: null };
    if (
      !room ||
      !host ||
      !guest ||
      !host.ready ||
      !guest.ready ||
      room.currentAugmentRound ||
      room.augmentSelectionLocked ||
      room.status === "countdown" ||
      room.status === "playing"
    ) {
      return;
    }

    room.status = "countdown";
    room.countdownStartedAt = Date.now();
    room.matchStartedAt = null;
    room.events = [];
    room.matchPausedForAugment = false;
    room.augmentPauseStartedAt = null;
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async startMatch(roomCode) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room || room.status !== "countdown") {
      return;
    }

    room.status = "playing";
    room.matchStartedAt = Date.now();
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async finishMatch(roomCode) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room || room.status === "finished") {
      return;
    }

    room.status = "finished";
    room.currentAugmentRound = null;
    room.augmentChoices = {};
    room.augmentSelections = {};
    room.augmentSelectionLocked = false;
    room.matchPausedForAugment = false;
    room.augmentPauseStartedAt = null;
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async resetForRematch(roomCode) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    const { host, guest } = room ? getBothPlayers(room) : { host: null, guest: null };
    if (!room || !host || !guest || !host.rematchReady || !guest.rematchReady) {
      return;
    }

    resetRoomForRematch(room);
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), roomToFirebaseRecord(room));
  },

  async sendAttack(roomCode, event) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room) {
      return;
    }

    room.events = [...room.events.slice(-24), event];
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), { events: room.events });
  },

  async leaveRoom(roomCode, playerId) {
    const normalizedCode = normalizeRoomCode(roomCode);
    const database = requireFirebaseDatabase();
    const room = firebaseRoomCache.get(normalizedCode) ?? (await readFirebaseRoomOnce(normalizedCode));
    if (!room) {
      return;
    }

    const updates: Record<string, unknown> = {
      [`players/${playerId}`]: null
    };
    const otherPlayerId: RoomPlayerId = playerId === "host" ? "guest" : "host";
    if (!room.players[otherPlayerId]) {
      await remove(ref(database, getFirebaseRoomPath(normalizedCode)));
      return;
    }

    updates.hostPlayerId = otherPlayerId;
    updates.status = "waiting";
    updates.countdownStartedAt = null;
    updates.matchStartedAt = null;
    updates.currentAugmentRound = null;
    updates.augmentChoices = {};
    updates.augmentSelections = {};
    updates.augmentSelectionLocked = false;
    updates.matchPausedForAugment = false;
    updates.augmentPauseStartedAt = null;
    updates.events = [];
    updates[`players/${otherPlayerId}/ready`] = false;
    updates[`players/${otherPlayerId}/rematchReady`] = false;
    updates[`players/${otherPlayerId}/shieldCharges`] = 0;
    updates[`players/${otherPlayerId}/cleanseCharges`] = 0;
    await update(ref(database, getFirebaseRoomPath(normalizedCode)), updates);
  },

  readRoom(roomCode) {
    return firebaseRoomCache.get(normalizeRoomCode(roomCode)) ?? null;
  }
};

const firebaseReady = !firstMissingFirebaseKey && Boolean(getFirebaseDatabaseSafe()) && !firebaseInitFailureReason;

export const multiplayerAdapter: MultiplayerAdapter = firebaseReady ? firebaseMultiplayerAdapter : localMultiplayerAdapter;
export const multiplayerAdapterLabel = firebaseReady ? "Firebase live rooms" : "Local same-browser rooms";
export const multiplayerAdapterStatusReason = firebaseReady ? "Using Firebase live rooms" : getFirebaseStatusReason();
