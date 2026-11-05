import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { RotateCcw, Home, Trophy, Sparkles } from 'lucide-react';

interface GameOverModalProps {
  mode: 'survivor' | 'invader' | 'anomaly';
  score: number;
  isNewHigh: boolean;
  stats: Record<string, number | string>;
  onRetry: () => void;
  onHome: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  mode,
  score,
  isNewHigh,
  stats,
  onRetry,
  onHome,
}) => {
  useEffect(() => {
    if (isNewHigh && score > 0) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#38bdf8', '#ffffff'],
        });
      } catch {}
    }
  }, [isNewHigh, score]);

  const modeTitles = {
    survivor: { en: 'CREDIT CLIMBER', ja: 'クレジット・サバイバー' },
    invader: { en: 'CREDITS INVADER', ja: 'エンドロール・インベーダー' },
    anomaly: { en: 'GLITCH INSPECTOR', ja: '違和感エンドロール捜査官' },
  };

  return (
    <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      {/* Cinema Ticket Stub Style Card */}
      <div className="relative max-w-sm w-full bg-neutral-900 border-2 border-neutral-700 rounded-xl overflow-hidden shadow-2xl text-neutral-100">
        {/* Ticket Header */}
        <div className="bg-gradient-to-r from-neutral-800 via-neutral-800 to-neutral-900 p-4 border-b border-neutral-700/80 text-center relative">
          <div className="text-[10px] tracking-widest text-amber-400 font-cinzel font-bold">
            CINEMA ADMISSION & SCORE RECEIPT
          </div>
          <h2 className="text-xl font-black font-serif-jp tracking-tight text-white mt-0.5">
            上映終了 · THE END
          </h2>
          <div className="text-xs text-neutral-400 mt-0.5">
            {modeTitles[mode].ja} ({modeTitles[mode].en})
          </div>

          {/* Film perforated holes decor */}
          <div className="absolute -bottom-2 inset-x-0 flex justify-between px-2">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-black/90 border border-neutral-800" />
            ))}
          </div>
        </div>

        {/* Ticket Body */}
        <div className="p-6 pt-5 space-y-5">
          {/* High score badge */}
          {isNewHigh && (
            <div className="flex items-center justify-center gap-1.5 py-1 px-3 bg-amber-500/20 border border-amber-500/60 rounded-full text-amber-300 text-xs font-bold animate-pulse">
              <Trophy className="w-3.5 h-3.5" />
              <span>★ NEW RECORD / 新記録樹立! ★</span>
            </div>
          )}

          {/* Final Score Cluster */}
          <div className="text-center py-2 bg-neutral-950/60 rounded-lg border border-neutral-800">
            <div className="text-[11px] text-neutral-400 tracking-widest font-mono">FINAL SCORE</div>
            <div className="font-mono text-3xl font-black text-amber-300 tracking-tight tabular-nums mt-0.5">
              {score.toLocaleString()}
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(stats).map(([k, v]) => {
              let label = k;
              if (k === 'time') label = '生存時間';
              if (k === 'jumps') label = 'ジャンプ数';
              if (k === 'stars') label = '獲得スター';
              if (k === 'wave') label = '到達WAVE';
              if (k === 'defeated') label = '撃墜スタッフ';
              if (k === 'bossesDefeated') label = '配給ボス撃破';
              if (k === 'caught') label = '特定違和感数';
              if (k === 'missed') label = '見逃し回数';
              if (k === 'maxCombo') label = '最大コンボ';
              if (k === 'trapsSurvived') label = 'ギミック回避数';
              if (k === 'shipLevel') label = '機体到達Lv';

              return (
                <div key={k} className="bg-neutral-800/50 p-2.5 rounded border border-neutral-700/50">
                  <div className="text-neutral-400 text-[10px]">{label}</div>
                  <div className="font-mono font-bold text-sm text-neutral-200 mt-0.5 tabular-nums">
                    {typeof v === 'number' && k === 'time' ? `${v}秒` : v}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={onRetry}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-sm transition shadow-lg"
            >
              <RotateCcw className="w-4 h-4" />
              <span>もう一度アンコール (再挑戦)</span>
            </button>
            <button
              onClick={onHome}
              className="flex items-center justify-center gap-2 w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm border border-neutral-700 transition"
            >
              <Home className="w-4 h-4" />
              <span>演目選択に戻る (タイトル)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
