export type FruitLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface FruitDefinition {
  level: FruitLevel;
  name: string;
  emoji: string;
  radius: number;
  color: string;
  ring: string;
  score: number;
}

export const WATERMELON_LEVEL: FruitLevel = 8;
export const SMALL_FRUIT_LEVELS: FruitLevel[] = [0, 1, 2];

export const FRUITS: FruitDefinition[] = [
  { level: 0, name: "Cherry", emoji: "🍒", radius: 18, color: "#ff5873", ring: "#ffc2cc", score: 10 },
  { level: 1, name: "Strawberry", emoji: "🍓", radius: 23, color: "#ff6c63", ring: "#ffd7ce", score: 25 },
  { level: 2, name: "Grape", emoji: "🍇", radius: 29, color: "#9f72ff", ring: "#ddd0ff", score: 55 },
  { level: 3, name: "Orange", emoji: "🍊", radius: 35, color: "#ffab43", ring: "#ffe1b0", score: 100 },
  { level: 4, name: "Apple", emoji: "🍎", radius: 42, color: "#ff5f5f", ring: "#ffd0d0", score: 180 },
  { level: 5, name: "Peach", emoji: "🍑", radius: 50, color: "#ff93a6", ring: "#ffe2e8", score: 300 },
  { level: 6, name: "Pineapple", emoji: "🍍", radius: 59, color: "#f8c749", ring: "#ffefb3", score: 500 },
  { level: 7, name: "Melon", emoji: "🍈", radius: 69, color: "#95d97e", ring: "#daf4cf", score: 800 },
  { level: 8, name: "Watermelon", emoji: "🍉", radius: 82, color: "#4abf75", ring: "#caefd6", score: 1300 }
];

export const INITIAL_FRUIT_POOL: FruitLevel[] = [0, 0, 1, 1, 2, 2, 3];
export const GARBAGE_FRUIT_POOL: FruitLevel[] = [0, 1, 1, 2];

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
