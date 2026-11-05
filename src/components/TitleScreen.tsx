import React, { useEffect, useRef, useState } from 'react';
import { sound } from '../utils/audio';
import { createCreditItem, CreditItem } from '../data/creditsData';
import { Play, Volume2, VolumeX, Sparkles, Crosshair, Swords, Trophy, Film, Eye } from 'lucide-react';

interface TitleScreenProps {
  onSelectMode: (mode: 'survivor' | 'invader' | 'anomaly') => void;
  highScores: {
    survivor: number;
    invader: number;
    anomaly: number;
  };
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onSelectMode, highScores }) => {
  const [selectedMode, setSelectedMode] = useState<'survivor' | 'invader' | 'anomaly'>('survivor');
  const [muted, setMuted] = useState<boolean>(sound.isMuted());
  const [isLetterbox, setIsLetterbox] = useState<boolean>(false);

  // Background animated credits state
  const bgCredits = useRef<Array<{ id: string; y: number; item: CreditItem }>>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    sound.startProjectorHum();
    return () => {
      sound.stopProjectorHum();
    };
  }, []);

  const toggleSound = () => {
    const next = sound.toggleMute();
    setMuted(next);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '1') {
        setSelectedMode('survivor');
      } else if (e.key === '2') {
        setSelectedMode('invader');
      } else if (e.key === '3') {
        setSelectedMode('anomaly');
      } else if (e.key === 'Enter' || e.key === ' ') {
        onSelectMode(selectedMode);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedMode, onSelectMode]);

  // Background ambient credits canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Initial background items
    const items: Array<{ id: string; y: number; item: CreditItem }> = [];
    let curY = 0;
    while (curY < height + 400) {
      items.push({
        id: `bg-${curY}`,
        y: curY,
        item: createCreditItem(),
      });
      curY += 54;
    }
    bgCredits.current = items;

    let lastTime = performance.now();
    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Clear
      ctx.fillStyle = '#060608';
      ctx.fillRect(0, 0, width, height);

      // Projector beam light
      const beam = ctx.createRadialGradient(width / 2, 0, 40, width / 2, height / 2, height);
      beam.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
      beam.addColorStop(0.7, 'rgba(255, 255, 255, 0.01)');
      beam.addColorStop(1, 'transparent');
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, width, height);

      // Sprocket holes on edges
      ctx.fillStyle = '#111111';
      for (let sy = (now * 0.04) % 36; sy < height; sy += 36) {
        ctx.fillRect(8, sy, 10, 18);
        ctx.fillRect(width - 18, sy, 10, 18);
      }

      // Move and render background credits
      const speed = 40;
      bgCredits.current.forEach((cred) => {
        cred.y -= speed * dt;

        ctx.save();
        ctx.globalAlpha = 0.35; // Dim background so title popups pop

        if (cred.item.isHeader) {
          ctx.font = 'bold 14px "Zen Kaku Gothic New", sans-serif';
          ctx.fillStyle = '#60a5fa';
          ctx.textAlign = 'center';
          ctx.fillText(cred.item.name, width / 2, cred.y);
        } else {
          ctx.font = '13px "Zen Kaku Gothic New", sans-serif';
          ctx.fillStyle = '#6b7280';
          ctx.textAlign = 'right';
          ctx.fillText(cred.item.role, width * 0.44, cred.y);

          ctx.font = '600 14px "Zen Kaku Gothic New", sans-serif';
          ctx.fillStyle = '#9ca3af';
          ctx.textAlign = 'left';
          ctx.fillText(cred.item.name, width * 0.52, cred.y);
        }

        ctx.restore();
      });

      // Spawn new
      const lowest = Math.max(...bgCredits.current.map((c) => c.y));
      if (lowest < height + 80) {
        bgCredits.current.push({
          id: `bg-${Date.now()}`,
          y: lowest + 54,
          item: createCreditItem(),
        });
      }
      bgCredits.current = bgCredits.current.filter((c) => c.y > -80);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const modes = [
    {
      id: 'survivor' as const,
      num: '1',
      title: 'クレジット・サバイバー',
      enTitle: 'CREDIT CLIMBER',
      desc: '急激に加速するエンドロール！ 爆破NG・ロケ弁回復・超加速暴走・ワイヤー急上昇など多彩なギミック足場を制覇せよ。',
      icon: Sparkles,
      color: 'from-amber-500/20 to-amber-700/10 border-amber-500/50 text-amber-400',
      tag: '高難度 / ギミックアクション',
      highScore: highScores.survivor,
    },
    {
      id: 'invader' as const,
      num: '2',
      title: 'エンドロール・インベーダー',
      enTitle: 'CREDITS INVADER',
      desc: '経験値(EXP)制で機体を多角強化（貫通弾・子機・カチンコボム）！ 回転防壁を操る強大な配給会社メガボスに挑め。',
      icon: Swords,
      color: 'from-cyan-500/20 to-blue-700/10 border-cyan-500/50 text-cyan-400',
      tag: '経験値育成 / ボス死闘',
      highScore: highScores.invader,
    },
    {
      id: 'anomaly' as const,
      num: '3',
      title: '違和感エンドロール捜査官',
      enTitle: 'GLITCH INSPECTOR',
      desc: '文字化け、超長名、怪しい黒幕役職、反転文字など、紛れ込んだ違和感を制限ライン前に検問特定！',
      icon: Eye,
      color: 'from-emerald-500/20 to-teal-700/10 border-emerald-500/50 text-emerald-400',
      tag: '観察力 / スポット捜査',
      highScore: highScores.anomaly,
    },
  ];

  return (
    <div className={`relative w-full h-full flex flex-col justify-between p-4 sm:p-8 overflow-y-auto select-none ${isLetterbox ? 'max-h-screen py-10 bg-neutral-950 border-y-8 border-black' : ''}`}>
      {/* Background canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

      {/* Top Header Bar */}
      <div className="relative z-10 flex justify-between items-center w-full max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
          <Film className="w-4 h-4 text-amber-400" />
          <span>CINEMA THEATER 2026 · NO. 8</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLetterbox(!isLetterbox)}
            className="px-2.5 py-1 text-[11px] bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition"
            title="シネマスコープ比率切替"
          >
            {isLetterbox ? 'FULL 16:9' : 'CINEMASCOPE'}
          </button>
          <button
            onClick={toggleSound}
            className="p-1.5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition"
            title="音量ミュート切替"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Hero Title Section */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto py-6 max-w-4xl mx-auto">
        {/* Bespoke inline SVG Cinema Title Lockup */}
        <div className="relative mb-3 flex items-center justify-center">
          <svg className="w-64 sm:w-80 h-16 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]" viewBox="0 0 320 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 32 H60 M260 32 H310" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="68" cy="32" r="6" stroke="#f59e0b" strokeWidth="2" fill="#050505" />
            <circle cx="252" cy="32" r="6" stroke="#f59e0b" strokeWidth="2" fill="#050505" />
            <text x="160" y="38" textAnchor="middle" fill="#ffffff" fontFamily="Cinzel, serif" fontWeight="900" fontSize="24" letterSpacing="4">
              THE END ROLLER
            </text>
          </svg>
        </div>

        <h1 className="text-xl sm:text-3xl font-black font-serif-jp tracking-tight text-white mb-2">
          エンドロール・プレイグラウンド
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-md font-sans">
          映画の余韻を覆す、白黒文字の世界で繰り広げられる3つのシネマティック・アクション。
        </p>

        {/* Mode Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full mt-6 text-left">
          {modes.map((m) => {
            const Icon = m.icon;
            const isSelected = selectedMode === m.id;

            return (
              <div
                key={m.id}
                onClick={() => setSelectedMode(m.id)}
                className={`relative group p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? `bg-neutral-900/90 shadow-xl scale-[1.02] ${m.color}`
                    : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900/60'
                }`}
              >
                {/* Mode Key Indicator */}
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700">
                    KEY [{m.num}]
                  </span>
                  <span className="text-[10px] text-neutral-400 font-medium">
                    {m.tag}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded-lg bg-neutral-800/80 ${isSelected ? 'text-white' : 'text-neutral-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white font-serif-jp">{m.title}</h3>
                    <div className="text-[10px] font-cinzel tracking-wider text-neutral-400">{m.enTitle}</div>
                  </div>
                </div>

                <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed mt-2 min-h-[3rem]">
                  {m.desc}
                </p>

                {/* High score cluster */}
                <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-amber-500" />
                    BEST RECORD
                  </span>
                  <span className="font-bold text-amber-300 tabular-nums">
                    {m.highScore.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Game Action */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={() => onSelectMode(selectedMode)}
            className="flex items-center gap-2.5 px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black text-sm tracking-wide rounded-full shadow-[0_0_24px_rgba(245,158,11,0.35)] hover:shadow-[0_0_32px_rgba(245,158,11,0.5)] transition active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>開演する (SPACE / ENTER)</span>
          </button>
          <div className="text-[11px] text-neutral-500 font-mono tracking-wide">
            [1 / 2 / 3] モード選択 · [SPACE] 決定 · [ESC] 一時停止
          </div>
        </div>
      </div>

      {/* Bottom Footer Credits */}
      <div className="relative z-10 flex justify-between items-center text-[10px] text-neutral-500 border-t border-neutral-900 pt-3 max-w-5xl mx-auto w-full">
        <span>© 2026 THE END ROLLER PRODUCTION COMMITTEE</span>
        <span>SOUND: PROCEDURAL WEB AUDIO SYNTH · 60FPS ENGINE</span>
      </div>
    </div>
  );
};
