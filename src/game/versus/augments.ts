import type { FruitLevel } from "../fruits";
import type { AttackType, AugmentCategory, AugmentRound } from "./types";

export interface AugmentDefinition {
  id: string;
  name: string;
  description: string;
  category: AugmentCategory;
  icon: string;
  powerTier: 1 | 2 | 3;
  effect: {
    fruitScoreMultiplier?: Partial<Record<number, number>>;
    minFruitScoreMultiplier?: { minLevel: FruitLevel; multiplier: number };
    globalScoreMultiplier?: number;
    comboBonusMultiplier?: number;
    finalMinuteScoreMultiplier?: number;
    lowBoardScoreMultiplier?: number;
    gravityMultiplier?: number;
    meterGainMultiplier?: number;
    losingMeterMultiplier?: number;
    comboMeterBonus?: number;
    smallMergeMeterBonus?: number;
    bigMergeMeterBonus?: number;
    bounceMultiplier?: number;
    spawnDriftMultiplier?: number;
    autoAttackStrengthMultiplier?: number;
    manualHideNextBonusMs?: number;
    extraGarbageChance?: number;
    attackShakeMultiplier?: number;
    grapeBombEvery?: number;
    comboAttackThreshold?: number;
    shieldChargesPerRound?: number;
    cleanseChargesPerRound?: number;
    incomingShakeMultiplier?: number;
    incomingHideNextMultiplier?: number;
    incomingJunkScaleMultiplier?: number;
    mysteryUpgradeEveryMs?: number;
    rouletteEveryMs?: number;
    luckyMergeChance?: number;
    goldenMomentMultiplier?: number;
    suddenDropEveryMs?: number;
    suddenDropScoreMultiplier?: number;
    suddenDropGravityMultiplier?: number;
    stickyCooldownMs?: number;
    foggyPreviewDurationMs?: number;
    attackGravityBonusMs?: number;
    slipperyDurationMs?: number;
    pressureLineOffset?: number;
  };
}

export interface AugmentModifierSummary {
  fruitScoreMultipliers: Partial<Record<number, number>>;
  minFruitScoreMultiplier: number;
  minFruitScoreLevel: FruitLevel;
  globalScoreMultiplier: number;
  comboBonusMultiplier: number;
  finalMinuteScoreMultiplier: number;
  lowBoardScoreMultiplier: number;
  gravityMultiplier: number;
  meterGainMultiplier: number;
  losingMeterMultiplier: number;
  comboMeterBonus: number;
  smallMergeMeterBonus: number;
  bigMergeMeterBonus: number;
  bounceMultiplier: number;
  spawnDriftMultiplier: number;
  autoAttackStrengthMultiplier: number;
  manualHideNextBonusMs: number;
  extraGarbageChance: number;
  attackShakeMultiplier: number;
  grapeBombEvery: number;
  comboAttackThreshold: number;
  shieldChargesPerRound: number;
  cleanseChargesPerRound: number;
  incomingShakeMultiplier: number;
  incomingHideNextMultiplier: number;
  incomingJunkScaleMultiplier: number;
  mysteryUpgradeEveryMs: number;
  rouletteEveryMs: number;
  luckyMergeChance: number;
  goldenMomentMultiplier: number;
  suddenDropEveryMs: number;
  suddenDropScoreMultiplier: number;
  suddenDropGravityMultiplier: number;
  stickyCooldownMs: number;
  foggyPreviewDurationMs: number;
  attackGravityBonusMs: number;
  slipperyDurationMs: number;
  pressureLineOffset: number;
}

export const AUGMENT_ROUNDS: AugmentRound[] = ["pregame", "twoMinute", "oneMinute"];

export const AUGMENTS: AugmentDefinition[] = [
  { id: "grape-specialist", name: "Grape Specialist", description: "Grape merges are worth triple points.", category: "Buff", icon: "🍇", powerTier: 2, effect: { fruitScoreMultiplier: { 2: 3 } } },
  { id: "citrus-bonus", name: "Citrus Bonus", description: "Orange and Apple merges are worth double.", category: "Buff", icon: "🍊", powerTier: 2, effect: { fruitScoreMultiplier: { 3: 2, 4: 2 } } },
  { id: "big-fruit-bonus", name: "Big Fruit Bonus", description: "Melon and above merges gain 25% more score.", category: "Buff", icon: "🍈", powerTier: 2, effect: { minFruitScoreMultiplier: { minLevel: 7 as FruitLevel, multiplier: 1.25 } } },
  { id: "combo-banker", name: "Combo Banker", description: "Combo bonuses are 50% stronger.", category: "Economy", icon: "💥", powerTier: 2, effect: { comboBonusMultiplier: 1.5 } },
  { id: "late-bloomer", name: "Late Bloomer", description: "Gain 20% more score in the final minute.", category: "Economy", icon: "🌙", powerTier: 2, effect: { finalMinuteScoreMultiplier: 1.2 } },
  { id: "clean-board-bonus", name: "Clean Board Bonus", description: "Merges score 15% more while your stack stays low.", category: "Defense", icon: "🧺", powerTier: 1, effect: { lowBoardScoreMultiplier: 1.15 } },
  { id: "quick-drop", name: "Quick Drop", description: "Fruits fall faster and all score gains rise by 10%.", category: "Buff", icon: "⚡", powerTier: 2, effect: { gravityMultiplier: 1.15, globalScoreMultiplier: 1.1 } },
  { id: "slow-hands", name: "Slow Hands", description: "Gravity eases up, but your meter fills 10% slower.", category: "Defense", icon: "🫧", powerTier: 1, effect: { gravityMultiplier: 0.9, meterGainMultiplier: 0.9 } },
  { id: "precision-drop", name: "Precision Drop", description: "Your board gets less bounce for cleaner stacks.", category: "Defense", icon: "🎯", powerTier: 1, effect: { bounceMultiplier: 0.82 } },
  { id: "soft-landing", name: "Soft Landing", description: "Fresh fruit enters with gentler drift and calmer landings.", category: "Defense", icon: "🪶", powerTier: 1, effect: { spawnDriftMultiplier: 0.7, bounceMultiplier: 0.9 } },
  { id: "gravity-training", name: "Gravity Training", description: "Slightly stronger gravity, but combos charge more meter.", category: "Buff", icon: "🏋️", powerTier: 2, effect: { gravityMultiplier: 1.08, comboMeterBonus: 4 } },
  { id: "grape-bomb", name: "Grape Bomb", description: "Every 5 grape merges sends a small junk fruit.", category: "Attack", icon: "💣", powerTier: 2, effect: { grapeBombEvery: 5 } },
  { id: "watermelon-warlord", name: "Watermelon Warlord", description: "Watermelon and higher auto-attacks hit harder.", category: "Attack", icon: "🍉", powerTier: 2, effect: { autoAttackStrengthMultiplier: 1.3 } },
  { id: "blind-toss", name: "Blind Toss", description: "Manual attacks hide the opponent preview for longer.", category: "Attack", icon: "🕶️", powerTier: 2, effect: { manualHideNextBonusMs: 2500 } },
  { id: "heavy-rain", name: "Heavy Rain", description: "Your attacks can drop a second small garbage fruit.", category: "Attack", icon: "🌧️", powerTier: 2, effect: { extraGarbageChance: 0.34 } },
  { id: "board-rattle", name: "Board Rattle", description: "Your shake attacks last longer and hit harder.", category: "Attack", icon: "📳", powerTier: 2, effect: { attackShakeMultiplier: 1.45 } },
  { id: "sneaky-seed", name: "Sneaky Seed", description: "Big combos can sneak a bonus junk fruit onto the other board.", category: "Attack", icon: "🌱", powerTier: 2, effect: { comboAttackThreshold: 4 } },
  { id: "shielded-board", name: "Shielded Board", description: "Block the first incoming attack each augment round.", category: "Defense", icon: "🛡️", powerTier: 2, effect: { shieldChargesPerRound: 1 } },
  { id: "cleanse", name: "Cleanse", description: "Negate one junk-style attack each augment round.", category: "Defense", icon: "🧼", powerTier: 2, effect: { cleanseChargesPerRound: 1 } },
  { id: "stable-basket", name: "Stable Basket", description: "Incoming board shake is 50% weaker.", category: "Defense", icon: "🪵", powerTier: 1, effect: { incomingShakeMultiplier: 0.5 } },
  { id: "clear-mind", name: "Clear Mind", description: "Hide-next attacks wear off 50% faster.", category: "Defense", icon: "🧠", powerTier: 1, effect: { incomingHideNextMultiplier: 0.5 } },
  { id: "anti-junk", name: "Anti-Junk", description: "Incoming junk fruit is a little smaller.", category: "Defense", icon: "🧹", powerTier: 1, effect: { incomingJunkScaleMultiplier: 0.85 } },
  { id: "meter-boost", name: "Meter Boost", description: "Attack meter fills 20% faster.", category: "Economy", icon: "🔋", powerTier: 2, effect: { meterGainMultiplier: 1.2 } },
  { id: "underdog-charge", name: "Underdog Charge", description: "Meter fills faster whenever you're trailing.", category: "Economy", icon: "📈", powerTier: 2, effect: { losingMeterMultiplier: 1.3 } },
  { id: "combo-battery", name: "Combo Battery", description: "Combos above 3x add extra attack meter.", category: "Economy", icon: "🔌", powerTier: 2, effect: { comboMeterBonus: 6 } },
  { id: "efficient-merges", name: "Efficient Merges", description: "Small merges give extra attack meter.", category: "Economy", icon: "🪙", powerTier: 1, effect: { smallMergeMeterBonus: 6 } },
  { id: "big-merge-charge", name: "Big Merge Charge", description: "Large fruit merges give a much bigger meter spike.", category: "Economy", icon: "🌋", powerTier: 2, effect: { bigMergeMeterBonus: 10 } },
  { id: "mystery-fruit", name: "Mystery Fruit", description: "Every 20 seconds your next fruit may upgrade by one level.", category: "Chaos", icon: "🎁", powerTier: 2, effect: { mysteryUpgradeEveryMs: 20000 } },
  { id: "fruit-roulette", name: "Fruit Roulette", description: "Your next fruit occasionally rerolls into another starter fruit.", category: "Chaos", icon: "🎰", powerTier: 1, effect: { rouletteEveryMs: 18000 } },
  { id: "lucky-merge", name: "Lucky Merge", description: "Small chance for a merge to count as one level higher.", category: "Chaos", icon: "🍀", powerTier: 3, effect: { luckyMergeChance: 0.08 } },
  { id: "golden-moment", name: "Golden Moment", description: "Once per match, one merge cashes out at 5x points.", category: "Chaos", icon: "✨", powerTier: 3, effect: { goldenMomentMultiplier: 5 } },
  { id: "sudden-drop", name: "Sudden Drop", description: "Once per minute, your next drop is faster and scores more.", category: "Chaos", icon: "🪂", powerTier: 2, effect: { suddenDropEveryMs: 60000, suddenDropScoreMultiplier: 1.4, suddenDropGravityMultiplier: 1.45 } },
  { id: "sticky-hands", name: "Sticky Hands", description: "Attacks can slow the opponent's drop rhythm.", category: "Attack", icon: "🕸️", powerTier: 2, effect: { stickyCooldownMs: 260 } },
  { id: "foggy-preview", name: "Foggy Preview", description: "Big combos briefly hide the opponent's next fruit.", category: "Attack", icon: "🌫️", powerTier: 2, effect: { foggyPreviewDurationMs: 2500 } },
  { id: "heavy-basket", name: "Heavy Basket", description: "Your attacks extend the opponent gravity spike.", category: "Attack", icon: "🏋️‍♀️", powerTier: 2, effect: { attackGravityBonusMs: 2500 } },
  { id: "slippery-fruit", name: "Slippery Fruit", description: "Your attacks make the opponent board bouncier for a moment.", category: "Attack", icon: "🧊", powerTier: 2, effect: { slipperyDurationMs: 5000 } },
  { id: "pressure-line", name: "Pressure Line", description: "Your attacks nudge the opponent danger line lower for a while.", category: "Attack", icon: "🚨", powerTier: 2, effect: { pressureLineOffset: 16 } }
];

const AUGMENT_MAP = new Map(AUGMENTS.map((augment) => [augment.id, augment]));

export function getAugment(id: string) {
  return AUGMENT_MAP.get(id) ?? null;
}

export function getAugmentRoundLabel(round: AugmentRound | null) {
  if (round === "pregame") {
    return "Opening Augment";
  }
  if (round === "twoMinute") {
    return "2:00 Augment";
  }
  if (round === "oneMinute") {
    return "1:00 Augment";
  }
  return "";
}

export function getAugmentRoundPrompt(round: AugmentRound | null) {
  if (round === "pregame") {
    return "Choose your opening game plan before the countdown begins.";
  }
  if (round === "twoMinute") {
    return "Mid-game augment break. Lock in your next edge.";
  }
  if (round === "oneMinute") {
    return "Final augment break. One last twist before the finish.";
  }
  return "";
}

export function getAugmentDefinitions(ids: string[]) {
  return ids.map((id) => getAugment(id)).filter((augment): augment is AugmentDefinition => Boolean(augment));
}

export function pickAugmentChoices(ownedIds: string[], count = 3) {
  const excluded = new Set(ownedIds);
  const pool = AUGMENTS.filter((augment) => !excluded.has(augment.id));
  const choices = [...pool];

  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }

  return choices.slice(0, Math.min(count, choices.length));
}

export function getAugmentModifiers(ids: string[]): AugmentModifierSummary {
  const summary: AugmentModifierSummary = {
    fruitScoreMultipliers: {},
    minFruitScoreMultiplier: 1,
    minFruitScoreLevel: 14,
    globalScoreMultiplier: 1,
    comboBonusMultiplier: 1,
    finalMinuteScoreMultiplier: 1,
    lowBoardScoreMultiplier: 1,
    gravityMultiplier: 1,
    meterGainMultiplier: 1,
    losingMeterMultiplier: 1,
    comboMeterBonus: 0,
    smallMergeMeterBonus: 0,
    bigMergeMeterBonus: 0,
    bounceMultiplier: 1,
    spawnDriftMultiplier: 1,
    autoAttackStrengthMultiplier: 1,
    manualHideNextBonusMs: 0,
    extraGarbageChance: 0,
    attackShakeMultiplier: 1,
    grapeBombEvery: 0,
    comboAttackThreshold: 0,
    shieldChargesPerRound: 0,
    cleanseChargesPerRound: 0,
    incomingShakeMultiplier: 1,
    incomingHideNextMultiplier: 1,
    incomingJunkScaleMultiplier: 1,
    mysteryUpgradeEveryMs: 0,
    rouletteEveryMs: 0,
    luckyMergeChance: 0,
    goldenMomentMultiplier: 0,
    suddenDropEveryMs: 0,
    suddenDropScoreMultiplier: 1,
    suddenDropGravityMultiplier: 1,
    stickyCooldownMs: 0,
    foggyPreviewDurationMs: 0,
    attackGravityBonusMs: 0,
    slipperyDurationMs: 0,
    pressureLineOffset: 0
  };

  for (const augment of getAugmentDefinitions(ids)) {
    const effect = augment.effect;
    if (effect.fruitScoreMultiplier) {
      for (const [level, multiplier] of Object.entries(effect.fruitScoreMultiplier)) {
        if (typeof multiplier !== "number") {
          continue;
        }
        const numericLevel = Number(level);
        summary.fruitScoreMultipliers[numericLevel] = (summary.fruitScoreMultipliers[numericLevel] ?? 1) * multiplier;
      }
    }
    if (effect.minFruitScoreMultiplier) {
      if (effect.minFruitScoreMultiplier.minLevel < summary.minFruitScoreLevel) {
        summary.minFruitScoreLevel = effect.minFruitScoreMultiplier.minLevel;
      }
      summary.minFruitScoreMultiplier *= effect.minFruitScoreMultiplier.multiplier;
    }
    summary.globalScoreMultiplier *= effect.globalScoreMultiplier ?? 1;
    summary.comboBonusMultiplier *= effect.comboBonusMultiplier ?? 1;
    summary.finalMinuteScoreMultiplier *= effect.finalMinuteScoreMultiplier ?? 1;
    summary.lowBoardScoreMultiplier *= effect.lowBoardScoreMultiplier ?? 1;
    summary.gravityMultiplier *= effect.gravityMultiplier ?? 1;
    summary.meterGainMultiplier *= effect.meterGainMultiplier ?? 1;
    summary.losingMeterMultiplier *= effect.losingMeterMultiplier ?? 1;
    summary.comboMeterBonus += effect.comboMeterBonus ?? 0;
    summary.smallMergeMeterBonus += effect.smallMergeMeterBonus ?? 0;
    summary.bigMergeMeterBonus += effect.bigMergeMeterBonus ?? 0;
    summary.bounceMultiplier *= effect.bounceMultiplier ?? 1;
    summary.spawnDriftMultiplier *= effect.spawnDriftMultiplier ?? 1;
    summary.autoAttackStrengthMultiplier *= effect.autoAttackStrengthMultiplier ?? 1;
    summary.manualHideNextBonusMs += effect.manualHideNextBonusMs ?? 0;
    summary.extraGarbageChance += effect.extraGarbageChance ?? 0;
    summary.attackShakeMultiplier *= effect.attackShakeMultiplier ?? 1;
    summary.grapeBombEvery = Math.max(summary.grapeBombEvery, effect.grapeBombEvery ?? 0);
    summary.comboAttackThreshold = Math.max(summary.comboAttackThreshold, effect.comboAttackThreshold ?? 0);
    summary.shieldChargesPerRound += effect.shieldChargesPerRound ?? 0;
    summary.cleanseChargesPerRound += effect.cleanseChargesPerRound ?? 0;
    summary.incomingShakeMultiplier *= effect.incomingShakeMultiplier ?? 1;
    summary.incomingHideNextMultiplier *= effect.incomingHideNextMultiplier ?? 1;
    summary.incomingJunkScaleMultiplier *= effect.incomingJunkScaleMultiplier ?? 1;
    summary.mysteryUpgradeEveryMs = Math.max(summary.mysteryUpgradeEveryMs, effect.mysteryUpgradeEveryMs ?? 0);
    summary.rouletteEveryMs = Math.max(summary.rouletteEveryMs, effect.rouletteEveryMs ?? 0);
    summary.luckyMergeChance += effect.luckyMergeChance ?? 0;
    summary.goldenMomentMultiplier = Math.max(summary.goldenMomentMultiplier, effect.goldenMomentMultiplier ?? 0);
    summary.suddenDropEveryMs = Math.max(summary.suddenDropEveryMs, effect.suddenDropEveryMs ?? 0);
    summary.suddenDropScoreMultiplier *= effect.suddenDropScoreMultiplier ?? 1;
    summary.suddenDropGravityMultiplier *= effect.suddenDropGravityMultiplier ?? 1;
    summary.stickyCooldownMs += effect.stickyCooldownMs ?? 0;
    summary.foggyPreviewDurationMs += effect.foggyPreviewDurationMs ?? 0;
    summary.attackGravityBonusMs += effect.attackGravityBonusMs ?? 0;
    summary.slipperyDurationMs += effect.slipperyDurationMs ?? 0;
    summary.pressureLineOffset += effect.pressureLineOffset ?? 0;
  }

  return summary;
}
