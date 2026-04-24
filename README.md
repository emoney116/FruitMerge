# Fruit Merge

A polished mobile-first fruit merge game inspired by Suika-style gameplay. The project now includes:

- `Solo Mode` with a special watermelon event
- `Versus Mode` with room codes and a local live multiplayer mock adapter

Built with React, Vite, TypeScript, and a canvas renderer for smooth browser play and easy Vercel deployment.

## Run locally

```bash
npm install
npm run dev
```

For quick iPhone testing:

```bash
run-iphone-webapp.bat
```

Then open the local network URL on your phone while both devices are on the same Wi-Fi network.

## Build

```bash
npm run build
```

## Modes

### Solo Mode

- Drag or tap to aim and drop fruit
- Matching fruit merges into the next fruit tier
- Best solo score is stored separately in `localStorage`
- Creating a watermelon now triggers:
  - big `WATERMELON!` text
  - extra screen shake
  - burst particles
  - special sound
  - slow motion
  - a large bonus score
  - a nearby small-fruit cleanup blast for extra bonus points

### Versus Mode

- Start from the home screen and choose `Versus Mode`
- Create a room in one tab
- Join the room from another tab using the code
- Both boards run independently with their own physics
- Each player sees:
  - their own board
  - opponent score
  - opponent current fruit
  - opponent game-over status
  - room code
- When a player creates a watermelon, the opponent gets an incoming small fruit warning and drop
- Versus stats are stored separately from solo best score
- If Firebase environment variables are configured, the same room code works across multiple phones and browsers

## Multiplayer adapter

The adapter lives in:

- `src/game/versus/multiplayerAdapter.ts`

Behavior:

- With Firebase env vars present, the app uses Firebase Realtime Database for cross-device live rooms
- Without Firebase env vars, it falls back to `localStorage` plus `BroadcastChannel` for same-browser testing

## Firebase setup for multiple phones

1. Create a Firebase project.
2. Enable `Realtime Database`.
3. Set database rules appropriately for your app.
4. Copy `.env.example` to `.env`.
5. Fill in:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
6. Restart `npm run dev`.

Once those values are set, create a room on one phone, open the same deployed or LAN-served app on another phone, and join using the room code.

## Backend notes

- The UI already switches automatically between the Firebase adapter and the local fallback adapter.
- If you later prefer Supabase instead of Firebase, keep the `MultiplayerAdapter` contract in `src/game/versus/types.ts` and replace only the adapter implementation.

## Project structure

- `package.json`
- `index.html`
- `vite.config.ts`
- `run-iphone-webapp.bat`
- `.env.example`
- `src/App.tsx`
- `src/game/FruitMergeGame.tsx`
- `src/game/fruits.ts`
- `src/game/physics.ts`
- `src/game/versus/VersusMode.tsx`
- `src/game/versus/multiplayerAdapter.ts`
- `src/game/versus/types.ts`
- `src/styles.css`

## Notes

- The game uses a custom lightweight circle physics step instead of a full physics engine to keep the project simple and self-contained.
- Audio uses the Web Audio API and starts after the first user interaction, which matches browser autoplay restrictions.
- The current Versus Mode is fully playable locally, but real cross-device internet multiplayer still requires wiring the adapter to Firebase or Supabase.
