"use client";

import { useState, useMemo, useEffect } from "react";
import { Play, Dice5, MapPin, Bug, Zap, Ghost, MousePointer2, Sparkles, RefreshCcw, Trash2, Paintbrush, CheckCircle2 } from "lucide-react";

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
  const [beeMoves, setBeeMoves] = useState(10);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

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

  const getNextPosition = (current: number, move: number, currentTiles: Tile[]): number => {
    let next = (current + move) % 40;
    if (next < 0) next += 40;

    const tile = currentTiles[next];
    switch (tile.effect) {
      case "ROCKET": return getNextPosition(next, 10, currentTiles);
      case "MOLE_2": return getNextPosition(next, -2, currentTiles);
      case "MOLE_3": return getNextPosition(next, -3, currentTiles);
      case "SPRING": return getNextPosition(next, 3, currentTiles);
      default: return next;
    }
  };

  const getFinalReward = (position: number, moveIndex: number, beeExpiry: number, currentTiles: Tile[]): number => {
    const tile = currentTiles[position];
    const baseReward = tile.effect === "QUESTION" ? 232.5 : tile.reward;

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

  const calculateOptimalPath = () => {
    const dice = diceValues;

    const getSpecialOutcomes = (D: number) => [
      { move: D * 2, mul: 1 },
      { move: D * 3, mul: 1 },
      { move: D, mul: 2 },
      { move: D - 5, mul: 1 },
      { move: D - 10, mul: 1 },
      { move: D * -3, mul: 1 }
    ];

    type OutcomeItem = { move: number, mul: number, original: number };

    const evaluateOutcome = (outcome: OutcomeItem[]) => {
      let maxScore = -1;
      let bestFinalPos = 0;
      let bestPerm: number[] = [];
      const perms = generatePermutations(outcome);
      for (const perm of perms) {
        let tempPos = currentPos;
        let tempTotal = 0;
        perm.forEach((die, idx) => {
          tempPos = getNextPosition(tempPos, die.move, tiles);
          tempTotal += getFinalReward(tempPos, idx + 1, beeMoves, tiles) * die.mul;
        });
        if (tempTotal > maxScore) {
          maxScore = tempTotal;
          bestFinalPos = tempPos;
          bestPerm = perm.map(d => d.original);
        }
      }
      return { maxScore, bestFinalPos, bestPerm };
    };

    const baseOutcome: OutcomeItem[] = dice.map(d => ({ move: d, mul: 1, original: d }));
    const baseResult = evaluateOutcome(baseOutcome);

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
        const { maxScore } = evaluateOutcome(outcome);
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
    if (index === 0 || index === 10 || index === 20 || index === 30) return;
    setTiles(prev => prev.map(t => {
      if (t.index !== index) return t;
      if (activeBrush === "REWARD") return { ...t, reward: brushReward };
      if (activeBrush === "EFFECT") {
        return { ...t, effect: t.effect === brushEffect ? "NONE" : brushEffect };
      }
      if (activeBrush === "MODIFIER") {
        return { ...t, modifier: t.modifier === brushModifier ? "NONE" : brushModifier };
      }
      return t;
    }));
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
        <button onClick={() => {
          if (confirm("보드 전체 정보를 초기 상태로 되돌리시겠습니까?")) {
            setTiles(initialTiles);
            setDiceValues([2, 3, 5]);
            setCurrentPos(0);
            setBeeMoves(10);
            setResult(null);
          }
        }} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-rose-500 hover:bg-rose-50 active:scale-95 transition-all shadow-sm">보드 초기화</button>
      </header>

      <div className="max-w-7xl mx-auto flex flex-col xl:flex-row gap-8 items-start">
        <div className="w-full xl:w-[320px] shrink-0 space-y-6">
          <section className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">도구 선택 (브러시)</h3>

            <div className={`p-4 rounded-2xl border-2 transition-all ${activeBrush === "REWARD" ? 'border-green-500 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setActiveBrush("REWARD")} className="w-full text-left text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">보상 점수 칠하기 {activeBrush === "REWARD" && <CheckCircle2 size={14} className="text-green-600" />}</button>
              <div className="grid grid-cols-2 gap-2">
                {[100, 300, 400, 600].map((pts) => (
                  <button key={pts} onClick={() => { setBrushReward(pts); setActiveBrush("REWARD"); }} className={`py-3 rounded-xl font-black text-lg transition-all ${brushReward === pts && activeBrush === "REWARD" ? 'bg-green-600 text-white shadow-md' : 'bg-white text-slate-400 border-2 border-transparent'}`}>{pts}</button>
                ))}
              </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 transition-all ${activeBrush === "EFFECT" ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setActiveBrush("EFFECT")} className="w-full text-left text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">발판 효과 칠하기 {activeBrush === "EFFECT" && <CheckCircle2 size={14} className="text-blue-600" />}</button>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "MOLE_2", label: "두더지 (-2)" }, { key: "MOLE_3", label: "두더지 (-3)" },
                  { key: "SPRING", label: "스프링 (+3)" }, { key: "NONE", label: "지우개" }
                ].map((eff) => (
                  <button key={eff.key} onClick={() => { setBrushEffect(eff.key as EffectType); setActiveBrush("EFFECT"); }} className={`p-2 rounded-lg text-[10px] font-black transition-all ${brushEffect === eff.key && activeBrush === "EFFECT" ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200 hover:border-blue-300'}`}>{eff.label}</button>
                ))}
              </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 transition-all ${activeBrush === "MODIFIER" ? 'border-orange-500 bg-orange-50' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setActiveBrush("MODIFIER")} className="w-full text-left text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">몬스터 배치하기 {activeBrush === "MODIFIER" && <CheckCircle2 size={14} className="text-orange-600" />}</button>
              <div className="grid grid-cols-2 gap-2">
                {[{ key: "GOLDEN_BEE", label: "황금벌" }, { key: "HOMUNCULUS", label: "호문스" }, { key: "MYSTERIOUS_BEE", label: "신비벌" }, { key: "NONE", label: "지우개" }].map((mod) => (
                  <button key={mod.key} onClick={() => { setBrushModifier(mod.key as ModifierType); setActiveBrush("MODIFIER"); }} className={`p-2 rounded-lg text-[10px] font-black transition-all ${brushModifier === mod.key && activeBrush === "MODIFIER" ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200 hover:border-orange-300'}`}>{mod.label}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-6 shadow-2xl space-y-6 text-white">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase flex justify-between items-center">
                  <span>주사위 선택</span>
                  <span className="text-[8px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">클릭하여 숫자 변경</span>
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
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase flex justify-between items-center">
                  <span>현재 위치</span>
                  {activeBrush === "POSITION" && <span className="text-[8px] text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded animate-pulse">보드를 클릭하세요</span>}
                </label>
                <button
                  onClick={() => setActiveBrush("POSITION")}
                  className={`w-full py-3 rounded-xl border font-black text-center text-2xl outline-none transition-all shadow-inner ${activeBrush === "POSITION" ? 'bg-green-500/20 border-green-400 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-white/10 border-white/10 hover:bg-white/20'}`}
                >
                  {currentPos}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase">신비한 벌 남은 이동 횟수</label>
              <input type="number" className="w-full p-3 bg-white/10 rounded-xl border border-white/10 font-black text-center text-xl outline-none focus:border-green-400" value={beeMoves} onChange={(e) => setBeeMoves(parseInt(e.target.value) || 0)} />
            </div>
            <button onClick={calculateOptimalPath} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-2xl font-black text-lg shadow-lg transition-all flex items-center justify-center gap-2">
              <Play size={20} /> 최적 경로 즉시 계산
            </button>
          </section>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="bg-white p-6 md:p-8 rounded-[3rem] shadow-2xl border border-slate-200 relative overflow-hidden">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gridTemplateRows: 'repeat(11, 1fr)', gap: '6px' }} className="relative z-10">
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
                <div className="w-[85%] max-h-[85%] max-w-2xl overflow-y-auto pointer-events-auto bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-5 md:p-6 shadow-[0_0_50px_rgba(0,0,0,0.15)] border border-slate-200/50 animate-in zoom-in-95 duration-500 flex flex-col gap-4 mx-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <div className="bg-green-600 rounded-[2rem] p-5 shadow-lg text-white border-b-4 border-green-800 flex flex-row items-center justify-around text-center gap-4 shrink-0">
                    <div><p className="text-[10px] font-black text-green-200 uppercase mb-1">최적 주사위 순서</p><p className="text-3xl md:text-5xl font-black italic tracking-tighter">{result.order.join(" ➔ ")}</p></div>
                    <div className="hidden md:block w-px h-12 bg-white/20" />
                    <div><p className="text-[10px] font-black text-green-200 uppercase mb-1">확정 점수</p><p className="text-2xl md:text-4xl font-black">{Math.floor(result.totalReward).toLocaleString()} <span className="text-xs opacity-60">PTS</span></p></div>
                  </div>

                  {result.specialAnalyses && result.specialAnalyses.length > 0 && (
                    <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-xl shrink-0">
                      <h4 className="text-sm md:text-base font-black mb-4 flex items-center justify-center xl:justify-start gap-2 text-purple-400"><Sparkles size={16} /> 특수 기대값 분석 (Top 3)</h4>
                      <div className="space-y-3">
                        {result.specialAnalyses.slice(0, 3).map((analysis, i) => (
                          <div key={i} className="flex flex-row items-center justify-between bg-slate-800 p-3 md:p-4 rounded-xl shadow-inner gap-2 md:gap-3 border border-slate-700 hover:border-slate-500 transition-colors">
                              <div className="flex-1 text-left flex flex-col justify-center">
                                <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                                  <span className="text-[9px] md:text-[10px] font-black text-slate-400">대상 주사위</span>
                                  <div className="flex gap-1.5">
                                    {diceValues.map((val, dIdx) => {
                                      const isTarget = analysis.targetIndices.includes(dIdx);
                                      return (
                                        <div key={dIdx} className={`w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-[6px] font-black text-[10px] md:text-xs border transition-all ${isTarget ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_10px_rgba(168,85,247,0.7)] scale-110 z-10' : 'bg-slate-700 border-slate-600 text-slate-400 opacity-50'}`}>
                                          {val}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center justify-start gap-2 md:gap-4 text-[8px] md:text-[10px] font-bold text-slate-500 bg-slate-900/50 p-1.5 md:p-2 rounded-lg inline-flex w-fit">
                                <span className="text-green-400">경신: {analysis.winProb.toFixed(0)}%</span>
                                <span className="text-rose-400">하락: {analysis.loseProb.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase">기대 평균</p>
                              <p className="text-lg md:text-2xl font-black text-purple-300 leading-none my-1">{Math.floor(analysis.expectedValue).toLocaleString()}</p>
                              <p className="text-[8px] md:text-[10px] text-slate-500 font-bold mt-1">최대: {Math.floor(analysis.maxPossible).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
