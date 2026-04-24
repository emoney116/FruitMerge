import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import {
  SMALL_FRUIT_LEVELS,
  TROPHY_FRUIT_LEVEL,
  WATERMELON_LEVEL,
  getFruit,
  getRandomUpcomingFruit,
  type FruitLevel
} from "./fruits";
import {
  addBody,
  clearBodiesInRadius,
  createBody,
  createWorld,
  removeAllBodies,
  resizeWorld,
  stepWorld,
  type WorldState
} from "./physics";
import type { MergeSummary, PublicBoardState, VersusAttackEvent } from "./versus/types";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  style?: "default" | "celebration" | "warning";
}

interface PendingGarbage {
  id: string;
  fruitLevel: FruitLevel;
  executeAt: number;
}

export interface FruitMergeGameProps {
  mode?: "solo" | "versus";
  title?: string;
  subtitle?: string;
  bestScoreKey?: string;
  onExit?: () => void;
  onStateChange?: (state: PublicBoardState) => void;
  onWatermelon?: () => void;
  incomingAttacks?: VersusAttackEvent[];
  sidebar?: ReactNode;
  compact?: boolean;
  autoStart?: boolean;
  gameplayLocked?: boolean;
  resetToken?: number;
  allowPause?: boolean;
  allowRestart?: boolean;
  hideStartOverlay?: boolean;
  statusPill?: ReactNode;
  overlayContent?: ReactNode;
  simulationPaused?: boolean;
  frenzyMultiplier?: number;
  hideNextFruit?: boolean;
  gravityMultiplier?: number;
  bounceMultiplier?: number;
  spawnDriftMultiplier?: number;
  dropCooldownMultiplier?: number;
  dangerLineOffset?: number;
  incomingJunkScaleMultiplier?: number;
  nextFruitOverride?: { token: number; fruit: FruitLevel } | null;
  scoreBonusEvent?: { token: number; points: number; label?: string } | null;
  onMergeSummary?: (summary: MergeSummary) => void;
}

const DEFAULT_BEST_SCORE_KEY = "fruit-merge-best-score";
const COMBO_WINDOW = 1400;
const WATERMELON_BONUS = 2400;
const WATERMELON_BLAST_RADIUS = 132;

function readBestScore(key: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const stored = window.localStorage.getItem(key);
  return stored ? Number.parseInt(stored, 10) || 0 : 0;
}

function readBestFruit(key: string) {
  if (typeof window === "undefined") {
    return 0 as FruitLevel;
  }

  const stored = window.localStorage.getItem(`${key}-biggest`);
  const parsed = stored ? Number.parseInt(stored, 10) : 0;
  return (Number.isFinite(parsed) ? Math.max(0, Math.min(TROPHY_FRUIT_LEVEL, parsed)) : 0) as FruitLevel;
}

export function FruitMergeGame({
  mode = "solo",
  title = "Fruit Merge",
  subtitle = "Drop matching fruit, chain combos, and keep the pile below the danger line.",
  bestScoreKey = DEFAULT_BEST_SCORE_KEY,
  onExit,
  onStateChange,
  onWatermelon,
  incomingAttacks = [],
  sidebar,
  compact = false,
  autoStart = false,
  gameplayLocked = false,
  resetToken = 0,
  allowPause = true,
  allowRestart = true,
  hideStartOverlay = false,
  statusPill,
  overlayContent,
  simulationPaused = false,
  frenzyMultiplier = 1,
  hideNextFruit = false,
  gravityMultiplier = 1,
  bounceMultiplier = 1,
  spawnDriftMultiplier = 1,
  dropCooldownMultiplier = 1,
  dangerLineOffset = 0,
  incomingJunkScaleMultiplier = 1,
  nextFruitOverride = null,
  scoreBonusEvent = null,
  onMergeSummary
}: FruitMergeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<WorldState>(createWorld(390, 620));
  const particlesRef = useRef<Particle[]>([]);
  const textRef = useRef<FloatingText[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const releaseDropRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const comboCountRef = useRef(0);
  const comboExpireRef = useRef(0);
  const overDangerTimeRef = useRef(0);
  const pendingDropRef = useRef(0);
  const processedAttackIdsRef = useRef(new Set<string>());
  const pendingGarbageRef = useRef<PendingGarbage[]>([]);
  const slowMotionUntilRef = useRef(0);
  const shakeRef = useRef(0);
  const hideNextUntilRef = useRef(0);
  const gravityBoostUntilRef = useRef(0);
  const stickyCooldownUntilRef = useRef(0);
  const slipperyUntilRef = useRef(0);
  const pressureLineUntilRef = useRef(0);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => readBestScore(bestScoreKey));
  const [bestFruit, setBestFruit] = useState<FruitLevel>(() => readBestFruit(bestScoreKey));
  const [currentFruit, setCurrentFruit] = useState<FruitLevel>(() => getRandomUpcomingFruit());
  const [nextFruit, setNextFruit] = useState<FruitLevel>(() => getRandomUpcomingFruit());
  const [biggestFruit, setBiggestFruit] = useState<FruitLevel>(0);
  const [totalMerges, setTotalMerges] = useState(0);
  const [biggestCombo, setBiggestCombo] = useState(1);
  const [aimX, setAimX] = useState(195);
  const [isStarted, setIsStarted] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [comboText, setComboText] = useState("");
  const [dangerProgress, setDangerProgress] = useState(0);
  const [shake, setShake] = useState(0);
  const [dimensions, setDimensions] = useState({ width: compact ? 356 : 390, height: compact ? 560 : 620 });
  const [watermelonText, setWatermelonText] = useState("");

  const dangerLine = useMemo(() => Math.max(108, dimensions.height * 0.18), [dimensions.height]);
  const dropY = useMemo(() => Math.max(68, dimensions.height * 0.1), [dimensions.height]);
  const scale = useMemo(() => dimensions.width / 390, [dimensions.width]);

  const getCurrentDangerLine = (time = performance.now()) =>
    dangerLine + dangerLineOffset + (time < pressureLineUntilRef.current ? 20 : 0);

  const getStackFill = () => {
    if (worldRef.current.bodies.length === 0) {
      return 0;
    }

    const highestPoint = Math.min(...worldRef.current.bodies.map((body) => body.y - body.radius));
    const usableHeight = Math.max(1, dimensions.height - dropY);
    return Math.max(0, Math.min(1, (dimensions.height - highestPoint) / usableHeight));
  };

  useEffect(() => {
    const updateSize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = compact ? 390 : 430;
      const width = Math.min(maxWidth, Math.max(320, viewportWidth - (compact ? 12 : 24)));
      const minHeight = compact ? 500 : 520;
      const maxHeight = compact ? 660 : 760;
      const reservedHeight = compact ? 210 : 170;
      const height = Math.min(maxHeight, Math.max(minHeight, viewportHeight - reservedHeight));
      const previousWidth = worldRef.current.width;
      setDimensions({ width, height });
      setAimX((value) => Math.max(36, Math.min(width - 36, (value / previousWidth) * width)));
      resizeWorld(worldRef.current, width, height);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [compact]);

  useEffect(() => {
    setBestScore(readBestScore(bestScoreKey));
    setBestFruit(readBestFruit(bestScoreKey));
  }, [bestScoreKey]);

  useEffect(() => {
    window.localStorage.setItem(bestScoreKey, String(bestScore));
  }, [bestScore, bestScoreKey]);

  useEffect(() => {
    window.localStorage.setItem(`${bestScoreKey}-biggest`, String(bestFruit));
  }, [bestFruit, bestScoreKey]);

  useEffect(() => {
    if (autoStart && !isStarted) {
      setIsStarted(true);
    }
  }, [autoStart, isStarted]);

  useEffect(() => {
    resetGame(autoStart);
  }, [resetToken]);

  useEffect(() => {
    onStateChange?.({
      score,
      currentFruit,
      nextFruit,
      biggestFruit,
      totalMerges,
      biggestCombo,
      stackFill: getStackFill(),
      isGameOver,
      isStarted
    });
  }, [biggestCombo, biggestFruit, currentFruit, isGameOver, isStarted, nextFruit, onStateChange, score, totalMerges]);

  useEffect(() => {
    if (!nextFruitOverride) {
      return;
    }

    setNextFruit(nextFruitOverride.fruit);
  }, [nextFruitOverride]);

  useEffect(() => {
    if (!scoreBonusEvent || scoreBonusEvent.points === 0) {
      return;
    }

    setScore((previous) => {
      const nextScore = previous + scoreBonusEvent.points;
      setBestScore((previousBest) => Math.max(previousBest, nextScore));
      return nextScore;
    });
    pushFloatingText(scoreBonusEvent.label ?? `+${scoreBonusEvent.points}`, dimensions.width / 2, 96, "celebration");
    playTone(520, 0.09, "triangle", 0.06);
  }, [scoreBonusEvent]);

  useEffect(() => {
    const incoming = incomingAttacks.filter((event) => !processedAttackIdsRef.current.has(event.id));
    if (incoming.length === 0) {
      return;
    }

    const now = performance.now();
    for (const event of incoming) {
      processedAttackIdsRef.current.add(event.id);
      if (event.type === "garbage-fruit" || event.type === "heavy-junk") {
        pendingGarbageRef.current.push({
          id: event.id,
          fruitLevel: event.fruitLevel ?? 0,
          executeAt: now + 900
        });
        setComboText(event.type === "heavy-junk" ? "Heavy junk incoming!" : "Incoming fruit!");
        pushFloatingText(event.type === "heavy-junk" ? "Heavy junk!" : "Incoming fruit!", dimensions.width / 2, dropY + 18, "warning");
      } else if (event.type === "board-shake") {
        triggerShake(Math.max(12, event.strength ?? 16));
        pushFloatingText("Board shake!", dimensions.width / 2, dropY + 18, "warning");
      } else if (event.type === "hide-next") {
        hideNextUntilRef.current = now + (event.durationMs ?? 5000);
        pushFloatingText("Next fruit hidden!", dimensions.width / 2, dropY + 18, "warning");
      } else if (event.type === "gravity-boost") {
        gravityBoostUntilRef.current = now + (event.durationMs ?? 5000);
        pushFloatingText("Gravity spike!", dimensions.width / 2, dropY + 18, "warning");
      } else if (event.type === "sticky-cooldown") {
        stickyCooldownUntilRef.current = now + (event.durationMs ?? 4500);
        pushFloatingText("Sticky hands!", dimensions.width / 2, dropY + 18, "warning");
      } else if (event.type === "slippery-fruit") {
        slipperyUntilRef.current = now + (event.durationMs ?? 5000);
        pushFloatingText("Slippery fruit!", dimensions.width / 2, dropY + 18, "warning");
      } else if (event.type === "pressure-line") {
        pressureLineUntilRef.current = now + (event.durationMs ?? 6000);
        pushFloatingText("Pressure line!", dimensions.width / 2, dropY + 18, "warning");
      }

      triggerShake(8);
      playTone(210, 0.08, "sawtooth", 0.06);
    }
  }, [dimensions.width, dropY, incomingAttacks]);

  useEffect(() => {
    const preventTouchMove = (event: TouchEvent) => {
      if (stageRef.current?.contains(event.target as Node)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchmove", preventTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", preventTouchMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const loop = (now: number) => {
      const rawDelta = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 1 / 60;
      lastFrameRef.current = now;
      const timeScale = now < slowMotionUntilRef.current ? 0.42 : 1;
      const deltaSeconds = rawDelta * timeScale;
      worldRef.current.gravity = 1800 * gravityMultiplier * (now < gravityBoostUntilRef.current ? 1.45 : 1);
      worldRef.current.wallBounce = 0.18 * bounceMultiplier * (now < slipperyUntilRef.current ? 1.4 : 1);
      worldRef.current.floorBounce = 0.08 * bounceMultiplier * (now < slipperyUntilRef.current ? 1.55 : 1);

      if (isStarted && !isPaused && !isGameOver && !simulationPaused) {
        pendingDropRef.current = Math.max(0, pendingDropRef.current - rawDelta);
        const merges = stepWorld(worldRef.current, deltaSeconds, now);
        if (merges.length > 0) {
          handleMerges(merges, now);
        }
        updateDanger(rawDelta, getCurrentDangerLine(now));
        maybeDropIncomingGarbage(now);
      }

      updateEffects(rawDelta);
      draw(context);
      animationFrameRef.current = window.requestAnimationFrame(loop);
    };

    animationFrameRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    compact,
    currentFruit,
    dimensions.height,
    dimensions.width,
    isGameOver,
    isPaused,
    isStarted,
    simulationPaused,
    comboText,
    shake,
    scale,
    watermelonText
  ]);

  const maybeDropIncomingGarbage = (now: number) => {
    if (pendingGarbageRef.current.length === 0) {
      return;
    }

    const due = pendingGarbageRef.current.filter((entry) => entry.executeAt <= now);
    if (due.length === 0) {
      return;
    }

    pendingGarbageRef.current = pendingGarbageRef.current.filter((entry) => entry.executeAt > now);
    for (const garbage of due) {
      const fruit = getFruit(garbage.fruitLevel);
      const minX = fruit.radius * scale + 10;
      const maxX = dimensions.width - fruit.radius * scale - 10;
      const randomX = minX + Math.random() * Math.max(1, maxX - minX);
      const body = createBody(garbage.fruitLevel, randomX, dropY + 8, scale, worldRef.current.nextId++);
      body.radius *= incomingJunkScaleMultiplier;
      body.vx = (Math.random() - 0.5) * 90 * spawnDriftMultiplier;
      addBody(worldRef.current, body);
      playTone(180 + garbage.fruitLevel * 30, 0.07, "square", 0.05);
      spawnParticles(randomX, dropY + 18, fruit.color, 14, 1.2);
    }
  };

  const handleMerges = (merges: Array<{ x: number; y: number; from: FruitLevel; to: FruitLevel }>, now: number) => {
    let pointsEarned = 0;
    let highestMerged: FruitLevel = biggestFruit;
    let highestComboThisTick = biggestCombo;

    for (const merge of merges) {
      const fruit = getFruit(merge.to);
      highestMerged = merge.to > highestMerged ? merge.to : highestMerged;
      spawnParticles(merge.x, merge.y, fruit.color, merge.to >= 6 ? 18 : 12, merge.to >= 6 ? 1.35 : 1);
      comboCountRef.current = now < comboExpireRef.current ? comboCountRef.current + 1 : 1;
      comboExpireRef.current = now + COMBO_WINDOW;
      highestComboThisTick = Math.max(highestComboThisTick, comboCountRef.current);
      const comboBonusMultiplier = 1 + Math.max(0, comboCountRef.current - 1) * 0.18;
      const scoredPoints = Math.round(fruit.score * comboBonusMultiplier * frenzyMultiplier);
      pointsEarned += scoredPoints;

      if (comboCountRef.current > 1) {
        const combo = `${comboCountRef.current}x Combo!`;
        setComboText(combo);
        pushFloatingText(combo, merge.x, merge.y - 18, "celebration");
      } else {
        setComboText("");
      }

      pushFloatingText(`+${scoredPoints}`, merge.x, merge.y);
      playTone(merge.to >= 5 ? 460 : 320 + merge.to * 28, merge.to >= 6 ? 0.12 : 0.08, "triangle", merge.to >= 6 ? 0.085 : 0.07);

      if (fruit.celebrationTier >= 2) {
        triggerShake(fruit.celebrationTier >= 4 ? 18 : fruit.celebrationTier >= 3 ? 20 : 10);
      }

      if (merge.to === WATERMELON_LEVEL) {
        pointsEarned += triggerWatermelonEvent(merge.x, merge.y);
      }
      if (merge.to > WATERMELON_LEVEL) {
        pointsEarned += triggerAscensionEvent(merge.to, merge.x, merge.y);
      }

      onMergeSummary?.({
        to: merge.to,
        combo: comboCountRef.current,
        points: scoredPoints,
        mergeCount: merges.length
      });
    }

    setBiggestFruit((previous) => {
      const next = highestMerged > previous ? highestMerged : previous;
      setBestFruit((previousBest) => (next > previousBest ? next : previousBest));
      return next;
    });
    setTotalMerges((previous) => previous + merges.length);
    setBiggestCombo((previous) => Math.max(previous, highestComboThisTick));
    setScore((previous) => {
      const nextValue = previous + pointsEarned;
      setBestScore((previousBest) => Math.max(previousBest, nextValue));
      return nextValue;
    });
  };

  const triggerAscensionEvent = (level: FruitLevel, x: number, y: number) => {
    const fruit = getFruit(level);
    setWatermelonText(level === TROPHY_FRUIT_LEVEL ? "TROPHY FRUIT!" : `${fruit.name.toUpperCase()}!`);
    setComboText(level === TROPHY_FRUIT_LEVEL ? "TROPHY FRUIT!" : `${fruit.name.toUpperCase()}!`);
    slowMotionUntilRef.current = performance.now() + (fruit.celebrationTier >= 5 ? 900 : 700);
    triggerShake(fruit.celebrationTier >= 5 ? 28 : 18);
    spawnRainbowBurst(x, y);
    spawnParticles(x, y, fruit.color, fruit.celebrationTier >= 5 ? 28 : 22, 2.1);
    playTone(180 + level * 15, 0.18, "sawtooth", 0.12);
    playTone(240 + level * 20, 0.28, "triangle", 0.08, 0.03);
    pushFloatingText(level === TROPHY_FRUIT_LEVEL ? "Ultimate Merge!" : `${fruit.name}!`, x, y - 36, "celebration");
    return Math.round(fruit.score * (level === TROPHY_FRUIT_LEVEL ? 0.8 : 0.35));
  };

  const triggerWatermelonEvent = (x: number, y: number) => {
    setWatermelonText("WATERMELON!");
    setComboText("WATERMELON!");
    pushFloatingText("WATERMELON!", x, y - 28, "celebration");
    slowMotionUntilRef.current = performance.now() + 650;
    triggerShake(22);
    spawnRainbowBurst(x, y);
    playTone(160, 0.16, "sawtooth", 0.1);
    playTone(240, 0.24, "triangle", 0.06, 0.03);
    onWatermelon?.();

    const cleared = clearBodiesInRadius(
      worldRef.current,
      x,
      y,
      WATERMELON_BLAST_RADIUS * scale,
      (body) => SMALL_FRUIT_LEVELS.includes(body.level) && Math.abs(body.x - x) + Math.abs(body.y - y) > 10
    );

    let blastBonus = WATERMELON_BONUS;
    for (const body of cleared) {
      spawnParticles(body.x, body.y, getFruit(body.level).color, 10, 0.8);
      blastBonus += getFruit(body.level).score + 40;
    }

    if (cleared.length > 0) {
      pushFloatingText(`Blast +${blastBonus - WATERMELON_BONUS}`, x, y + 26, "celebration");
    }

    return blastBonus;
  };

  const updateDanger = (deltaSeconds: number, currentDangerLine: number) => {
    const inDanger = worldRef.current.bodies.some((body) => body.y - body.radius < currentDangerLine && body.vy > -80);

    if (inDanger) {
      overDangerTimeRef.current += deltaSeconds;
    } else {
      overDangerTimeRef.current = Math.max(0, overDangerTimeRef.current - deltaSeconds * 1.8);
    }

    const progress = Math.min(1, overDangerTimeRef.current / 2.6);
    setDangerProgress(progress);

    if (overDangerTimeRef.current >= 2.6) {
      setIsGameOver(true);
      setComboText(mode === "versus" ? "Board Locked" : "Stack Overflow");
      playTone(130, 0.18, "sawtooth", 0.1);
    }
  };

  const updateEffects = (deltaSeconds: number) => {
    particlesRef.current = particlesRef.current
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * deltaSeconds,
        y: particle.y + particle.vy * deltaSeconds,
        vy: particle.vy + 760 * deltaSeconds,
        life: particle.life - deltaSeconds
      }))
      .filter((particle) => particle.life > 0);

    textRef.current = textRef.current
      .map((text) => ({
        ...text,
        y: text.y - (text.style === "celebration" ? 34 : 28) * deltaSeconds,
        life: text.life - deltaSeconds
      }))
      .filter((text) => text.life > 0);

    if (shakeRef.current > 0) {
      const nextShake = Math.max(0, shakeRef.current - 22 * deltaSeconds);
      shakeRef.current = nextShake;
      setShake(nextShake);
    }

    if (comboText && performance.now() > comboExpireRef.current && watermelonText === "") {
      setComboText("");
    }

    if (watermelonText && performance.now() > slowMotionUntilRef.current + 420) {
      setWatermelonText("");
    }
  };

  const spawnParticles = (x: number, y: number, color: string, count = 12, speedScale = 1) => {
    const newParticles: Particle[] = Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4;
      const speed = (80 + Math.random() * 160) * speedScale;
      return {
        id: performance.now() + index + Math.random(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8,
        color,
        size: 4 + Math.random() * 5
      };
    });

    particlesRef.current.push(...newParticles);
  };

  const spawnRainbowBurst = (x: number, y: number) => {
    const palette = ["#ff617c", "#ffb347", "#ffe45d", "#6bd8a8", "#72a8ff", "#c28cff"];
    for (const color of palette) {
      spawnParticles(x, y, color, 16, 1.8);
    }
  };

  const pushFloatingText = (text: string, x: number, y: number, style: FloatingText["style"] = "default") => {
    textRef.current.push({
      id: performance.now() + Math.random(),
      text,
      x,
      y,
      life: style === "celebration" ? 1.2 : 0.9,
      maxLife: style === "celebration" ? 1.2 : 0.9,
      style
    });
  };

  const ensureAudioContext = () => {
    if (typeof window === "undefined" || isMuted) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const playTone = (
    frequency: number,
    duration: number,
    type: OscillatorType = "triangle",
    volume = 0.07,
    delay = 0
  ) => {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startTime = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 1.7), startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };

  const triggerShake = (amount: number) => {
    shakeRef.current = Math.max(shakeRef.current, amount);
    setShake(Math.max(shakeRef.current, amount));
  };

  const dropFruit = () => {
    if (!isStarted || isPaused || isGameOver || gameplayLocked || pendingDropRef.current > 0) {
      return;
    }

    const fruit = getFruit(currentFruit);
    const clampedX = Math.max(fruit.radius * scale, Math.min(dimensions.width - fruit.radius * scale, aimX));
    const body = createBody(currentFruit, clampedX, dropY, scale, worldRef.current.nextId++);
    body.vx = (Math.random() - 0.5) * 32 * spawnDriftMultiplier;
    addBody(worldRef.current, body);
    pendingDropRef.current =
      0.35 *
      dropCooldownMultiplier *
      (performance.now() < stickyCooldownUntilRef.current ? 1.45 : 1);
    setCurrentFruit(nextFruit);
    setNextFruit(getRandomUpcomingFruit());
    playTone(240 + currentFruit * 22, 0.05, "square", 0.05);
  };

  const resetGame = (startImmediately = isStarted) => {
    removeAllBodies(worldRef.current);
    particlesRef.current = [];
    textRef.current = [];
    pendingGarbageRef.current = [];
    comboCountRef.current = 0;
    comboExpireRef.current = 0;
    overDangerTimeRef.current = 0;
    pendingDropRef.current = 0;
    slowMotionUntilRef.current = 0;
    shakeRef.current = 0;
    hideNextUntilRef.current = 0;
    gravityBoostUntilRef.current = 0;
    stickyCooldownUntilRef.current = 0;
    slipperyUntilRef.current = 0;
    pressureLineUntilRef.current = 0;
    lastFrameRef.current = 0;
    setScore(0);
    setBiggestFruit(0);
    setTotalMerges(0);
    setBiggestCombo(1);
    setCurrentFruit(getRandomUpcomingFruit());
    setNextFruit(getRandomUpcomingFruit());
    setAimX(dimensions.width * 0.5);
    setDangerProgress(0);
    setComboText("");
    setWatermelonText("");
    setShake(0);
    setIsGameOver(false);
    setIsPaused(false);
    setIsStarted(startImmediately);
  };

  const startGame = () => {
    resetGame(true);
    ensureAudioContext();
  };

  const pointerToLocalX = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) {
      return dimensions.width * 0.5;
    }

    return Math.max(28, Math.min(rect.width - 28, event.clientX - rect.left));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isStarted || isPaused || isGameOver || gameplayLocked) {
      return;
    }

    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    releaseDropRef.current = true;
    setAimX(pointerToLocalX(event));
    stageRef.current?.setPointerCapture(event.pointerId);
    ensureAudioContext();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId || !isStarted || isPaused || isGameOver || gameplayLocked) {
      return;
    }

    event.preventDefault();
    setAimX(pointerToLocalX(event));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    stageRef.current?.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    const shouldDrop = releaseDropRef.current;
    releaseDropRef.current = false;

    if (shouldDrop && !isPaused && !isGameOver && !gameplayLocked) {
      dropFruit();
    }
  };

  const draw = (context: CanvasRenderingContext2D) => {
    const dpr = window.devicePixelRatio || 1;
    const canvas = context.canvas;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, dimensions.width, dimensions.height);

    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 0.75 : 0;
    context.save();
    context.translate(shakeX, shakeY);

    const currentDangerLine = getCurrentDangerLine();
    const background = context.createLinearGradient(0, 0, 0, dimensions.height);
    background.addColorStop(0, compact ? "#fff6e2" : "#fff5df");
    background.addColorStop(1, "#ffe0c9");
    context.fillStyle = background;
    roundRect(context, 0, 0, dimensions.width, dimensions.height, 28);
    context.fill();

    context.save();
    roundRect(context, 12, 12, dimensions.width - 24, dimensions.height - 24, 24);
    context.clip();

    const innerGradient = context.createLinearGradient(0, 24, dimensions.width, dimensions.height);
    innerGradient.addColorStop(0, "rgba(255,255,255,0.86)");
    innerGradient.addColorStop(1, "rgba(255,237,221,0.97)");
    context.fillStyle = innerGradient;
    context.fillRect(12, 12, dimensions.width - 24, dimensions.height - 24);

    context.strokeStyle = `rgba(240, 91, 103, ${0.35 + dangerProgress * 0.45})`;
    context.lineWidth = 3;
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(18, currentDangerLine);
    context.lineTo(dimensions.width - 18, currentDangerLine);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "rgba(240, 91, 103, 0.12)";
    context.fillRect(16, 16, dimensions.width - 32, Math.max(0, currentDangerLine - 16));

    if (pendingGarbageRef.current.length > 0) {
      context.fillStyle = "rgba(255, 174, 93, 0.18)";
      context.fillRect(16, 16, dimensions.width - 32, dropY + 18);
    }

    const previewFruit = getFruit(currentFruit);
    const previewRadius = previewFruit.radius * scale;
    context.strokeStyle = "rgba(107, 72, 44, 0.2)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(aimX, 22);
    context.lineTo(aimX, dropY - previewRadius - 6);
    context.stroke();

    drawFruit(context, currentFruit, aimX, dropY - previewRadius, previewRadius, 0.92);

    for (const body of worldRef.current.bodies) {
      drawFruit(context, body.level, body.x, body.y, body.radius, 1);
    }

    for (const particle of particlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 1;
    for (const item of textRef.current) {
      const alpha = item.life / item.maxLife;
      context.globalAlpha = alpha;
      context.fillStyle =
        item.style === "celebration" ? "#8d3fff" : item.style === "warning" ? "#c65a19" : "#8e3f39";
      context.font =
        item.style === "celebration"
          ? "800 24px 'Trebuchet MS', sans-serif"
          : "700 20px 'Trebuchet MS', sans-serif";
      context.textAlign = "center";
      context.fillText(item.text, item.x, item.y);
    }
    context.globalAlpha = 1;

    context.restore();
    context.restore();

    if (!hideStartOverlay && !isStarted) {
      drawOverlay(context, mode === "versus" ? "Ready to Duel" : "Tap Play to Start");
    } else if (isPaused) {
      drawOverlay(context, "Paused");
    } else if (isGameOver) {
      drawOverlay(context, "Game Over");
    }

    if (pendingDropRef.current > 0) {
      context.fillStyle = "rgba(255, 255, 255, 0.58)";
      context.beginPath();
      context.arc(aimX, dropY, 12, 0, Math.PI * 2);
      context.fill();
    }

    if (comboText && isStarted && !isGameOver) {
      context.fillStyle = watermelonText ? "#ff4f8f" : "#8d4ef8";
      context.font = watermelonText ? "900 26px 'Trebuchet MS', sans-serif" : "800 22px 'Trebuchet MS', sans-serif";
      context.textAlign = "center";
      context.fillText(comboText, dimensions.width / 2, 48);
    }

    context.fillStyle = "rgba(127, 75, 44, 0.8)";
    context.font = "600 13px 'Trebuchet MS', sans-serif";
    context.textAlign = "left";
    context.fillText("Danger", 20, currentDangerLine - 10);

    context.fillStyle = "rgba(250, 102, 116, 0.2)";
    context.fillRect(18, 22, (dimensions.width - 36) * dangerProgress, 8);
    context.strokeStyle = "rgba(250, 102, 116, 0.55)";
    context.lineWidth = 1.5;
    roundRect(context, 18, 22, dimensions.width - 36, 8, 999);
    context.stroke();
  };

  const drawOverlay = (context: CanvasRenderingContext2D, text: string) => {
    context.fillStyle = "rgba(93, 49, 42, 0.18)";
    roundRect(context, 38, dimensions.height * 0.34, dimensions.width - 76, 88, 24);
    context.fill();
    context.fillStyle = "#fffaf5";
    context.font = "800 30px 'Trebuchet MS', sans-serif";
    context.textAlign = "center";
    context.fillText(text, dimensions.width / 2, dimensions.height * 0.34 + 54);
  };

  const drawFruit = (
    context: CanvasRenderingContext2D,
    level: FruitLevel,
    x: number,
    y: number,
    radius: number,
    alpha: number
  ) => {
    const fruit = getFruit(level);
    context.save();
    context.globalAlpha = alpha;
    const gradient = context.createRadialGradient(x - radius * 0.35, y - radius * 0.45, radius * 0.16, x, y, radius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.22, fruit.ring);
    gradient.addColorStop(1, fruit.color);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(255,255,255,0.68)";
    context.lineWidth = Math.max(2, radius * 0.09);
    context.beginPath();
    context.arc(x, y, radius - context.lineWidth * 0.7, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "rgba(107, 72, 44, 0.82)";
    context.font = `${Math.max(12, radius * 0.75)}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(fruit.emoji, x, y + radius * 0.04);
    context.restore();
  };

  const currentDefinition = getFruit(currentFruit);
  const nextDefinition = getFruit(nextFruit);
  const biggestDefinition = getFruit(biggestFruit);
  const bestFruitDefinition = getFruit(bestFruit);
  const nextHidden = hideNextFruit || performance.now() < hideNextUntilRef.current;

  return (
    <div className={`page-shell ${compact ? "page-shell-compact" : ""}`}>
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <main className={`game-layout ${compact ? "game-layout-compact" : ""}`}>
        <section className="hero-panel">
          <div className="hero-topline">
            <span className="badge">{mode === "versus" ? "Versus Board" : "Solo Mode"}</span>
            {statusPill}
            {onExit ? (
              <button type="button" className="ghost-button" onClick={onExit}>
                Back
              </button>
            ) : null}
          </div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </section>

        <section className="hud-card">
          <div className="score-grid">
            <div>
              <span className="label">Score</span>
              <strong>{score}</strong>
            </div>
            <div>
              <span className="label">Best</span>
              <strong>{bestScore}</strong>
            </div>
            <div>
              <span className="label">Now</span>
              <strong>{currentDefinition.emoji}</strong>
            </div>
            <div>
              <span className="label">Next</span>
              <strong>{nextHidden ? "❔" : nextDefinition.emoji}</strong>
            </div>
          </div>

          <div className="controls-row">
            <button
              type="button"
              disabled={!allowPause}
              onClick={() => (isStarted ? setIsPaused((value) => !value) : startGame())}
            >
              {isStarted ? (isPaused ? "Resume" : "Pause") : "Play"}
            </button>
            <button type="button" disabled={!allowRestart} onClick={() => resetGame(isStarted)}>
              Restart
            </button>
            <button type="button" onClick={() => setIsMuted((value) => !value)}>
              {isMuted ? "Unmute" : "Mute"}
            </button>
          </div>

          <div className="status-strip">
            <span>{watermelonText ? "Watermelon event active" : "Match fruit to evolve them."}</span>
            <span>{pendingGarbageRef.current.length > 0 ? "Incoming fruit queued" : "Board stable"}</span>
          </div>
        </section>

        <div
          ref={stageRef}
          className="stage-shell"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas ref={canvasRef} className="game-canvas" />

          {!hideStartOverlay && !isStarted && (
            <div className="overlay-card">
              <h2>{mode === "versus" ? "Room ready. Start your run." : "Stack Sweet. Merge Big."}</h2>
              <p>Drag to aim, release to drop, and match fruit to evolve them into bigger fruit.</p>
              <ul>
                <li>Keep the stack below the danger line.</li>
                <li>Watermelons trigger a bonus celebration blast.</li>
                <li>In Versus, watermelons send a small incoming fruit.</li>
              </ul>
              <button type="button" className="primary-button" onClick={startGame}>
                Play
              </button>
            </div>
          )}

          {isGameOver && (
            <div className="game-over-banner">
              <span>Final Score</span>
              <strong>{score}</strong>
            </div>
          )}

          {overlayContent}
        </div>

        <section className="footer-card">
          <div>
            <span className="label">Preview</span>
            <div className="fruit-pill">
              {currentDefinition.emoji} {currentDefinition.name}
            </div>
          </div>
          <div>
            <span className="label">Next Up</span>
            <div className="fruit-pill">
              {nextHidden ? "❔ Hidden" : `${nextDefinition.emoji} ${nextDefinition.name}`}
            </div>
          </div>
          <div>
            <span className="label">Biggest</span>
            <div className="fruit-pill">
              {biggestDefinition.emoji} {biggestDefinition.name}
            </div>
          </div>
          <div>
            <span className="label">Best Fruit</span>
            <div className="fruit-pill">
              {bestFruitDefinition.emoji} {bestFruitDefinition.name}
            </div>
          </div>
          <p>{mode === "versus" ? "Incoming fruit attacks are small but fast." : "Works with touch and mouse. Page scrolling is blocked while you're playing."}</p>
        </section>

        {sidebar ? <aside className="versus-sidebar">{sidebar}</aside> : null}
      </main>
    </div>
  );
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
