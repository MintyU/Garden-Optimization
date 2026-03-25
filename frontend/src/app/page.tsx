"use client";

import { useState, useMemo, useEffect } from "react";
import { Play, Dice5, MapPin, Bug, Zap, Ghost, MousePointer2, Sparkles, RefreshCcw, Trash2, Paintbrush, CheckCircle2, ChevronDown, ChevronUp, HelpCircle, AlertTriangle } from "lucide-react";

// --- Types ---
type EffectType = "NONE" | "ROCKET" | "MOLE_2" | "MOLE_3" | "QUESTION" | "SPRING";
type ModifierType = "NONE" | "GOLDEN_BEE" | "HOMUNCULUS" | "MYSTERIOUS_BEE";

interface Tile {
  index: number;
  reward: number;
  effect: EffectType;
  modifier: ModifierType;
}

interface SpecialAnalysis {
  targetIndices: number[];
  expectedValue: number;
  maxPossible: number;
  winProb: number;
  loseProb: number;
}

interface StrategyResult {
  order: number[];
  totalReward: number;
  finalPosition: number;
  usedEffects: string[];
  specialAnalyses?: SpecialAnalysis[];
}

export default function Home() {
  // --- States ---
  const [brushReward, setBrushReward] = useState<number>(100);
  const [brushEffect, setBrushEffect] = useState<EffectType>("NONE");
  const [brushModifier, setBrushModifier] = useState<ModifierType>("NONE");
  const [activeBrush, setActiveBrush] = useState<"REWARD" | "EFFECT" | "MODIFIER" | "POSITION">("REWARD");

  const initialTiles: Tile[] = Array.from({ length: 40 }, (_, i) => ({
    index: i,
    reward: i === 0 ? 500 : i === 20 ? 400 : 100,
    effect: i === 10 ? "ROCKET" : i === 30 ? "QUESTION" : "NONE",
    modifier: "NONE"
  }));

  const [tiles, setTiles] = useState<Tile[]>(initialTiles);
  const [diceValues, setDiceValues] = useState<number[]>([2, 3, 5]);
  const [currentPos, setCurrentPos] = useState(0);
  const [beeMoves, setBeeMoves] = useState(0);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Special Dice Outcome Selection States
  const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState<number | null>(null);
  const [selectedOutcomes, setSelectedOutcomes] = useState<Record<number, number>>({});
  
  // Custom Validation Alert State
  type ValidationError = { name: string; current: number; required: number | "최대 1" };
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [turnAlert, setTurnAlert] = useState<boolean>(false);

  // Tutorial State
  const [tutorialStep, setTutorialStep] = useState(0);

  const TUTORIAL_STEPS = [
    { step: 1, title: "기본 보상 점수 칠하기", content: "각 맵 칸(타일)의 베이스 보상 점수를 100~600점 중에서 선택하여 맵에 칠(클릭)할 수 있습니다." },
    { step: 2, title: "특수 효과 타일 설치", content: "강제로 뒤로 이동시키는 두더지(-2, -3칸)와 앞으로 점프하는 스프링(+3칸) 효과를 맵에 적용할 수 있습니다." },
    { step: 3, title: "몬스터 배치", content: "최종 점수를 늘리거나 깎는 황금벌(x2), 호문스큘러(÷2), 신비벌(x3) 몬스터를 타일 위에 배치합니다." },
    { step: 4, title: "보드판 (맵)", content: "이 곳이 실제 게임 보드판입니다! 좌측에서 선택한 브러시를 보드판의 특정 칸에 클릭하여 자유롭게 맵을 꾸며보세요." },
    { step: 5, title: "내 현재 위치 지정", content: "가장 중요한 부분입니다. 주사위를 굴리기 전, 내 캐릭터가 실제로 서 있는 '현재 위치'를 맵 상에 지정해 줍니다." },
    { step: 6, title: "주사위 입력 및 계산", content: "나온 주사위 눈금 3개와 신비벌의 남은 턴수를 설정하고 버튼을 누르면, 모든 경우의 수를 분석하여 가장 점수가 높은 최적의 경로를 즉시 찾아냅니다!" }
  ];

  const getTutorialClass = (step: number) => {
    return tutorialStep === step ? "relative z-[60] ring-4 md:ring-8 ring-purple-500 pointer-events-auto rounded-[inherit] shadow-[0_0_50px_rgba(168,85,247,0.7)]" : "transition-all duration-300";
  };
  useEffect(() => {
    const saved = localStorage.getItem("gardenState");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.tiles) setTiles(parsed.tiles);
        if (parsed.diceValues) setDiceValues(parsed.diceValues);
        if (typeof parsed.currentPos === "number") setCurrentPos(parsed.currentPos);
        if (typeof parsed.beeMoves === "number") setBeeMoves(parsed.beeMoves);
      } catch (e) {
        console.error("Local storage load failed", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("gardenState", JSON.stringify({ tiles, diceValues, currentPos, beeMoves }));
    }
  }, [tiles, diceValues, currentPos, beeMoves, isLoaded]);

  // --- Logic: Strategy Engine (Converted from Kotlin) ---

  const getNextPosition = (current: number, move: number, currentTiles: Tile[], activatedEffects: Set<string>, absoluteOffset: number): { pos: number, laps: number, nextAbsOffset: number } => {
    let nextRaw = current + move;
    let stepLaps = 0;
    if (nextRaw >= 40) {
      stepLaps = Math.floor(nextRaw / 40);
    }

    let next = nextRaw % 40;
    if (next < 0) next += 40;

    let nextAbsOffset = absoluteOffset + move;
    let currentLap = Math.floor(nextAbsOffset / 40);

    const tile = currentTiles[next];
    const effectKey = `${currentLap}_${next}`;

    if (tile.effect === "ROCKET" && !activatedEffects.has(effectKey)) {
      activatedEffects.add(effectKey);
      const res = getNextPosition(next, 10, currentTiles, activatedEffects, nextAbsOffset);
      return { pos: res.pos, laps: stepLaps + res.laps, nextAbsOffset: res.nextAbsOffset };
    } else if (tile.effect === "MOLE_2" && !activatedEffects.has(effectKey)) {
      activatedEffects.add(effectKey);
      const res = getNextPosition(next, -2, currentTiles, activatedEffects, nextAbsOffset);
      return { pos: res.pos, laps: stepLaps + res.laps, nextAbsOffset: res.nextAbsOffset };
    } else if (tile.effect === "MOLE_3" && !activatedEffects.has(effectKey)) {
      activatedEffects.add(effectKey);
      const res = getNextPosition(next, -3, currentTiles, activatedEffects, nextAbsOffset);
      return { pos: res.pos, laps: stepLaps + res.laps, nextAbsOffset: res.nextAbsOffset };
    } else if (tile.effect === "SPRING" && !activatedEffects.has(effectKey)) {
      activatedEffects.add(effectKey);
      const res = getNextPosition(next, 3, currentTiles, activatedEffects, nextAbsOffset);
      return { pos: res.pos, laps: stepLaps + res.laps, nextAbsOffset: res.nextAbsOffset };
    } else {
      return { pos: next, laps: stepLaps, nextAbsOffset: nextAbsOffset };
    }
  };

  const getFinalReward = (position: number, moveIndex: number, beeExpiry: number, currentTiles: Tile[]): number => {
    const tile = currentTiles[position];
    let baseReward = tile.reward;
    if (tile.effect === "QUESTION") baseReward = 232.5;
    else if (tile.effect === "ROCKET" || tile.effect === "MOLE_2" || tile.effect === "MOLE_3" || tile.effect === "SPRING") {
      baseReward = 100;
    }

    let multiplier = 1.0;
    switch (tile.modifier) {
      case "GOLDEN_BEE": multiplier = 2.0; break;
      case "HOMUNCULUS": multiplier = 0.5; break;
      case "MYSTERIOUS_BEE":
        if (moveIndex <= beeExpiry) multiplier = 3.0;
        break;
    }
    return baseReward * multiplier;
  };

  const generatePermutations = <T,>(arr: T[]): T[][] => {
    if (arr.length <= 1) return [arr];
    const perms: T[][] = [];
    arr.forEach((el, i) => {
      const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
      generatePermutations(remaining).forEach(p => perms.push([el, ...p]));
    });
    return perms;
  };

  const getSpecialOutcomes = (D: number) => [
    { move: D * 2, mul: 1, label: "이동 x2" },
    { move: D * 3, mul: 1, label: "이동 x3" },
    { move: D, mul: 2, label: "보상 x2" },
    { move: D - 5, mul: 1, label: "이동 -5" },
    { move: D - 10, mul: 1, label: "이동 -10" },
    { move: D * -3, mul: 1, label: "뒤로 x3" }
  ];

  type OutcomeItem = { move: number, mul: number, original: number };

  const evaluateOutcome = (outcome: OutcomeItem[], startPos: number, beeExpiry: number, currentTiles: Tile[]) => {
    let maxScore = -100000;
    let bestFinalPos = 0;
    let bestPerm: number[] = [];
    let bestUsedEffects = new Set<string>();
    const perms = generatePermutations(outcome);
    for (const perm of perms) {
      let tempPos = startPos;
      let tempAbsOffset = startPos;
      let tempTotal = 0;
      let activatedEffects = new Set<string>();
      
      perm.forEach((die, idx) => {
        const nextResult = getNextPosition(tempPos, die.move, currentTiles, activatedEffects, tempAbsOffset);
        tempPos = nextResult.pos;
        tempAbsOffset = nextResult.nextAbsOffset;
        tempTotal += (getFinalReward(tempPos, idx + 1, beeExpiry, currentTiles) * die.mul) + (nextResult.laps * 400);
      });
      if (tempTotal > maxScore) {
        maxScore = tempTotal;
        bestFinalPos = tempPos;
        bestPerm = perm.map(d => d.original);
        bestUsedEffects = new Set(activatedEffects);
      }
    }
    return { maxScore, bestFinalPos, bestPerm, bestUsedEffects };
  };

  const calculateOptimalPath = () => {
    let count100AndMovements = 0;
    let count300 = 0, count400 = 0, count600 = 0;
    let countMole2 = 0, countMole3 = 0, countSpring = 0;
    let countGolden = 0, countHomun = 0, countMystic = 0;

    tiles.forEach(t => {
      if (t.index === 0 || t.index === 20 || t.index === 30) return;
      
      const isMovement = (t.effect === 'ROCKET' || t.effect === 'MOLE_2' || t.effect === 'MOLE_3' || t.effect === 'SPRING');
      if (isMovement) {
          count100AndMovements++;
      } else {
        if (t.reward === 100) count100AndMovements++;
        if (t.reward === 300) count300++;
        if (t.reward === 400) count400++;
        if (t.reward === 600) count600++;
      }

      if (t.effect === 'MOLE_2') countMole2++;
      if (t.effect === 'MOLE_3') countMole3++;
      if (t.effect === 'SPRING') countSpring++;
      
      if (t.modifier === 'GOLDEN_BEE') countGolden++;
      if (t.modifier === 'HOMUNCULUS') countHomun++;
      if (t.modifier === 'MYSTERIOUS_BEE') countMystic++;
    });

    const errors: ValidationError[] = [];
    if (count100AndMovements !== 12) errors.push({ name: "100점+이동 발판", current: count100AndMovements, required: 12 });
    if (count300 !== 10) errors.push({ name: "300점 발판", current: count300, required: 10 });
    if (count400 !== 10) errors.push({ name: "400점 발판", current: count400, required: 10 });
    if (count600 !== 5) errors.push({ name: "600점 발판", current: count600, required: 5 });
    if (countMole2 > 1) errors.push({ name: "두더지(-2칸)", current: countMole2, required: "최대 1" });
    if (countMole3 > 1) errors.push({ name: "두더지(-3칸)", current: countMole3, required: "최대 1" });
    if (countSpring > 1) errors.push({ name: "스프링(+3칸)", current: countSpring, required: "최대 1" });
    if (countGolden !== 1) errors.push({ name: "황금벌 몬스터", current: countGolden, required: 1 });
    if (countHomun !== 1) errors.push({ name: "호문스큘러 몬스터", current: countHomun, required: 1 });
    if (countMystic > 1) errors.push({ name: "신비벌 몬스터", current: countMystic, required: "최대 1" });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const dice = diceValues;
    setSelectedAnalysisIndex(null);
    setSelectedOutcomes({});

    const baseOutcome: OutcomeItem[] = dice.map(d => ({ move: d, mul: 1, original: d }));
    const baseResult = evaluateOutcome(baseOutcome, currentPos, beeMoves, tiles);

    const subsets = [
      [], [0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]
    ];

    const analyses: SpecialAnalysis[] = [];

    subsets.forEach(subset => {
      if (subset.length === 0) return;

      const possibilities = dice.map((d, i) =>
        subset.includes(i) ? getSpecialOutcomes(d).map(o => ({ ...o, original: d })) : [{ move: d, mul: 1, original: d }]
      );

      const outcomes: OutcomeItem[][] = possibilities.reduce<OutcomeItem[][]>((a, b) =>
        a.flatMap(d => b.map(e => [...d, e])), [[]]
      );

      let totalMaxScore = 0;
      let maxPossible = 0;
      let winCount = 0;
      let loseCount = 0;

      outcomes.forEach(outcome => {
        const { maxScore } = evaluateOutcome(outcome, currentPos, beeMoves, tiles);
        totalMaxScore += maxScore;
        if (maxScore > maxPossible) maxPossible = maxScore;
        if (maxScore > baseResult.maxScore) winCount++;
        if (maxScore < baseResult.maxScore) loseCount++;
      });

      analyses.push({
        targetIndices: subset,
        expectedValue: totalMaxScore / outcomes.length,
        maxPossible,
        winProb: (winCount / outcomes.length) * 100,
        loseProb: (loseCount / outcomes.length) * 100
      });
    });

    analyses.sort((a, b) => b.expectedValue - a.expectedValue);

    setResult({
      order: baseResult.bestPerm,
      totalReward: baseResult.maxScore,
      finalPosition: baseResult.bestFinalPos,
      usedEffects: Array.from(baseResult.bestUsedEffects),
      specialAnalyses: analyses
    });
  };

  // --- UI Helpers ---
  const boardGrid = useMemo(() => {
    const grid = Array(121).fill(-1);
    let currentIdx = 0;
    for (let i = 10; i >= 0; i--) grid[10 * 11 + i] = currentIdx++;
    for (let i = 9; i >= 1; i--) grid[i * 11 + 0] = currentIdx++;
    for (let i = 0; i <= 10; i++) grid[0 * 11 + i] = currentIdx++;
    for (let i = 1; i <= 9; i++) grid[i * 11 + 10] = currentIdx++;
    return grid;
  }, []);

  const handleTileClick = (index: number) => {
    if (activeBrush === "POSITION") {
      setCurrentPos(index);
      setActiveBrush("REWARD"); // 클릭 후 자동으로 기본 데코레이터(REWARD) 모드로 복귀하여 연속 클릭 실수를 방지합니다.
      return;
    }

    if (index === 10 && activeBrush !== "MODIFIER") {
      setTiles(prev => prev.map(t => {
        if (t.index === 10) {
          const isRocket = t.effect === "ROCKET";
          return { ...t, effect: isRocket ? "NONE" : "ROCKET", reward: 100 };
        }
        return t;
      }));
      return;
    }

    if (index === 0 || index === 20 || index === 30) return;

    if (activeBrush === "MODIFIER") {
      const clickedTile = tiles.find(t => t.index === index);
      if (clickedTile) {
        if (brushModifier === "MYSTERIOUS_BEE") {
          if (clickedTile.modifier === "MYSTERIOUS_BEE") setBeeMoves(0);
          else setBeeMoves(10);
        } else if (clickedTile.modifier === "MYSTERIOUS_BEE") {
          setBeeMoves(0);
        }
      }
    }

    setTiles(prev => prev.map(t => {
      // 보상 브러시 처리
      if (activeBrush === "REWARD") {
        if (t.index === index) return { ...t, reward: brushReward };
        return t;
      }
      
      // 효과 브러시 처리
      if (activeBrush === "EFFECT") {
        if (t.index === index) {
          return { ...t, effect: t.effect === brushEffect ? "NONE" : brushEffect };
        }
        // 다른 타일에 이미 해당 효과가 칠해져 있다면 초기화 (단일 존재 보장)
        if (brushEffect !== "NONE" && t.effect === brushEffect) {
          return { ...t, effect: "NONE" };
        }
        return t;
      }
      
      // 몬스터 브러시 처리
      if (activeBrush === "MODIFIER") {
        if (t.index === index) {
          return { ...t, modifier: t.modifier === brushModifier ? "NONE" : brushModifier };
        }
        // 다른 타일에 이미 해당 몬스터가 칠해져 있다면 초기화 (단일 존재 보장)
        if (brushModifier !== "NONE" && t.modifier === brushModifier) {
          return { ...t, modifier: "NONE" };
        }
        return t;
      }
      
      return t;
    }));
  };

  const applyTurn = (nextPos: number, usedEffects: string[]) => {
    setCurrentPos(nextPos);
    setBeeMoves(prev => Math.max(0, prev - 3));
    
    if (usedEffects && usedEffects.length > 0) {
      const usedIndices = usedEffects.map(e => parseInt(e.split('_')[1]));
      setTiles(prev => prev.map(t => {
        if (usedIndices.includes(t.index) && (t.effect === "ROCKET" || t.effect === "MOLE_2" || t.effect === "MOLE_3" || t.effect === "SPRING")) {
          return { ...t, effect: "NONE", reward: 100 };
        }
        return t;
      }));
    }

    setResult(null);
    setSelectedAnalysisIndex(null);
    setSelectedOutcomes({});
    setActiveBrush("MODIFIER");
    setBrushModifier("HOMUNCULUS");
    setTurnAlert(true);
  };

  return (
    <main className="min-h-screen bg-[#f1f5f9] p-4 md:p-8 font-sans text-slate-800">
      <header className="max-w-7xl mx-auto flex items-center justify-between mb-8 border-b-2 border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-green-600 p-2 rounded-xl text-white shadow-lg"><RefreshCcw size={24} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">진의 신비한 정원 계산기</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Paintbrush size={10} /> 클릭하여 보드를 채우세요 (오프라인 모드)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTutorialStep(1)} className="px-3 md:px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-[0.5rem] md:rounded-[0.75rem] text-[10px] md:text-xs font-black text-purple-600 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5"><HelpCircle size={14} /> 도움말</button>
          <button onClick={() => {
            if (confirm("보드 전체 정보를 초기 상태로 되돌리시겠습니까?")) {
              setTiles(initialTiles);
              setDiceValues([2, 3, 5]);
              setCurrentPos(0);
              setBeeMoves(0);
              setResult(null);
              setSelectedAnalysisIndex(null);
              setSelectedOutcomes({});
            }
          }} className="px-3 md:px-4 py-2 bg-white border border-slate-200 rounded-[0.5rem] md:rounded-[0.75rem] text-[10px] md:text-xs font-black text-rose-500 hover:bg-rose-50 active:scale-95 transition-all shadow-sm">보드 초기화</button>
        </div>
      </header>

      <div className="max-w-[85rem] lg:max-w-7xl mx-auto flex flex-col xl:flex-row gap-6 xl:gap-8 items-stretch">
        <div className="w-full xl:w-[340px] shrink-0 flex flex-col gap-6 xl:gap-8">
          <section className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200 flex-1 flex flex-col h-full">
            <h3 className="text-sm md:text-base font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6 shrink-0">도구 선택 (브러시)</h3>
            <div className="flex flex-col justify-between flex-1 gap-4 xl:gap-6">

            <div className={`p-4 rounded-2xl border-2 ${getTutorialClass(1)} ${activeBrush === "REWARD" ? 'border-green-500 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setActiveBrush("REWARD")} className="w-full text-left text-sm md:text-base font-black text-slate-600 mb-3 flex items-center justify-between">보상 점수 칠하기 {activeBrush === "REWARD" && <CheckCircle2 size={16} className="text-green-600" />}</button>
              <div className="grid grid-cols-2 gap-2">
                {[100, 300, 400, 600].map((pts) => (
                  <button key={pts} onClick={() => { setBrushReward(pts); setActiveBrush("REWARD"); }} className={`h-11 md:h-12 rounded-xl font-black text-base md:text-lg transition-all border flex items-center justify-center ${brushReward === pts && activeBrush === "REWARD" ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-green-400 hover:shadow-sm'}`}>{pts}</button>
                ))}
              </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 ${getTutorialClass(2)} ${activeBrush === "EFFECT" ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setActiveBrush("EFFECT")} className="w-full text-left text-sm md:text-base font-black text-slate-600 mb-3 flex items-center justify-between">발판 효과 칠하기 {activeBrush === "EFFECT" && <CheckCircle2 size={16} className="text-blue-600" />}</button>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "MOLE_2", label: "두더지 (-2)" }, { key: "MOLE_3", label: "두더지 (-3)" },
                  { key: "SPRING", label: "스프링 (+3)" }, { key: "NONE", label: "지우개" }
                ].map((eff) => (
                  <button key={eff.key} onClick={() => { setBrushEffect(eff.key as EffectType); setActiveBrush("EFFECT"); }} className={`h-11 md:h-12 rounded-xl font-black text-xs md:text-sm transition-all border flex items-center justify-center ${brushEffect === eff.key && activeBrush === "EFFECT" ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:shadow-sm'}`}>{eff.label}</button>
                ))}
              </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 ${getTutorialClass(3)} ${activeBrush === "MODIFIER" ? 'border-orange-500 bg-orange-50' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setActiveBrush("MODIFIER")} className="w-full text-left text-sm md:text-base font-black text-slate-600 mb-3 flex items-center justify-between">몬스터 배치하기 {activeBrush === "MODIFIER" && <CheckCircle2 size={16} className="text-orange-600" />}</button>
              <div className="grid grid-cols-2 gap-2">
                {[{ key: "GOLDEN_BEE", label: "황금벌" }, { key: "HOMUNCULUS", label: "호문스큘러" }, { key: "MYSTERIOUS_BEE", label: "신비벌" }, { key: "NONE", label: "지우개" }].map((mod) => (
                  <button key={mod.key} onClick={() => { setBrushModifier(mod.key as ModifierType); setActiveBrush("MODIFIER"); }} className={`h-11 md:h-12 rounded-xl font-black text-xs md:text-sm transition-all border flex items-center justify-center ${brushModifier === mod.key && activeBrush === "MODIFIER" ? 'bg-orange-600 text-white border-orange-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-orange-400 hover:shadow-sm'}`}>{mod.label}</button>
                ))}
              </div>
            </div>
            </div>
          </section>

          <section className={`bg-slate-900 rounded-3xl p-6 shadow-2xl space-y-6 text-white shrink-0 ${getTutorialClass(6)}`}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-xs md:text-sm font-black text-slate-500 uppercase flex flex-col gap-1.5 w-full">
                  <span>주사위 선택</span>
                  <span className="text-[10px] md:text-xs text-slate-400 bg-slate-800 py-1 rounded w-full text-center tracking-tight">클릭하여 숫자 변경</span>
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const newDice = [...diceValues];
                        newDice[idx] = newDice[idx] === 6 ? 1 : newDice[idx] + 1;
                        setDiceValues(newDice);
                      }}
                      className="flex-1 py-3 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl border border-white/10 font-black text-center text-2xl outline-none transition-all shadow-inner"
                    >
                      {diceValues[idx]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`space-y-3 ${tutorialStep === 5 ? 'relative z-[60] ring-4 md:ring-8 ring-purple-500 bg-slate-900 shadow-[0_0_50px_rgba(168,85,247,0.7)] p-1.5 -m-1.5 md:p-2 md:-m-2 rounded-xl pointer-events-auto' : 'transition-all'}`}>
                <label className="text-xs md:text-sm font-black text-slate-500 uppercase flex flex-col gap-1.5 w-full">
                  <span>현재 위치</span>
                  {activeBrush === "POSITION" ? (
                    <span className="text-[10px] md:text-xs text-green-400 bg-green-900/40 py-1 rounded w-full text-center animate-pulse tracking-tight">보드를 클릭하세요</span>
                  ) : (
                    <span className="py-1 invisible text-[10px] md:text-xs">높이맞춤용</span>
                  )}
                </label>
                <button
                  onClick={() => setActiveBrush("POSITION")}
                  className={`w-full py-3 rounded-xl border font-black text-center text-2xl outline-none transition-all shadow-inner ${activeBrush === "POSITION" ? 'bg-green-500/20 border-green-400 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-white/10 border-white/10 hover:bg-white/20'}`}
                >
                  {currentPos}
                </button>
              </div>
            </div>
            <div className="space-y-2 pt-2 md:pt-3">
              <label className="text-xs md:text-sm font-black text-slate-500 uppercase inline-block mb-1 md:mb-2 w-full text-center xl:text-left">신비한 벌 남은 이동 횟수</label>
              <input type="number" className="w-full p-3 md:p-4 bg-white/10 rounded-xl border border-white/10 font-black text-center text-xl md:text-2xl outline-none focus:border-green-400" value={beeMoves} onChange={(e) => setBeeMoves(parseInt(e.target.value) || 0)} />
            </div>
            <button onClick={calculateOptimalPath} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-2xl font-black text-lg shadow-lg transition-all flex items-center justify-center gap-2">
              <Play size={20} /> 최적 경로 즉시 계산
            </button>
          </section>
        </div>

        <div className="flex-1 flex flex-col items-center xl:items-stretch w-full min-h-full">
          <div className={`w-full xl:w-full h-full flex flex-col items-center justify-center bg-white p-6 md:p-8 xl:p-12 rounded-[3rem] shadow-2xl border border-slate-200 relative overflow-hidden ${getTutorialClass(4)}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gridTemplateRows: 'repeat(11, 1fr)', gap: '6px' }} className="relative z-10 text-center m-auto">
              {boardGrid.map((tileIdx, gridPos) => {
                if (tileIdx === -1) return <div key={gridPos} className="w-8 h-8 md:w-16 md:h-16" />;
                const tile = tiles[tileIdx];
                const isCurrent = tile.index === currentPos;
                const bgColor = isCurrent ? '#facc15' :
                  tile.index === 0 ? '#7d6aae' :
                    tile.effect === 'ROCKET' ? '#38bdf8' :
                      (tile.effect === 'MOLE_2' || tile.effect === 'MOLE_3') ? '#fb7185' :
                        tile.effect === 'SPRING' ? '#4ade80' :
                          tile.effect === 'QUESTION' ? '#38bdf8' :
                            tile.reward === 100 ? '#7b95a6' :
                              tile.reward === 300 ? '#63a3c9' :
                                tile.reward === 400 ? '#62a7ff' :
                                  tile.reward === 600 ? '#b25af4' : '#ffffff';

                return (
                  <div key={gridPos} style={{ backgroundColor: bgColor }} onClick={() => handleTileClick(tileIdx)} className={`w-10 h-10 md:w-20 md:h-20 border-2 rounded-xl flex flex-col items-center justify-center relative transition-all duration-150 cursor-pointer shadow-sm hover:scale-105 hover:z-10 ${isCurrent ? 'ring-4 ring-yellow-400 border-yellow-600 z-20' : 'border-slate-100 hover:border-slate-300'}`}>
                    <span className="absolute top-1 left-1.5 text-[8px] md:text-[10px] font-black opacity-20">#{tileIdx}</span>
                    <div className="text-[10px] md:text-2xl font-black text-white game-text-stroke flex flex-col items-center">
                      {tile.effect === 'ROCKET' && <span>🚀</span>}
                      {tile.effect === 'QUESTION' && <span className="text-cyan-300">?</span>}
                      {tile.effect === 'SPRING' && <span>🌀</span>}
                      {tile.effect === 'MOLE_2' && <span className="flex flex-col items-center"><span className="text-[8px] md:text-xs text-rose-300">-2</span>🔨</span>}
                      {tile.effect === 'MOLE_3' && <span className="flex flex-col items-center"><span className="text-[8px] md:text-xs text-rose-300">-3</span>🔨</span>}
                      {tile.effect === 'NONE' && (
                        <div className="flex flex-col items-center justify-center">
                          {tile.modifier !== 'NONE' && (
                            <div
                              className={`px-1 rounded-sm mb-0.5 shadow-sm border border-white/20 flex items-center justify-center ${tile.modifier === 'HOMUNCULUS' ? 'bg-rose-600' : 'bg-green-600'}`}
                              style={{ textShadow: 'none' }}
                            >
                              <span className="text-[8px] md:text-[11px] font-black text-white leading-none tracking-tighter">
                                {tile.modifier === 'GOLDEN_BEE' ? "x2" :
                                  tile.modifier === 'HOMUNCULUS' ? "÷2" :
                                    tile.modifier === 'MYSTERIOUS_BEE' ? "x3" : ""}
                              </span>
                            </div>
                          )}
                          <span className={tile.modifier !== 'NONE' ? "text-sm md:text-xl leading-none" : ""}>
                            {tile.modifier === 'GOLDEN_BEE' ? tile.reward * 2 :
                              tile.modifier === 'HOMUNCULUS' ? Math.floor(tile.reward / 2) :
                                tile.modifier === 'MYSTERIOUS_BEE' ? tile.reward * 3 :
                                  tile.reward}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex gap-0.5 scale-75 md:scale-100">
                      {tile.modifier === 'GOLDEN_BEE' && <div className="bg-yellow-400 p-1 rounded-full border border-white shadow-sm"><Zap size={10} className="text-white fill-white" /></div>}
                      {tile.modifier === 'HOMUNCULUS' && <div className="bg-emerald-500 p-1 rounded-full border border-white shadow-sm"><Ghost size={10} className="text-white fill-white" /></div>}
                      {tile.modifier === 'MYSTERIOUS_BEE' && <div className="bg-purple-600 p-1 rounded-full border border-white shadow-sm"><Zap size={10} className="text-white fill-white" /></div>}
                    </div>
                    {isCurrent && <div className="absolute -top-6 animate-bounce"><MousePointer2 size={24} className="text-orange-600 fill-orange-500 drop-shadow-lg" /></div>}
                  </div>
                );
              })}
            </div>
            {result && (
              <div className="absolute inset-0 m-auto flex flex-col items-center justify-center pointer-events-none z-30">
                <div className="w-[85%] max-h-[85%] max-w-2xl overflow-y-auto pointer-events-auto bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-4 md:p-5 shadow-[0_0_50px_rgba(0,0,0,0.15)] border border-slate-200/50 animate-in zoom-in-95 duration-500 flex flex-col gap-3 mx-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <div className="bg-green-600 rounded-[1.5rem] p-3.5 md:p-4 shadow-lg text-white border-b-4 border-green-800 flex flex-col items-center gap-2.5 md:gap-3 shrink-0">
                    <div className="flex flex-row items-center justify-around w-full text-center gap-3">
                      <div><p className="text-[9px] md:text-[10px] font-black text-green-200 uppercase mb-0.5">최적 주사위 순서</p><p className="text-2xl md:text-4xl font-black italic tracking-tighter drop-shadow-sm">{result.order.join(" ➔ ")}</p></div>
                      <div className="hidden md:block w-px h-10 bg-white/20" />
                      <div><p className="text-[9px] md:text-[10px] font-black text-green-200 uppercase mb-0.5">확정 점수</p><p className="text-xl md:text-3xl font-black drop-shadow-sm">{Math.floor(result.totalReward).toLocaleString()} <span className="text-[9px] opacity-60">PTS</span></p></div>
                    </div>
                    <button onClick={() => applyTurn(result.finalPosition, result.usedEffects)} className="w-full py-1.5 md:py-2 bg-green-800/80 hover:bg-green-800 rounded-xl font-black text-[10px] md:text-[11px] text-green-50 shadow-sm transition-all border border-green-700">이 기본 경로로 다음 턴 넘어가기 ➔</button>
                  </div>

                  {result.specialAnalyses && result.specialAnalyses.length > 0 && (
                    <div className="bg-slate-900 text-white p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] shadow-xl shrink-0">
                      <h4 className="text-[13px] md:text-[15px] font-black mb-3 flex items-center justify-center xl:justify-start gap-1.5 text-purple-400"><Sparkles size={15} /> 특수 기대값 분석 (Top 3)</h4>
                      <div className="space-y-2.5">
                        {result.specialAnalyses.slice(0, 3).map((analysis, i) => {
                          const isExpanded = selectedAnalysisIndex === i;
                          const isSelectedAll = analysis.targetIndices.every(t => selectedOutcomes[t] !== undefined);
                          
                          let specificResult = null;
                          if (isExpanded && isSelectedAll) {
                            const customOutcome = diceValues.map((d, dIdx) => {
                              if (analysis.targetIndices.includes(dIdx)) {
                                const outcomeKey = selectedOutcomes[dIdx];
                                const effect = getSpecialOutcomes(d)[outcomeKey];
                                return { move: effect.move, mul: effect.mul, original: d };
                              }
                              return { move: d, mul: 1, original: d };
                            });
                            specificResult = evaluateOutcome(customOutcome, currentPos, beeMoves, tiles);
                          }

                          return (
                            <div key={i} className="flex flex-col bg-slate-800 rounded-xl shadow-inner border border-slate-700 hover:border-slate-500 transition-colors overflow-hidden">
                              <div 
                                onClick={() => {
                                  if (selectedAnalysisIndex === i) {
                                    setSelectedAnalysisIndex(null);
                                  } else {
                                    setSelectedAnalysisIndex(i);
                                    setSelectedOutcomes({});
                                  }
                                }}
                                className="flex flex-row items-center justify-between p-3 md:p-4 gap-2 md:gap-3 cursor-pointer select-none"
                              >
                                <div className="flex-1 text-left flex flex-col justify-center gap-1">
                                  <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                                    <span className="text-[10px] md:text-xs font-black text-slate-400">대상 주사위</span>
                                    <div className="flex gap-1.5">
                                      {diceValues.map((val, dIdx) => {
                                        const isTarget = analysis.targetIndices.includes(dIdx);
                                        return (
                                          <div key={dIdx} className={`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-[6px] font-black text-xs md:text-sm border transition-all ${isTarget ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_10px_rgba(168,85,247,0.7)] scale-110 z-10' : 'bg-slate-700 border-slate-600 text-slate-400 opacity-50'}`}>
                                            {val}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {isExpanded ? <ChevronUp size={18} className="text-slate-400 ml-auto" /> : <ChevronDown size={18} className="text-slate-400 ml-auto" />}
                                  </div>
                                  <div className="flex items-center justify-start gap-2 md:gap-4 text-[10px] md:text-xs font-bold text-slate-500 bg-slate-900/50 p-1.5 md:p-2 rounded-lg inline-flex w-fit">
                                    <span className="text-green-400">경신: {analysis.winProb.toFixed(0)}%</span>
                                    <span className="text-rose-400">하락: {analysis.loseProb.toFixed(0)}%</span>
                                  </div>
                                </div>
                                <div className="text-right pointer-events-none">
                                  <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase">기대 평균</p>
                                  <p className="text-xl md:text-3xl font-black text-purple-300 leading-none my-1">{Math.floor(analysis.expectedValue).toLocaleString()}</p>
                                  <p className="text-[10px] md:text-xs text-slate-500 font-bold mt-1">최대: {Math.floor(analysis.maxPossible).toLocaleString()}</p>
                                </div>
                              </div>
                              
                              {isExpanded && (
                                <div className="p-2 md:p-3 bg-slate-900/80 border-t border-slate-700 flex flex-col gap-2 relative">
                                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                                    {analysis.targetIndices.map(tIdx => (
                                      <div key={tIdx} onClick={(e) => e.stopPropagation()} className="flex-1 min-w-[90px] max-w-[150px] flex items-center gap-1.5 bg-slate-800 p-1 md:p-1.5 rounded-lg border border-slate-700/50 shadow-inner md:py-1.5 md:px-2">
                                        <span className="bg-purple-600 text-white w-6 h-6 flex shrink-0 items-center justify-center rounded-[6px] font-black text-xs md:text-sm shadow-sm">{diceValues[tIdx]}</span>
                                        <select
                                          value={selectedOutcomes[tIdx] ?? ""}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            setSelectedOutcomes(prev => ({ ...prev, [tIdx]: Number(e.target.value) }));
                                          }}
                                          className="w-full bg-slate-900 text-slate-300 text-[10px] md:text-xs font-bold py-1 px-1.5 rounded outline-none border border-slate-700 cursor-pointer appearance-none text-center md:py-1.5"
                                          style={{ backgroundImage: 'url(\'data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3e%3cpolyline points="6 9 12 15 18 9"%3e%3c/polyline%3e%3c/svg%3e\')', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '12px', paddingRight: '16px' }}
                                        >
                                          <option value="" disabled>선택</option>
                                          {getSpecialOutcomes(diceValues[tIdx]).map((eff, effIdx) => (
                                            <option key={effIdx} value={effIdx}>{eff.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                    ))}
                                  </div>

                                  {isSelectedAll && specificResult && (
                                    <div className="mt-1 flex flex-col gap-1.5">
                                      <div className="bg-gradient-to-r from-purple-900/40 to-slate-900/40 p-2.5 md:p-3 rounded-xl border border-purple-500/30 flex items-center justify-between shadow-inner">
                                        <div className="flex flex-col justify-center">
                                          <p className="text-[10px] md:text-xs font-black text-purple-300/80 uppercase mb-1">맞춤 최적 순서</p>
                                          <p className="text-lg md:text-2xl font-black italic text-white tracking-widest drop-shadow-md leading-none">{specificResult.bestPerm.join(" ➔ ")}</p>
                                        </div>
                                        <div className="text-right flex flex-col justify-center">
                                          <p className="text-[10px] md:text-xs font-black text-purple-300/80 uppercase mb-1">상황 맞춤 점수</p>
                                          <p className="text-lg md:text-2xl font-black text-green-400 drop-shadow-md leading-none">{Math.floor(specificResult.maxScore).toLocaleString()} <span className="text-[10px] md:text-xs opacity-60 text-white font-bold ml-1">PTS</span></p>
                                        </div>
                                      </div>
                                      <button onClick={() => applyTurn(specificResult!.bestFinalPos, Array.from(specificResult!.bestUsedEffects))} className="w-full py-2 bg-purple-700/50 hover:bg-purple-600 rounded-lg font-black text-[10px] md:text-xs text-purple-100 shadow-md transition-all border border-purple-500/50">이 특수 경로로 다음 턴 넘어가기 ➔</button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto p-4" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setValidationErrors([])}></div>
          <div className="relative z-[110] bg-white rounded-[2rem] p-6 md:p-8 max-w-sm w-[90%] md:w-full shadow-2xl flex flex-col items-center" style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-[1.25rem] flex items-center justify-center mb-4 shadow-inner">
               <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">보드 설정 오류</h3>
            <p className="text-[11px] md:text-sm text-slate-500 text-center mb-6 leading-relaxed font-bold">배치 규칙에 어긋난 부분이 있어 계산할 수 없습니다. 아래 항목들을 다시 칠해 주세요.</p>
            
            <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3 md:p-4 mb-6 space-y-2.5 max-h-[40vh] overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
               {validationErrors.map((err, i) => (
                 <div key={i} className="flex items-center justify-between text-[11px] md:text-xs bg-white p-2 md:p-2.5 rounded-xl border border-slate-100 shadow-sm">
                   <div className="flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></span>
                     <span className="font-bold text-slate-700">{err.name}</span>
                   </div>
                   <div className="flex items-center gap-1.5 font-bold">
                     <span className="text-rose-500 font-black">{err.current}개</span>
                     <span className="text-slate-300">/</span>
                     <span className="text-slate-400">{err.required}개</span>
                   </div>
                 </div>
               ))}
            </div>
            
            <button onClick={() => setValidationErrors([])} className="w-full py-3 md:py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-sm md:text-base shadow-lg transition-all active:scale-95">확인했습니다</button>
          </div>
        </div>
      )}

      {turnAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto p-4" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setTurnAlert(false)}></div>
          <div className="relative z-[110] bg-white rounded-[2rem] p-6 md:p-8 max-w-sm w-[90%] md:w-full shadow-2xl flex flex-col items-center" style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-[1.25rem] flex items-center justify-center mb-4 shadow-inner">
               <Sparkles size={32} />
            </div>
            <h3 className="text-xl md:text-2xl font-black text-slate-800 mb-2">다음 턴 준비 완료!</h3>
            <p className="text-[11px] md:text-sm text-slate-500 text-center mb-6 leading-relaxed font-bold">주사위를 굴리고 새로운 이동을 준비하세요.</p>
            
            <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6 space-y-3 shadow-inner">
              <div className="flex items-center gap-3 text-xs md:text-sm font-bold text-slate-700">
                <span className="w-6 h-6 rounded-full bg-green-200 text-green-700 flex items-center justify-center shrink-0 font-black">1</span>
                캐릭터가 도착 지점으로 이동했습니다.
              </div>
              <div className="flex items-center gap-3 text-xs md:text-sm font-bold text-slate-700">
                <span className="w-6 h-6 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center shrink-0 font-black">2</span>
                신비벌 남은 횟수가 3 감소했습니다.
              </div>
              <div className="flex items-center gap-3 text-xs md:text-sm font-bold text-slate-700">
                <span className="w-6 h-6 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center shrink-0 font-black">3</span>
                사용한 이동 발판이 100점으로 변경되었습니다.
              </div>
              <div className="flex items-start gap-3 text-xs md:text-sm font-bold text-slate-700 bg-orange-50 p-2.5 rounded-xl border border-orange-100/50">
                <span className="w-6 h-6 rounded-full bg-orange-200 text-orange-700 flex items-center justify-center shrink-0 font-black mt-0.5">4</span>
                <span className="leading-snug text-orange-900"><span className="text-orange-600 font-black">호문스큘러 브러시</span>가 자동 선택되었습니다.<br/>방금 새로 이동한 위치에 찍어주세요!</span>
              </div>
              <div className="flex items-center gap-3 text-xs md:text-sm font-bold text-slate-700">
                <span className="w-6 h-6 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center shrink-0 font-black">5</span>
                새로 굴린 주사위 눈금 3개를 입력하세요.
              </div>
            </div>
            
            <button onClick={() => setTurnAlert(false)} className="w-full py-3.5 md:py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-sm md:text-base shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
              <Play size={18} className="fill-white" /> 확인하고 진행하기
            </button>
          </div>
        </div>
      )}

      {tutorialStep > 0 && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/80 backdrop-blur-sm pointer-events-auto" style={{ animation: 'fadeIn 0.3s ease-out' }} onClick={() => setTutorialStep(0)}></div>
          
          <div className="fixed inset-x-0 bottom-10 md:inset-0 m-auto z-[70] bg-white rounded-[2rem] p-6 max-w-sm w-[90%] md:h-fit shadow-2xl border-4 border-purple-200 flex flex-col pointer-events-auto" style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="flex items-center gap-3 mb-4">
               <div className="bg-purple-600 text-white font-black w-8 h-8 flex items-center justify-center rounded-xl shadow-inner shrink-0">{tutorialStep}</div>
               <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-tight">{TUTORIAL_STEPS[tutorialStep - 1].title}</h3>
            </div>
            <p className="text-sm md:text-base text-slate-600 font-bold mb-8 leading-relaxed">
              {TUTORIAL_STEPS[tutorialStep - 1].content}
            </p>
            <div className="flex justify-between items-center mt-auto">
              <button onClick={() => setTutorialStep(0)} className="text-xs font-black text-slate-400 hover:text-slate-600 transition-colors">튜토리얼 종료</button>
              <div className="flex gap-2">
                 {tutorialStep > 1 && <button onClick={() => setTutorialStep(p => p - 1)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-black text-sm hover:bg-slate-200 transition-all">이전</button>}
                 <button onClick={() => {
                   if (tutorialStep >= TUTORIAL_STEPS.length) {
                     setTutorialStep(0);
                   } else setTutorialStep(p => p + 1);
                 }} className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-black text-sm hover:bg-purple-500 shadow-md transition-all">
                   {tutorialStep === TUTORIAL_STEPS.length ? '완료 🎉' : '다음 단계 ➔'}
                 </button>
              </div>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}} />
        </>
      )}
    </main>
  );
}
