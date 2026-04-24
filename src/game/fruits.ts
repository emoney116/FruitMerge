export type FruitLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface FruitDefinition {
  level: FruitLevel;
  name: string;
  emoji: string;
  radius: number;
  color: string;
  ring: string;
  score: number;
  celebrationTier: 1 | 2 | 3 | 4 | 5;
}

export const WATERMELON_LEVEL: FruitLevel = 8;
export const TROPHY_FRUIT_LEVEL: FruitLevel = 14;
export const MAX_FRUIT_LEVEL: FruitLevel = TROPHY_FRUIT_LEVEL;
export const SMALL_FRUIT_LEVELS: FruitLevel[] = [0, 1, 2];

export const FRUITS: FruitDefinition[] = [
  { level: 0, name: "Cherry", emoji: "🍒", radius: 18, color: "#ff5873", ring: "#ffc2cc", score: 10, celebrationTier: 1 },
  { level: 1, name: "Strawberry", emoji: "🍓", radius: 23, color: "#ff6c63", ring: "#ffd7ce", score: 25, celebrationTier: 1 },
  { level: 2, name: "Grape", emoji: "🍇", radius: 29, color: "#9f72ff", ring: "#ddd0ff", score: 55, celebrationTier: 1 },
  { level: 3, name: "Orange", emoji: "🍊", radius: 35, color: "#ffab43", ring: "#ffe1b0", score: 100, celebrationTier: 1 },
  { level: 4, name: "Apple", emoji: "🍎", radius: 42, color: "#ff5f5f", ring: "#ffd0d0", score: 180, celebrationTier: 1 },
  { level: 5, name: "Peach", emoji: "🍑", radius: 50, color: "#ff93a6", ring: "#ffe2e8", score: 300, celebrationTier: 2 },
  { level: 6, name: "Pineapple", emoji: "🍍", radius: 59, color: "#f8c749", ring: "#ffefb3", score: 500, celebrationTier: 2 },
  { level: 7, name: "Melon", emoji: "🍈", radius: 69, color: "#95d97e", ring: "#daf4cf", score: 800, celebrationTier: 2 },
  { level: 8, name: "Watermelon", emoji: "🍉", radius: 82, color: "#4abf75", ring: "#caefd6", score: 1300, celebrationTier: 3 },
  { level: 9, name: "Coconut", emoji: "🥥", radius: 90, color: "#8c674b", ring: "#dcc4ad", score: 1900, celebrationTier: 3 },
  { level: 10, name: "Dragon Fruit", emoji: "🐉", radius: 98, color: "#ff5db2", ring: "#ffd6ec", score: 2800, celebrationTier: 3 },
  { level: 11, name: "Star Fruit", emoji: "⭐", radius: 106, color: "#f8d846", ring: "#fff5b8", score: 4000, celebrationTier: 4 },
  { level: 12, name: "Golden Apple", emoji: "🏆", radius: 114, color: "#f5b630", ring: "#ffeab3", score: 5800, celebrationTier: 4 },
  { level: 13, name: "Galaxy Fruit", emoji: "🌌", radius: 123, color: "#5f7cff", ring: "#d7deff", score: 8200, celebrationTier: 5 },
  { level: 14, name: "Trophy Fruit", emoji: "👑", radius: 132, color: "#ffdf61", ring: "#fff7cf", score: 12000, celebrationTier: 5 }
];

export const INITIAL_FRUIT_POOL: FruitLevel[] = [0, 0, 1, 1, 2, 2, 3];
export const GARBAGE_FRUIT_POOL: FruitLevel[] = [0, 1, 1, 2, 3];
export const HEAVY_GARBAGE_POOL: FruitLevel[] = [2, 3, 4];

export function getFruit(level: FruitLevel): FruitDefinition {
  return FRUITS[level];
}

export function getRandomUpcomingFruit(): FruitLevel {
  const index = Math.floor(Math.random() * INITIAL_FRUIT_POOL.length);
  return INITIAL_FRUIT_POOL[index];
}

export function getRandomGarbageFruit(): FruitLevel {
  const index = Math.floor(Math.random() * GARBAGE_FRUIT_POOL.length);
  return GARBAGE_FRUIT_POOL[index];
}

export function getRandomHeavyGarbageFruit(): FruitLevel {
  const index = Math.floor(Math.random() * HEAVY_GARBAGE_POOL.length);
  return HEAVY_GARBAGE_POOL[index];
}
